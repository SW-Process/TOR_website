// backend/src/ingestion/enrichment/enrichmentJobRepo.ts
import type { HydratedDocument, Types } from "mongoose";
import { EnrichmentJob, type IEnrichmentJob } from "../../models";

export const LEASE_MS = 600_000; // 10 minutes
export const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 2 * 60 * 60_000; // 2 hours
const DEAD_LETTER_MS = 100 * 365 * 24 * 60 * 60_000; // ~100 years

/** Insert or re-queue the job for a TOR. Unchanged hash on a terminal job is a no-op. */
export async function enqueue(torId: Types.ObjectId, sourceContentHash: string): Promise<void> {
  const existing = await EnrichmentJob.findOne({ torId });
  if (!existing) {
    await EnrichmentJob.create({ torId, sourceContentHash });
    return;
  }
  if (existing.sourceContentHash === sourceContentHash) return;
  await EnrichmentJob.updateOne(
    { _id: existing._id },
    {
      $set: {
        sourceContentHash,
        status: "queued",
        attempts: 0,
        nextRunAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
      },
    }
  );
}

/** Atomically claim the next runnable job under a lease. */
export async function claimNext(
  workerId: string,
  now: Date = new Date()
): Promise<HydratedDocument<IEnrichmentJob> | null> {
  const lockedUntil = new Date(now.getTime() + LEASE_MS);
  return EnrichmentJob.findOneAndUpdate(
    {
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        { status: "queued" },
        { status: "processing", lockedUntil: { $lte: now } },
        { status: "failed", nextRunAt: { $lte: now } },
      ],
    },
    { $set: { status: "processing", lockedBy: workerId, lockedUntil }, $inc: { attempts: 1 } },
    { sort: { nextRunAt: 1, createdAt: 1 }, returnDocument: "after" }
  );
}

export async function complete(
  jobId: Types.ObjectId,
  workerId: string,
  outcome: "done" | "rejected"
): Promise<void> {
  await EnrichmentJob.updateOne(
    { _id: jobId, lockedBy: workerId },
    { $set: { status: outcome, lockedBy: null, lockedUntil: null, lastError: null } }
  );
}

export async function fail(
  jobId: Types.ObjectId,
  workerId: string,
  err: unknown,
  now: Date = new Date()
): Promise<void> {
  const job = await EnrichmentJob.findOne({ _id: jobId, lockedBy: workerId });
  if (!job) return;
  const message = err instanceof Error ? err.message : String(err);
  const hasAttemptsLeft = job.attempts < MAX_ATTEMPTS;
  const backoff = Math.min(60_000 * 5 ** Math.max(job.attempts - 1, 0), MAX_BACKOFF_MS);
  await EnrichmentJob.updateOne(
    { _id: jobId, lockedBy: workerId },
    {
      $set: {
        status: "failed",
        lockedBy: null,
        lockedUntil: null,
        nextRunAt: new Date(now.getTime() + (hasAttemptsLeft ? backoff : DEAD_LETTER_MS)),
        lastError: { message, at: now },
      },
    }
  );
}

/** Extend the lease for a long-running Gemini call. */
export async function renew(
  jobId: Types.ObjectId,
  workerId: string,
  now: Date = new Date()
): Promise<void> {
  await EnrichmentJob.updateOne(
    { _id: jobId, lockedBy: workerId },
    { $set: { lockedUntil: new Date(now.getTime() + LEASE_MS) } }
  );
}
