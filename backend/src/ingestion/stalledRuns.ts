import { markInterruptedRunsFailed } from "./runIngestion";
import { sweepStaleRuns } from "./enrichment/sweepStaleRuns";

export interface StalledRunReport {
  discovery: number;
  enrichment: number;
  lifecycle: number;
  total: number;
}

/**
 * Fail every ingestion run that has stopped making progress, across all phases, and log
 * an error for each (FR-39). Safe to run on a schedule: a run still making progress is
 * left alone by each phase's own age/idle rule.
 */
export async function detectStalledRuns(now: Date = new Date()): Promise<StalledRunReport> {
  const discovery = await markInterruptedRunsFailed(now);
  const enrichment = await sweepStaleRuns("enrichment", now);
  const lifecycle = await sweepStaleRuns("lifecycle", now);
  return { discovery, enrichment, lifecycle, total: discovery + enrichment + lifecycle };
}
