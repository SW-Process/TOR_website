// backend/src/ingestion/enrichment/sweepStaleRuns.ts
import { IngestionRun } from "../../models";
import { LEASE_MS } from "./enrichmentJobRepo";

/** Runs older than this while still "running" are treated as interrupted. */
export const STALE_ENRICHMENT_RUN_MS = 35 * 60_000;
/**
 * A live drain writes its progress to the run row after every job, and a single job's
 * lease is LEASE_MS. A run silent for longer than that lost its worker (e.g. the
 * process restarted mid-run), so it must not keep blocking new runs.
 */
export const IDLE_ENRICHMENT_RUN_MS = LEASE_MS;

/** Mark enrichment runs left "running" by a dead worker as failed. Returns how many. */
export async function sweepStaleEnrichmentRuns(now: Date = new Date()): Promise<number> {
  const res = await IngestionRun.updateMany(
    {
      status: "running",
      phase: "enrichment",
      $or: [
        { startedAt: { $lt: new Date(now.getTime() - STALE_ENRICHMENT_RUN_MS) } },
        { updatedAt: { $lt: new Date(now.getTime() - IDLE_ENRICHMENT_RUN_MS) } },
      ],
    },
    {
      $set: {
        status: "failed",
        completedAt: now,
        outcomeSummary: "interrupted (stale enrichment run swept)",
      },
    }
  );
  return res.modifiedCount;
}
