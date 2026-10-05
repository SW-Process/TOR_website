// backend/src/ingestion/enrichment/sweepStaleRuns.ts
import { IngestionRun } from "../../models";
import type { IngestionPhase } from "../../models/IngestionRun";
import { LEASE_MS } from "./enrichmentJobRepo";
import { logFailedRuns } from "../failedRunLog";

/** Runs older than this while still "running" are treated as interrupted. */
export const STALE_RUN_MS = 35 * 60_000;
/**
 * A live worker writes its progress to the run row after every unit of work, and a single
 * job's lease is LEASE_MS. A run silent for longer than that lost its worker (e.g. the
 * process restarted mid-run), so it must not keep blocking new runs.
 */
export const IDLE_RUN_MS = LEASE_MS;

/** Mark runs of `phase` left "running" by a dead worker as failed. Returns how many. */
export async function sweepStaleRuns(phase: IngestionPhase, now: Date = new Date()): Promise<number> {
  const stale = await IngestionRun.find({
    status: "running",
    phase,
    $or: [
      { startedAt: { $lt: new Date(now.getTime() - STALE_RUN_MS) } },
      { updatedAt: { $lt: new Date(now.getTime() - IDLE_RUN_MS) } },
    ],
  })
    .select("_id phase startedAt updatedAt")
    .lean();
  if (stale.length === 0) return 0;

  const res = await IngestionRun.updateMany(
    { _id: { $in: stale.map((r) => r._id) }, status: "running" },
    {
      $set: {
        status: "failed",
        completedAt: now,
        outcomeSummary: `interrupted (stale ${phase} run swept)`,
      },
    }
  );
  await logFailedRuns(stale, "no progress within the expected window", now);
  return res.modifiedCount;
}

/** Enrichment-phase convenience wrapper (kept so existing callers need no change). */
export function sweepStaleEnrichmentRuns(now: Date = new Date()): Promise<number> {
  return sweepStaleRuns("enrichment", now);
}
