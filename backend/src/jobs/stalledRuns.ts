import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { detectStalledRuns } from "../ingestion/stalledRuns";

/**
 * Cloud Run Job entrypoint: fail and log every stalled ingestion run, then exit. Meant to run on
 * a short Cloud Scheduler interval, so a dead run is noticed without waiting for the next crawl.
 * On any error it sets `process.exitCode = 1` (never `process.exit()` mid-write).
 */
export async function runStalledRunsJob(): Promise<void> {
  try {
    await connectDB();
    const report = await detectStalledRuns();
    console.log(
      `stalled-runs check: failed ${report.total} (discovery ${report.discovery}, enrichment ${report.enrichment}, lifecycle ${report.lifecycle}, capture ${report.capture})`
    );
  } catch (err) {
    console.error("stalled-runs job failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) void runStalledRunsJob();
