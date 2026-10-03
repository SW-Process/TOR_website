import type { Types } from "mongoose";
import { SystemLog, type LogSource } from "../models";

export type IngestSeverity = "info" | "warning" | "error";

export interface LogIngestionEventInput {
  /** Which pipeline stage wrote this; defaults to "ingestion" (discovery). */
  source?: LogSource;
  severity: IngestSeverity;
  message: string;
  component?: string;
  context?: unknown;
  ingestionRunId?: Types.ObjectId | null;
}

/**
 * Append one pipeline diagnostic row (FR-37/38). A logging failure must never
 * abort a run, so this swallows its own errors after printing them.
 */
export async function logIngestionEvent(input: LogIngestionEventInput): Promise<void> {
  try {
    await SystemLog.create({
      source: input.source ?? "ingestion",
      component: input.component,
      severity: input.severity,
      message: input.message,
      context: input.context,
      ingestionRunId: input.ingestionRunId ?? null,
    });
  } catch (err) {
    console.error("logIngestionEvent failed:", err);
  }
}

export default logIngestionEvent;
