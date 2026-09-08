import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { runIngestion, markInterruptedRunsFailed } from "../ingestion/runIngestion";

/**
 * Cloud Run Job entrypoint: sweep interrupted discovery runs, then run one
 * scheduled `runIngestion` crawl to completion. Triggered by Cloud Scheduler.
 * On any error it sets `process.exitCode = 1` (never `process.exit()` mid-write)
 * so Cloud Run marks the execution failed after Mongo is cleanly disconnected.
 */
export async function runDiscoveryJob(): Promise<void> {
  try {
    await connectDB();
    const swept = await markInterruptedRunsFailed();
    if (swept > 0) console.log(`swept ${swept} interrupted discovery run(s)`);
    const { runId, done } = await runIngestion(
      {
        trigger: "scheduled",
        triggeredBy: null,
        maxProjects: Number(process.env.INGEST_DEFAULT_MAX_PROJECTS) || 50,
        searchText: process.env.INGEST_DEFAULT_SEARCH ?? "ซอฟต์แวร์",
      },
      {}
    );
    console.log(`discovery run ${runId} started`);
    await done;
    console.log(`discovery run ${runId} finished`);
  } catch (err) {
    console.error("discovery job failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) void runDiscoveryJob();
