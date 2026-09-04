import type { Types } from "mongoose";
import { SystemLog } from "../models";

export type IngestSeverity = "info" | "warning" | "error";

export interface LogIngestionEventInput {
  severity: IngestSeverity;
  message: string;
  component?: string;
  context?: unknown;
  ingestionRunId?: Types.ObjectId | null;
}

/**
 * Append one ingestion diagnostic row (FR-37/38). A logging failure must never
 * abort a run, so this swallows its own errors after printing them.
 */
export async function logIngestionEvent(input: LogIngestionEventInput): Promise<void> {
  try {
    await SystemLog.create({
      source: "ingestion",
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
