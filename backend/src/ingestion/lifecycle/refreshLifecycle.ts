// backend/src/ingestion/lifecycle/refreshLifecycle.ts
import type { Types } from "mongoose";
import { IngestionRun, Tor } from "../../models";
import type { IProcurement } from "../../models";
import { EgpClient, egpConfigFromEnv } from "../../scraper/egpClient";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import { GprocClient, gprocConfigFromEnv, gprocEnabled } from "../../scraper/gprocClient";
import type { GprocClientLike } from "../../scraper/gprocClient.types";
import { sweepStaleRuns } from "../enrichment/sweepStaleRuns";
import { logIngestionEvent } from "../log";
import { mergeProcurement } from "../procurementStage";
import { writeProcurementIfUnchanged } from "../procurementWrite";
import { getStorage } from "../../storage";
import type { BlobStorage } from "../../storage/storage.types";
import type { BidDeadlineExtractor } from "../enrichment/torExtractor";
import {
  lifecycleFilter,
  maxDeadlineExtractionsPerRun,
  maxLifecycleRefreshPerRun,
} from "./candidates";
import { latestInvitation, runDeadlineStep } from "./deadlineStep";
import type { DeadlineStepOutcome } from "./deadlineStep";
import { loadFreshProcurement } from "./loadFresh";

export interface RefreshLifecycleDeps {
  client?: EgpClientLike;
  /** The national e-GP (process5) source; defaults to a real client when GPROC_ENABLED, otherwise none. */
  gprocClient?: GprocClientLike;
  /** Max TORs to check this run; defaults to MAX_LIFECYCLE_REFRESH_PER_RUN. */
  maxTors?: number;
  now?: () => Date;
  trigger?: "manual" | "scheduled";
  triggeredBy?: string | null;
  /** Reads invitation PDFs for TORs that have an invitation; the deadline step is off when omitted. */
  deadlineExtractor?: BidDeadlineExtractor;
  storage?: BlobStorage;
  /** Max Gemini deadline reads this run; defaults to MAX_DEADLINE_EXTRACTIONS_PER_RUN. */
  maxDeadlineExtractions?: number;
  /**
   * Restrict the refresh to these TORs (still only those matching `lifecycleFilter()`). The cap
   * then defaults to the list length instead of MAX_LIFECYCLE_REFRESH_PER_RUN.
   */
  torIds?: ReadonlyArray<string | Types.ObjectId>;
  /** Manual option: check only TORs whose stored stage is "inviting" (open for bids). */
  onlyOpen?: boolean;
}

export interface RefreshLifecycleResult {
  /** "" when nothing was eligible (no run row is written then). */
  runId: string;
  selected: number;
  changed: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

const COMPONENT = "lifecycleRefresh";

function announcementSignature(p: IProcurement): string {
  return p.announcements
    .map(
      (a) =>
        `${a.announcementId}|${a.kind}|${a.publishedAt ? new Date(a.publishedAt).getTime() : ""}|${a.hasFile}`
    )
    .join(";");
}

/** True when the refresh moved the stage, the contract status or the announcement set. */
export function procurementChanged(
  before: IProcurement | null | undefined,
  after: IProcurement
): boolean {
  if (!before) return true;
  if (before.stage !== after.stage) return true;
  if ((before.source ?? "egp2") !== (after.source ?? "egp2")) return true;
  if ((before.contractStatus ?? null) !== (after.contractStatus ?? null)) return true;
  return announcementSignature(before) !== announcementSignature(after);
}

/**
 * Re-check existing TORs and refresh their `procurement`: decides the stage from the national e-GP
 * (process5) with the BMA portal as fallback. Never touches the
 * source hash or pipeline status and never enqueues AI work — a status check itself costs no
 * Gemini call. The one exception is the optional deadline step: for a TOR with an invitation
 * (any stage) it reads the latest invitation PDF with one small, separate Gemini call, once per invitation id and
 * capped per run by MAX_DEADLINE_EXTRACTIONS_PER_RUN.
 */
export async function refreshLifecycle(
  deps: RefreshLifecycleDeps = {}
): Promise<RefreshLifecycleResult> {
  const client = deps.client ?? new EgpClient(egpConfigFromEnv());
  const now = deps.now ?? (() => new Date());
  const gproc = deps.gprocClient ?? (gprocEnabled() ? new GprocClient(gprocConfigFromEnv()) : undefined);
  const cap = deps.maxTors ?? (deps.torIds ? deps.torIds.length : maxLifecycleRefreshPerRun());
  let extractor = deps.deadlineExtractor;
  const deadlineCap = deps.maxDeadlineExtractions ?? maxDeadlineExtractionsPerRun();
  let storage: BlobStorage | null = null;
  let storageError: Error | null = null;
  if (extractor) {
    try {
      storage = deps.storage ?? getStorage();
    } catch (err) {
      // A storage misconfiguration must not stop the status refresh: run without the deadline step.
      storageError = err as Error;
      extractor = undefined;
      console.error("lifecycle refresh without deadline extraction:", err);
    }
  }
  let deadlinesRead = 0;
  let deadlinesUnreadable = 0;
  let deadlinesFailed = 0;
  const gprocStage = { ok: 0, "not-found": 0, error: 0 };
  // Circuit breaker: after this many CONSECUTIVE process5 errors the rest of the run uses egp2 only.
  const GPROC_BREAKER = 3;
  let gprocConsecutiveErrors = 0;
  let gprocPaused = false;
  let gprocPauseLogged = false;
  const emptyTally = () => ({ read: 0, unreadable: 0, errors: 0 });
  const bySource = { gproc: emptyTally(), egp2: emptyTally() };
  const SOURCE_LABEL = { gproc: "process5", egp2: "BMA portal" } as const;

  await sweepStaleRuns("lifecycle");

  const candidateFilter = lifecycleFilter({ gproc: Boolean(gproc), onlyOpen: deps.onlyOpen });
  // A missing lastCheckedAt sorts before any date, so never-checked TORs come first.
  const tors = await Tor.find(
    deps.torIds ? { $and: [candidateFilter, { _id: { $in: [...deps.torIds] } }] } : candidateFilter
  )
    .sort({ "procurement.lastCheckedAt": 1, _id: 1 })
    .limit(cap)
    .select("projectCode title sourceListingUrl procurement")
    .lean();
  if (tors.length === 0) {
    return { runId: "", selected: 0, changed: 0, unchanged: 0, skipped: 0, failed: 0 };
  }

  const run = await IngestionRun.create({
    trigger: deps.trigger ?? "scheduled",
    triggeredBy: deps.triggeredBy ?? null,
    phase: "lifecycle",
    status: "running",
    stats: { torsFound: tors.length },
  });
  const runId = run._id as Types.ObjectId;

  if (storageError) {
    await logIngestionEvent({
      severity: "warning",
      message: `bid deadline step disabled for this run: storage unavailable (${storageError.message})`,
      component: COMPONENT,
      ingestionRunId: runId,
    });
  }

  /** One info line per open (inviting) TOR: which source gave its bid deadline, and whether it worked. */
  const logOpenTorDeadline = async (
    tor: { _id: Types.ObjectId; projectCode?: string | null },
    merged: IProcurement,
    source: "gproc" | "egp2",
    outcome: DeadlineStepOutcome | "error" | "capped",
    err?: Error
  ) => {
    if (merged.stage !== "inviting") return;
    if (outcome === "skipped") return; // already read for this invitation: nothing happened this run
    const label = tor.projectCode ?? String(tor._id);
    let text: string;
    if (outcome === "read" || outcome === "cleared") {
      const saved = await Tor.findById(tor._id).select("procurement.bidDeadline").lean();
      const d = saved?.procurement?.bidDeadline;
      text = d ? `read ok, ${d.precision === "month" ? "month only" : "day"} ${d.date.toISOString()}` : "no deadline stored";
    } else if (outcome === "unreadable") text = "PDF read but no deadline found";
    else if (outcome === "conflict") text = "not stored (TOR changed meanwhile), retry next run";
    else if (outcome === "capped") text = "not attempted (MAX_DEADLINE_EXTRACTIONS_PER_RUN reached)";
    else text = `failed (${err?.message ?? "error"})`;
    await logIngestionEvent({
      severity: outcome === "error" ? "warning" : "info",
      message: `open TOR ${label}: bid deadline from ${SOURCE_LABEL[source]}: ${text}`,
      component: COMPONENT,
      ingestionRunId: runId,
    });
  };

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;
  const flush = () =>
    IngestionRun.updateOne(
      { _id: runId },
      {
        $set: {
          "stats.torsUpdated": changed,
          "stats.torsUnchanged": unchanged,
          "stats.torsSkipped": skipped,
          "stats.torsFailed": failed,
        },
      }
    );

  try {
    for (const tor of tors) {
      const label = tor.projectCode ?? String(tor._id);
      try {
        const loaded = await loadFreshProcurement({
          tor,
          egp: client,
          gproc: gprocPaused ? undefined : gproc,
          now,
          warn: (message) =>
            logIngestionEvent({ severity: "warning", message, component: COMPONENT, ingestionRunId: runId }),
          report: (attempt) => {
            gprocStage[attempt] += 1;
            if (attempt === "error") {
              gprocConsecutiveErrors += 1;
              if (gprocConsecutiveErrors >= GPROC_BREAKER) gprocPaused = true;
            } else gprocConsecutiveErrors = 0;
          },
        });
        if (gprocPaused && !gprocPauseLogged) {
          gprocPauseLogged = true;
          await logIngestionEvent({
            severity: "warning",
            message: `process5 paused for the rest of this run after ${GPROC_BREAKER} consecutive errors; using the BMA portal`,
            component: COMPONENT,
            ingestionRunId: runId,
          });
        }
        if (loaded === "skip") {
          skipped += 1;
          // Otherwise a TOR nobody can answer for keeps the oldest lastCheckedAt and sits at the head of the
          // oldest-first queue on every run. Only the check time moves; nothing else is touched.
          if (tor.procurement) {
            await Tor.updateOne({ _id: tor._id }, { $set: { "procurement.lastCheckedAt": now() } }, { timestamps: false });
          }
          await logIngestionEvent({
            severity: "warning",
            message: `lifecycle refresh skipped TOR ${label}: no e-GP project id (no listing URL and process5 could not answer)`,
            component: COMPONENT,
            ingestionRunId: runId,
          });
        } else {
          const merged = mergeProcurement(tor.procurement, loaded.fresh);
          const didChange = procurementChanged(tor.procurement, merged);
          const written = await writeProcurementIfUnchanged(tor._id, tor.procurement, merged);
          if (!written) {
            skipped += 1;
            await logIngestionEvent({
              severity: "warning",
              message: `lifecycle refresh skipped TOR ${label}: it changed while being checked; will retry next run`,
              component: COMPONENT,
              ingestionRunId: runId,
            });
          } else {
            if (didChange) changed += 1;
            else unchanged += 1;

            // Fell back to egp2 for a TOR whose deadline was read from process5: the egp2 invitation has a
            // different id, so re-reading it could overwrite a good deadline. Leave the deadline alone.
            const keepGprocDeadline =
              loaded.source === "egp2" && Boolean(tor.procurement?.deadlineAttempt?.announcementId?.startsWith("gproc-"));
            if (keepGprocDeadline) {
              // nothing to do
            } else if (extractor && storage && deadlinesRead + deadlinesUnreadable + deadlinesFailed < deadlineCap) {
              const tally = bySource[loaded.source];
              let stepOutcome: DeadlineStepOutcome | "error";
              let stepError: Error | undefined;
              try {
                const outcome = await runDeadlineStep(
                  {
                    torId: tor._id,
                    projectCode: tor.projectCode,
                    title: tor.title,
                    procurement: merged,
                    filenames: loaded.filenames,
                    loadPdf: loaded.loadPdf,
                  },
                  { client, storage, extractor, now }
                );
                if (outcome === "read") {
                  deadlinesRead += 1;
                  tally.read += 1;
                } else if (outcome === "unreadable") {
                  deadlinesUnreadable += 1;
                  tally.unreadable += 1;
                } else if (outcome === "conflict") {
                  await logIngestionEvent({
                    severity: "warning",
                    message: `bid deadline for TOR ${label} not stored: it changed while being read; will retry next run`,
                    component: COMPONENT,
                    ingestionRunId: runId,
                  });
                }
                stepOutcome = outcome;
              } catch (err) {
                stepOutcome = "error";
                stepError = err as Error;
                deadlinesFailed += 1;
                tally.errors += 1;
                await logIngestionEvent({
                  severity: "error",
                  message: `bid deadline read failed for TOR ${label}: ${(err as Error).message}`,
                  component: COMPONENT,
                  context: { torId: String(tor._id), stack: (err as Error).stack },
                  ingestionRunId: runId,
                });
              }
              await logOpenTorDeadline(tor, merged, loaded.source, stepOutcome, stepError);
            } else if (merged.stage === "inviting" && extractor && storage) {
              // only a TOR that would really have been read (no attempt for its latest invitation yet)
              const inv = latestInvitation(merged);
              if (inv && merged.deadlineAttempt?.announcementId !== inv.announcementId) {
                await logOpenTorDeadline(tor, merged, loaded.source, "capped");
              }
            }
          }
        }
      } catch (err) {
        failed += 1;
        await logIngestionEvent({
          severity: "error",
          message: `lifecycle refresh failed for TOR ${label}: ${(err as Error).message}`,
          component: COMPONENT,
          context: { torId: String(tor._id), stack: (err as Error).stack },
          ingestionRunId: runId,
        });
      }
      await flush();
    }

    const status =
      failed === 0 ? "success" : changed + unchanged + skipped === 0 ? "failed" : "partial";
    const t = bySource;
    const bySourceText = (s: "gproc" | "egp2") =>
      `${SOURCE_LABEL[s]} read ${t[s].read}, unreadable ${t[s].unreadable}, errors ${t[s].errors}`;
    const deadlineSummary =
      deadlinesRead + deadlinesUnreadable + deadlinesFailed > 0
        ? `; bid deadlines: read ${deadlinesRead}, unreadable ${deadlinesUnreadable}, errors ${deadlinesFailed}` +
          (gproc ? ` (${bySourceText("gproc")}; ${bySourceText("egp2")})` : "")
        : "";
    const fellBack = gprocStage["not-found"] + gprocStage.error;
    const stageSummary = gproc
      ? `; stage source: process5 ok ${gprocStage.ok}, fell back to BMA portal ${fellBack} (project unknown to process5 ${gprocStage["not-found"]}, process5 error ${gprocStage.error})${gprocPaused ? `; process5 paused after ${GPROC_BREAKER} consecutive errors` : ""}`
      : "";
    const outcomeSummary = `checked ${tors.length}, changed ${changed}, unchanged ${unchanged}, skipped ${skipped}, failed ${failed}${stageSummary}${deadlineSummary}${deps.onlyOpen ? "; only open TORs" : ""}`;
    await IngestionRun.updateOne(
      { _id: runId },
      { $set: { completedAt: new Date(), status, outcomeSummary } }
    );
    await logIngestionEvent({
      severity: "info",
      message: outcomeSummary,
      component: COMPONENT,
      ingestionRunId: runId,
    });
  } catch (fatal) {
    const outcomeSummary = `lifecycle refresh aborted: ${(fatal as Error).message}`;
    await IngestionRun.updateOne(
      { _id: runId },
      { $set: { completedAt: new Date(), status: "failed", outcomeSummary } }
    );
    await logIngestionEvent({
      severity: "error",
      message: outcomeSummary,
      component: COMPONENT,
      context: { stack: (fatal as Error).stack },
      ingestionRunId: runId,
    });
  }

  return { runId: runId.toString(), selected: tors.length, changed, unchanged, skipped, failed };
}

export default refreshLifecycle;
