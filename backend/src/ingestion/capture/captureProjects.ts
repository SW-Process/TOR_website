import { createHash } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
import { IngestionRun, Tor } from "../../models";
import type { ITor } from "../../models/Tor";
import type { GprocCaptureClientLike } from "../../scraper/gprocClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import { enqueue } from "../enrichment/enrichmentJobRepo";
import { gprocProjectUrl } from "../gprocUrl";
import { logIngestionEvent } from "../log";
import type { PdfParseFn } from "../pdfInspect";
import { looksSoftwareRelated } from "../softwareKeywordGate";
import { storeTorPdf } from "../storeTorPdf";
import { agencyMatches, captureAgencies } from "./agencies";
import { mapGprocTor } from "./mapGprocTor";
import { torFromBundle } from "./torFromBundle";

const COMPONENT = "captureProjects";
const BREAKER = 3;
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

export interface CaptureProject {
  projectCode: string;
  title?: string;
  agency?: string;
}

export interface CaptureDeps {
  gproc: GprocCaptureClientLike;
  storage: BlobStorage;
  enqueueEnrichment?: (torId: Types.ObjectId, hash: string) => Promise<void>;
  now?: () => Date;
  parse?: PdfParseFn;
  env?: NodeJS.ProcessEnv;
}

type Outcome = { kind: "created" | "known" | "skipped" | "failed"; note?: string; gproc?: "ok" | "error" };

/**
 * Capture admin-selected process5 projects: create the missing TORs from process5 data, store the TOR PDF
 * found in the document bundle (or the signed invitation PDF when there is no TOR yet) and queue enrichment.
 * A TOR with no stored source document is never queued; one summarised from its invitation is upgraded
 * when a later capture finds the TOR file.
 * Serial; per-project errors never escape; 3 consecutive process5 errors pause process5 for the run.
 * The `title`/`agency` hints from the client can only SKIP a project, never create or change data.
 */
export async function captureProjects(runId: Types.ObjectId, projects: CaptureProject[], deps: CaptureDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const enqueueEnrichment = deps.enqueueEnrichment ?? enqueue;
  const agencies = captureAgencies(deps.env ?? process.env);
  const unique = [...new Map(projects.map((p) => [p.projectCode, p])).values()];

  let created = 0;
  let known = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveErrors = 0;
  let paused = false;

  const log = (severity: "info" | "warning" | "error", message: string) =>
    logIngestionEvent({ severity, message, component: COMPONENT, ingestionRunId: runId });

  /** TOR file from the bundles first; otherwise the signed invitation PDF. Returns which kind was stored, or null. */
  async function attachSourceFile(tor: HydratedDocument<ITor>, code: string): Promise<"tor" | "invitation" | null> {
    try {
      if (await attachTorFromBundle(tor, code)) return "tor";
    } catch (err) {
      await log("warning", `capture ${code}: TOR file not stored (${(err as Error).message})`);
    }
    try {
      const inv = await deps.gproc.invitationPdf(code);
      if (!inv) return null;
      await storeTorPdf(
        tor,
        inv,
        { egpUrl: gprocProjectUrl(code), filename: `${code}-invitation.pdf`, key: `tor-pdfs/${code}/invitation.pdf`, kind: "invitation" },
        { storage: deps.storage, parse: deps.parse }
      );
      return "invitation";
    } catch (err) {
      await log("warning", `capture ${code}: invitation PDF not stored (${(err as Error).message})`);
      return null;
    }
  }

  /** The TOR PDF from the draft bundle, else the published one. Throws on a download problem; false when there is none. */
  async function attachTorFromBundle(tor: HydratedDocument<ITor>, code: string): Promise<boolean> {
    for (const draft of [true, false]) {
      const bundle = await deps.gproc.documentBundle(code, { draft });
      if (!bundle) continue;
      const zip = await deps.gproc.downloadBundle(bundle.zipId, MAX_BUNDLE_BYTES);
      const file = torFromBundle(zip, { maxEntryBytes: MAX_BUNDLE_BYTES });
      if (!file) continue;
      const safe = (file.name.split(/[\\/]/).pop() ?? "tor.pdf").replace(/[^A-Za-z0-9._-]/g, "_");
      await storeTorPdf(
        tor,
        file.content,
        { egpUrl: gprocProjectUrl(code), filename: file.name, key: `tor-pdfs/${code}/${safe}`, kind: "tor" },
        { storage: deps.storage, parse: deps.parse }
      );
      return true;
    }
    return false;
  }

  async function processOne(p: CaptureProject): Promise<Outcome> {
    const code = p.projectCode;
    const existing = await Tor.findOne({ projectCode: code });
    if (existing) {
      if (existing.procurement?.source !== "gproc") return { kind: "known", note: "already in the database" };
      const doc = existing.sourceDocument;
      // (a) never got a source document and was never judged: retry, then queue.
      if (existing.pipelineStatus === "pending" && !doc?.storageKey) {
        if (!(await attachSourceFile(existing, code))) return { kind: "known", note: "no source document found yet" };
        await enqueueEnrichment(existing._id as Types.ObjectId, existing.sourceContentHash ?? "");
        return { kind: "known", note: "source document attached, queued for enrichment" };
      }
      // (b) summarised from the invitation only: look for the real TOR file and re-queue under a new hash.
      if (doc?.kind === "invitation" && (existing.pipelineStatus === "enriched" || existing.pipelineStatus === "pending")) {
        let upgraded = false;
        try {
          upgraded = await attachTorFromBundle(existing, code);
        } catch (err) {
          await log("warning", `capture ${code}: TOR file not stored (${(err as Error).message})`);
        }
        if (!upgraded) return { kind: "known", note: "still only the invitation (no TOR file yet)" };
        existing.sourceContentHash = createHash("sha256")
          .update(`${existing.sourceContentHash ?? ""}|tor|${existing.sourceDocument?.sha256 ?? ""}`)
          .digest("hex");
        await existing.save();
        await enqueueEnrichment(existing._id as Types.ObjectId, existing.sourceContentHash);
        return { kind: "known", note: "TOR file found, re-queued for enrichment" };
      }
      return { kind: "known", note: "already in the database" };
    }

    if (p.title && !looksSoftwareRelated(p.title)) return { kind: "skipped", note: "title hint is not software related" };
    if (p.agency && !agencyMatches(agencies, p.agency)) return { kind: "skipped", note: "agency hint not in CAPTURE_AGENCIES" };

    let detail;
    try {
      detail = await deps.gproc.projectDetail(code);
    } catch (err) {
      return { kind: "failed", note: `process5: ${(err as Error).message}`, gproc: "error" };
    }
    if (!detail) return { kind: "skipped", note: "unknown to process5", gproc: "ok" };
    if (!looksSoftwareRelated(detail.projectName ?? "")) return { kind: "skipped", note: "not software related (keyword gate)", gproc: "ok" };
    if (!agencyMatches(agencies, detail.deptName, detail.deptSubName)) return { kind: "skipped", note: "agency not in CAPTURE_AGENCIES", gproc: "ok" };

    let rows;
    try {
      rows = await deps.gproc.announcements(code, detail);
    } catch (err) {
      return { kind: "failed", note: `process5: ${(err as Error).message}`, gproc: "error" };
    }
    const mapped = mapGprocTor({ detail, announcements: rows }, now());
    if (!mapped) return { kind: "failed", note: "process5 returned no project name", gproc: "error" };
    for (const c of mapped.unknownCodes) await log("warning", `capture ${code}: unknown process5 announce type "${c}" (treated as unknown)`);

    let tor: HydratedDocument<ITor>;
    try {
      tor = await Tor.create({
        ...mapped.set,
        projectCode: code,
        sourceContentHash: mapped.sourceContentHash,
        ingestionRunId: runId,
        procurement: mapped.procurement,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return { kind: "known", note: "created by someone else meanwhile", gproc: "ok" };
      throw err;
    }
    const kind = await attachSourceFile(tor, code);
    if (!kind) {
      await log("warning", `capture ${code}: no TOR file or invitation PDF found; created without a source document and not queued for enrichment`);
      return { kind: "created", note: "created, but no TOR file or invitation found yet; not queued for enrichment", gproc: "ok" };
    }
    await enqueueEnrichment(tor._id as Types.ObjectId, mapped.sourceContentHash);
    return { kind: "created", note: kind === "invitation" ? "summarised from the invitation (no TOR file yet)" : undefined, gproc: "ok" };
  }

  for (const p of unique) {
    let out: Outcome;
    if (paused) {
      out = { kind: "skipped", note: "not processed: process5 paused after repeated errors" };
    } else {
      try {
        out = await processOne(p);
      } catch (err) {
        out = { kind: "failed", note: (err as Error).message };
      }
    }
    if (out.kind === "created") created += 1;
    else if (out.kind === "known") known += 1;
    else if (out.kind === "skipped") skipped += 1;
    else failed += 1;
    if (out.gproc === "ok") consecutiveErrors = 0;
    else if (out.gproc === "error") consecutiveErrors += 1;
    await log(out.kind === "failed" ? "warning" : "info", `capture ${p.projectCode}: ${out.kind}${out.note ? ` (${out.note})` : ""}`);
    if (!paused && consecutiveErrors >= BREAKER) {
      paused = true;
      await log("warning", `process5 paused after ${BREAKER} consecutive errors`);
    }
    await IngestionRun.updateOne(
      { _id: runId },
      { $set: { "stats.torsCreated": created, "stats.torsUnchanged": known, "stats.torsSkipped": skipped, "stats.torsFailed": failed } }
    );
  }

  const status = failed === 0 ? "success" : created + known + skipped === 0 ? "failed" : "partial";
  const outcomeSummary =
    `captured ${unique.length}: created ${created}, already known ${known}, skipped ${skipped}, failed ${failed}` +
    (paused ? `; process5 paused after ${BREAKER} consecutive errors` : "");
  await IngestionRun.updateOne({ _id: runId }, { $set: { completedAt: now(), status, outcomeSummary } });
  await log("info", outcomeSummary);
}

export default captureProjects;
