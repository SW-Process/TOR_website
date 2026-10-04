// backend/src/ingestion/lifecycle/refreshLifecycle.ts
import type { Types } from "mongoose";
import { IngestionRun, Tor } from "../../models";
import type { IProcurement } from "../../models";
import { EgpClient, egpConfigFromEnv } from "../../scraper/egpClient";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import { sweepStaleRuns } from "../enrichment/sweepStaleRuns";
import { logIngestionEvent } from "../log";
import { buildProcurement, mergeProcurement } from "../procurementStage";
import { writeProcurementIfUnchanged } from "../procurementWrite";
import { getStorage } from "../../storage";
import type { BlobStorage } from "../../storage/storage.types";
import type { BidDeadlineExtractor } from "../enrichment/torExtractor";
import {
  lifecycleFilter,
  maxDeadlineExtractionsPerRun,
  maxLifecycleRefreshPerRun,
  projectIdFromListingUrl,
} from "./candidates";
import { runDeadlineStep } from "./deadlineStep";

export interface RefreshLifecycleDeps {
  client?: EgpClientLike;
  /** Max TORs to check this run; defaults to MAX_LIFECYCLE_REFRESH_PER_RUN. */
  maxTors?: number;
  now?: () => Date;
  trigger?: "manual" | "scheduled";
  triggeredBy?: string | null;
  /** Reads invitation PDFs for `inviting` TORs; the deadline step is off when omitted. */
  deadlineExtractor?: BidDeadlineExtractor;
  storage?: BlobStorage;
  /** Max Gemini deadline reads this run; defaults to MAX_DEADLINE_EXTRACTIONS_PER_RUN. */
  maxDeadlineExtractions?: number;
  /**
   * Restrict the refresh to these TORs (still only those matching `lifecycleFilter()`). The cap
   * then defaults to the list length instead of MAX_LIFECYCLE_REFRESH_PER_RUN.
   */
  torIds?: ReadonlyArray<string | Types.ObjectId>;
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
  if ((before.contractStatus ?? null) !== (after.contractStatus ?? null)) return true;
  return announcementSignature(before) !== announcementSignature(after);
}

/**
 * Re-check existing TORs against e-GP and refresh their `procurement`. Never touches the
 * source hash or pipeline status and never enqueues AI work — a status check itself costs no
 * Gemini call. The one exception is the optional deadline step: for a TOR that is `inviting` it
 * reads the latest invitation PDF with one small, separate Gemini call, once per invitation id and
 * capped per run by MAX_DEADLINE_EXTRACTIONS_PER_RUN.
 */
export async function refreshLifecycle(
  deps: RefreshLifecycleDeps = {}
): Promise<RefreshLifecycleResult> {
  const client = deps.client ?? new EgpClient(egpConfigFromEnv());
  const now = deps.now ?? (() => new Date());
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

  await sweepStaleRuns("lifecycle");

  // A missing lastCheckedAt sorts before any date, so never-checked TORs come first.
  const tors = await Tor.find(
    deps.torIds ? { $and: [lifecycleFilter(), { _id: { $in: [...deps.torIds] } }] } : lifecycleFilter()
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
        const projectId = projectIdFromListingUrl(tor.sourceListingUrl);
        if (!projectId) {
          skipped += 1;
          await logIngestionEvent({
            severity: "warning",
            message: `lifecycle refresh skipped TOR ${label}: no e-GP project id in its listing URL`,
            component: COMPONENT,
            ingestionRunId: runId,
          });
        } else {
          const detail = await client.projectDetail(projectId);
          const announcements = await client.announcements(projectId);
          const fresh = buildProcurement(announcements, detail.masterContractAvailableName, now());
          const merged = mergeProcurement(tor.procurement, fresh);
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

            if (extractor && storage && deadlinesRead + deadlinesUnreadable + deadlinesFailed < deadlineCap) {
              try {
                const outcome = await runDeadlineStep(
                  {
                    torId: tor._id,
                    projectCode: tor.projectCode,
                    title: tor.title,
                    procurement: merged,
                    filenames: new Map(
                      announcements.flatMap((a) => (a.id && a.projectAnnouncementPath ? [[a.id, a.projectAnnouncementPath] as const] : []))
                    ),
                  },
                  { client, storage, extractor, now }
                );
                if (outcome === "read") deadlinesRead += 1;
                else if (outcome === "unreadable") deadlinesUnreadable += 1;
                else if (outcome === "conflict") {
                  await logIngestionEvent({
                    severity: "warning",
                    message: `bid deadline for TOR ${label} not stored: it changed while being read; will retry next run`,
                    component: COMPONENT,
                    ingestionRunId: runId,
                  });
                }
              } catch (err) {
                deadlinesFailed += 1;
                await logIngestionEvent({
                  severity: "error",
                  message: `bid deadline read failed for TOR ${label}: ${(err as Error).message}`,
                  component: COMPONENT,
                  context: { torId: String(tor._id), stack: (err as Error).stack },
                  ingestionRunId: runId,
                });
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
    const deadlineSummary =
      deadlinesRead + deadlinesUnreadable + deadlinesFailed > 0
        ? `; bid deadlines: read ${deadlinesRead}, unreadable ${deadlinesUnreadable}, errors ${deadlinesFailed}`
        : "";
    const outcomeSummary = `checked ${tors.length}, changed ${changed}, unchanged ${unchanged}, skipped ${skipped}, failed ${failed}${deadlineSummary}`;
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
