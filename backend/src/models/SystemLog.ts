import { Schema, model, type Types } from "mongoose";

export type LogSource = "ingestion" | "ai-pipeline" | "application";
export type LogSeverity = "info" | "warning" | "error";

export interface ISystemLog {
  source: LogSource;
  component?: string;
  severity: LogSeverity;
  message: string;
  context?: unknown;
  ingestionRunId: Types.ObjectId | null;
  timestamp: Date;
}

/**
 * systemLogs — diagnostic logs surfaced in the Admin console (FR-37, FR-38).
 */
const systemLogSchema = new Schema<ISystemLog>(
  {
    source: {
      type: String,
      enum: ["ingestion", "ai-pipeline", "application"],
      required: true,
      index: true,
    },
    // finer-grained origin, e.g. "scraper.egp", "classifier.category"
    component: { type: String },
    severity: {
      type: String,
      enum: ["info", "warning", "error"],
      required: true,
      index: true,
    },
    message: { type: String, required: true },
    // arbitrary structured context (stack trace, TOR id, run id, …)
    context: { type: Schema.Types.Mixed },
    ingestionRunId: { type: Schema.Types.ObjectId, ref: "IngestionRun", default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export const SystemLog = model<ISystemLog>("SystemLog", systemLogSchema);
export default SystemLog;
