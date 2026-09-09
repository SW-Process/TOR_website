import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { drainEnrichmentQueue } from "../ingestion/enrichment/drainEnrichmentQueue";
import { GeminiExtractor } from "../ingestion/enrichment/geminiExtractor";
import type { TorExtractor } from "../ingestion/enrichment/torExtractor";

/**
 * Select the extractor from `process.env.EXTRACTOR`. Unset or "gemini" gives the
 * Vertex-backed `GeminiExtractor`; any other value is a misconfiguration and
 * throws (caught by the entrypoint, which then sets `process.exitCode = 1`).
 */
function selectExtractor(): TorExtractor {
  const name = process.env.EXTRACTOR;
  if (!name || name === "gemini") return new GeminiExtractor();
  throw new Error(`unknown EXTRACTOR: ${name}`);
}

/**
 * Cloud Run Job entrypoint: drain the enrichment queue once, then exit.
 * Triggered by Cloud Scheduler. On any error it sets `process.exitCode = 1`
 * (never `process.exit()` mid-write) so Cloud Run marks the execution failed
 * after Mongo is cleanly disconnected.
 */
export async function runEnrichmentJob(): Promise<void> {
  try {
    await connectDB();
    const extractor = selectExtractor();
    const out = await drainEnrichmentQueue({ extractor });
    console.log(
      `enrichment run ${out.runId}: claimed ${out.claimed}, ok ${out.enrichedOk}, rejected ${out.enrichedRejected}, failed ${out.enrichedFailed}`
    );
  } catch (err) {
    console.error("enrichment job failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) void runEnrichmentJob();
