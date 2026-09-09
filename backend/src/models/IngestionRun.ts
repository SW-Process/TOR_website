import { Schema, model, type Types } from "mongoose";

export type IngestionTrigger = "scheduled" | "manual";
export type IngestionStatus = "running" | "success" | "partial" | "failed";
export type IngestionPhase = "discovery" | "enrichment";

export interface IIngestionRunStats {
  torsFound: number;
  torsCreated: number;
  torsUpdated: number;
  torsFailed: number;
  torsSkipped: number;
  torsUnchanged: number;
  enrichedOk: number;
  enrichedRejected: number;
  enrichedFailed: number;
}

export interface IIngestionRun {
  trigger: IngestionTrigger;
  phase: IngestionPhase;
  triggeredBy: Types.ObjectId | null;
  startedAt: Date;
  completedAt: Date | null;
  status: IngestionStatus;
  stats: IIngestionRunStats;
  outcomeSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ingestionRuns — history of TOR sync runs (FR-34–FR-36).
 */
const ingestionRunSchema = new Schema<IIngestionRun>(
  {
    trigger: {
      type: String,
      enum: ["scheduled", "manual"],
      required: true,
    },
    phase: {
      type: String,
      enum: ["discovery", "enrichment"],
      default: "discovery",
      index: true,
    },
    // set when trigger === "manual"
    triggeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["running", "success", "partial", "failed"],
      default: "running",
      index: true,
    },
    stats: {
      torsFound: { type: Number, default: 0 },
      torsCreated: { type: Number, default: 0 },
      torsUpdated: { type: Number, default: 0 },
      torsFailed: { type: Number, default: 0 },
      torsSkipped: { type: Number, default: 0 },
      // found, matched an existing Tor whose source content hash is identical — a
      // deliberate no-op (FR-06/idempotency), not silently unaccounted for.
      torsUnchanged: { type: Number, default: 0 },
      enrichedOk: { type: Number, default: 0 },
      enrichedRejected: { type: Number, default: 0 },
      enrichedFailed: { type: Number, default: 0 },
    },
    outcomeSummary: { type: String },
  },
  { timestamps: true }
);

ingestionRunSchema.index({ startedAt: -1 });

export const IngestionRun = model<IIngestionRun>("IngestionRun", ingestionRunSchema);
export default IngestionRun;
