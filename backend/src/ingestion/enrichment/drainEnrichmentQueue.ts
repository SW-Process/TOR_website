// backend/src/ingestion/enrichment/drainEnrichmentQueue.ts
import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import { Tor, IngestionRun } from "../../models";
import { getStorage, type BlobStorage } from "../../storage";
import { logIngestionEvent } from "../log";
import { claimNext, complete, fail } from "./enrichmentJobRepo";
import { applyExtractionToTor, type TorExtractor } from "./torExtractor";

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
  const maxCalls = (deps.maxCalls ?? Number(process.env.MAX_AI_CALLS_PER_RUN)) || 50;
  const now = deps.now ?? (() => new Date());
  const workerId = `enrich-${randomUUID()}`;

  const run = await IngestionRun.create({
    trigger: "scheduled",
    phase: "enrichment",
    status: "running",
  });
  const runId = run._id as Types.ObjectId;

  let claimed = 0;
  let enrichedOk = 0;
  let enrichedRejected = 0;
  let enrichedFailed = 0;

  try {
    while (claimed < maxCalls) {
      const job = await claimNext(workerId, now());
      if (!job) break;
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
        enrichedFailed += 1;
        tor.pipelineStatus = "failed";
        await tor.save().catch(() => undefined);
        await fail(job._id, workerId, err, now());
        await logIngestionEvent({
          severity: "error",
          message: `enrichment failed for TOR ${tor.projectCode ?? tor.id}: ${(err as Error).message}`,
          component: "classifier.gemini",
          context: { torId: tor.id, stack: (err as Error).stack },
          ingestionRunId: runId,
        });
      }
    }

    run.stats.torsFound = claimed;
    run.stats.enrichedOk = enrichedOk;
    run.stats.enrichedRejected = enrichedRejected;
    run.stats.enrichedFailed = enrichedFailed;
    run.completedAt = new Date();
    run.status =
      enrichedFailed === 0 ? "success" : enrichedOk + enrichedRejected === 0 ? "failed" : "partial";
    run.outcomeSummary = `claimed ${claimed}, ok ${enrichedOk}, rejected ${enrichedRejected}, failed ${enrichedFailed}`;
    await run.save();
    await logIngestionEvent({
      severity: "info",
      message: run.outcomeSummary,
      component: "drainEnrichmentQueue",
      ingestionRunId: runId,
    });
  } catch (fatal) {
    run.completedAt = new Date();
    run.status = "failed";
    run.outcomeSummary = `enrichment aborted: ${(fatal as Error).message}`;
    await run.save();
    await logIngestionEvent({
      severity: "error",
      message: run.outcomeSummary,
      component: "drainEnrichmentQueue",
      context: { stack: (fatal as Error).stack },
      ingestionRunId: runId,
    });
  }

  return { runId: runId.toString(), claimed, enrichedOk, enrichedRejected, enrichedFailed };
}

export default drainEnrichmentQueue;
