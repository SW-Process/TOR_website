const { Schema, model } = require("mongoose");

/**
 * ingestionRuns — history of TOR sync runs (FR-34–FR-36).
 */
const ingestionRunSchema = new Schema(
  {
    trigger: {
      type: String,
      enum: ["scheduled", "manual"],
      required: true,
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
    },
    outcomeSummary: { type: String },
  },
  { timestamps: true }
);

ingestionRunSchema.index({ startedAt: -1 });

module.exports = model("IngestionRun", ingestionRunSchema);
