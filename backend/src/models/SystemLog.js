const { Schema, model } = require("mongoose");

/**
 * systemLogs — diagnostic logs surfaced in the Admin console (FR-37, FR-38).
 */
const systemLogSchema = new Schema(
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

module.exports = model("SystemLog", systemLogSchema);
