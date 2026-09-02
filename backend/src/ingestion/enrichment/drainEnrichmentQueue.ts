// backend/src/ingestion/enrichment/drainEnrichmentQueue.ts
import { randomUUID } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
import { Tor, IngestionRun, type IIngestionRun } from "../../models";
import { getStorage, type BlobStorage } from "../../storage";
import { logIngestionEvent } from "../log";
import { claimNext, complete, fail } from "./enrichmentJobRepo";
import { applyExtractionToTor, type TorExtractor } from "./torExtractor";

/** Runs older than this while still "running" are treated as interrupted. */
export const STALE_ENRICHMENT_RUN_MS = 35 * 60_000;

export interface DrainDeps {
  extractor: TorExtractor;
  storage?: BlobStorage;
  maxCalls?: number;
  now?: () => Date;
}

export interface DrainResult {
  runId: string;
  claimed: number;
  enrichedOk: number;
  enrichedRejected: number;
  enrichedFailed: number;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream)
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as unknown as Uint8Array));
  return Buffer.concat(chunks);
}

export async function drainEnrichmentQueue(deps: DrainDeps): Promise<DrainResult> {
  const storage = deps.storage ?? getStorage();
  const envMax = Number(process.env.MAX_AI_CALLS_PER_RUN);
  const maxCalls = deps.maxCalls ?? (Number.isFinite(envMax) ? envMax : 50);
  const now = deps.now ?? (() => new Date());
  const workerId = `enrich-${randomUUID()}`;

  // Sweep enrichment runs left "running" by an interrupted Cloud Run Job task.
  await IngestionRun.updateMany(
    {
      status: "running",
      phase: "enrichment",
      startedAt: { $lt: new Date(Date.now() - STALE_ENRICHMENT_RUN_MS) },
    },
    {
      $set: {
        status: "failed",
        completedAt: new Date(),
        outcomeSummary: "interrupted (stale enrichment run swept)",
      },
    }
  );

  // The IngestionRun row is created lazily — only once there is a job to do —
  // so an empty queue writes no run row.
  let run: HydratedDocument<IIngestionRun> | null = null;
  const ensureRun = async (): Promise<HydratedDocument<IIngestionRun>> => {
    if (!run) {
      run = await IngestionRun.create({
        trigger: "scheduled",
        phase: "enrichment",
        status: "running",
      });
    }
    return run;
  };

  let claimed = 0;
  let enrichedOk = 0;
  let enrichedRejected = 0;
  let enrichedFailed = 0;

  try {
    while (claimed < maxCalls) {
      const job = await claimNext(workerId, now());
      if (!job) break;
      const activeRun = await ensureRun();
      const runId = activeRun._id as Types.ObjectId;
      claimed += 1;

      const tor = await Tor.findById(job.torId);
      if (!tor) {
        await complete(job._id, workerId, "done");
        continue;
      }

      try {
        tor.pipelineStatus = "processing";
        await tor.save();

        const pdfs: { fileName: string; content: Buffer }[] = [];
        const key = tor.sourceDocument?.storageKey;
        if (key) {
          const buf = await streamToBuffer(await storage.getStream(key));
          pdfs.push({ fileName: tor.sourceDocument?.filename ?? "tor.pdf", content: buf });
        }

        const result = await deps.extractor.extract({
          pdfs,
          meta: {
            projectCode: tor.projectCode,
            title: tor.title,
            agency: tor.agency,
            budget: tor.budget,
            referencePrice: tor.referencePrice,
            goodsCategory: tor.goodsCategory,
          },
        });

        applyExtractionToTor(tor, result, {
          extractorId: deps.extractor.id,
          fallbackText: `${tor.title} ${tor.goodsCategory ?? ""}`,
        });
        await tor.save();

        if ((tor.pipelineStatus as string) === "rejected") {
          enrichedRejected += 1;
          await complete(job._id, workerId, "rejected");
        } else {
          enrichedOk += 1;
          await complete(job._id, workerId, "done");
        }
      } catch (err) {
        await fail(job._id, workerId, err, now());
        // `claimNext` already $inc'd attempts, so `job.attempts` is the attempt
        // just consumed. Only a terminal failure marks the TOR "failed".
        const terminal = job.attempts >= job.maxAttempts;
        if (terminal) {
          enrichedFailed += 1;
          tor.pipelineStatus = "failed";
        } else {
          // Transient: leave it re-runnable, not stuck in "processing".
          tor.pipelineStatus = "pending";
        }
        await tor.save().catch(() => undefined);
        await logIngestionEvent({
          severity: "error",
          message: `enrichment ${terminal ? "failed" : "errored (will retry)"} for TOR ${
            tor.projectCode ?? tor.id
          }: ${(err as Error).message}`,
          component: "classifier.gemini",
          context: { torId: tor.id, attempt: job.attempts, terminal, stack: (err as Error).stack },
          ingestionRunId: runId,
        });
      }
    }

    if (!run) {
      return { runId: "", claimed, enrichedOk, enrichedRejected, enrichedFailed };
    }

    const activeRun: HydratedDocument<IIngestionRun> = run;
    const runId = activeRun._id as Types.ObjectId;
    activeRun.stats.torsFound = claimed;
    activeRun.stats.enrichedOk = enrichedOk;
    activeRun.stats.enrichedRejected = enrichedRejected;
    activeRun.stats.enrichedFailed = enrichedFailed;
    activeRun.completedAt = new Date();
    activeRun.status =
      enrichedFailed === 0 ? "success" : enrichedOk + enrichedRejected === 0 ? "failed" : "partial";
    activeRun.outcomeSummary = `claimed ${claimed}, ok ${enrichedOk}, rejected ${enrichedRejected}, failed ${enrichedFailed}`;
    await activeRun.save();
    await logIngestionEvent({
      severity: "info",
      message: activeRun.outcomeSummary,
      component: "drainEnrichmentQueue",
      ingestionRunId: runId,
    });
    return { runId: runId.toString(), claimed, enrichedOk, enrichedRejected, enrichedFailed };
  } catch (fatal) {
    if (run) {
      const activeRun: HydratedDocument<IIngestionRun> = run;
      activeRun.completedAt = new Date();
      activeRun.status = "failed";
      activeRun.outcomeSummary = `enrichment aborted: ${(fatal as Error).message}`;
      await activeRun.save();
      await logIngestionEvent({
        severity: "error",
        message: activeRun.outcomeSummary,
        component: "drainEnrichmentQueue",
        context: { stack: (fatal as Error).stack },
        ingestionRunId: activeRun._id as Types.ObjectId,
      });
      return {
        runId: (activeRun._id as Types.ObjectId).toString(),
        claimed,
        enrichedOk,
        enrichedRejected,
        enrichedFailed,
      };
    }
    return { runId: "", claimed, enrichedOk, enrichedRejected, enrichedFailed };
  }
}

export default drainEnrichmentQueue;
