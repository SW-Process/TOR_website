import { Schema, model, type Types } from "mongoose";

export type EnrichmentJobStatus = "queued" | "processing" | "done" | "failed" | "rejected";

export interface IEnrichmentJob {
  torId: Types.ObjectId;
  status: EnrichmentJobStatus;
  sourceContentHash: string;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: Date | null;
  nextRunAt: Date;
  lastError: { message: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

const enrichmentJobSchema = new Schema<IEnrichmentJob>(
  {
    torId: { type: Schema.Types.ObjectId, ref: "Tor", required: true, unique: true },
    status: {
      type: String,
      enum: ["queued", "processing", "done", "failed", "rejected"],
      default: "queued",
      required: true,
    },
    sourceContentHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5, min: 1 },
    lockedBy: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    nextRunAt: { type: Date, default: Date.now },
    lastError: {
      type: new Schema({ message: String, at: Date }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true, collection: "enrichmentjobs" }
);

enrichmentJobSchema.index({ status: 1, nextRunAt: 1, lockedUntil: 1 });

export const EnrichmentJob = model<IEnrichmentJob>("EnrichmentJob", enrichmentJobSchema);
export default EnrichmentJob;
