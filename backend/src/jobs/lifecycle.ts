import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { refreshLifecycle } from "../ingestion/lifecycle/refreshLifecycle";

/**
 * Cloud Run Job entrypoint: refresh the procurement stage of existing TORs once (up to
 * MAX_LIFECYCLE_REFRESH_PER_RUN), then exit. Triggered daily by Cloud Scheduler. On any error it
 * sets `process.exitCode = 1` (never `process.exit()` mid-write) so Cloud Run marks the
 * execution failed after Mongo is cleanly disconnected.
 */
export async function runLifecycleJob(): Promise<void> {
  try {
    await connectDB();
    const out = await refreshLifecycle({ trigger: "scheduled" });
    console.log(
      `lifecycle run ${out.runId || "(nothing to check)"}: checked ${out.selected}, changed ${out.changed}, unchanged ${out.unchanged}, skipped ${out.skipped}, failed ${out.failed}`
    );
  } catch (err) {
    console.error("lifecycle job failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) void runLifecycleJob();
