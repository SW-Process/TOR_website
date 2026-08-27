const { Schema, model } = require("mongoose");

/**
 * aiSummary — embedded (FR-12 / FR-20). Always fetched with the TOR,
 * never queried on its own.
 */
const aiSummarySchema = new Schema(
  {
    keyPoints: { type: [String], default: [] },
    qualifications: { type: [String], default: [] },
    evaluationCriteria: {
      type: [
        {
          label: { type: String, required: true },
          weight: { type: Number, min: 0, max: 100 },
          _id: false,
        },
      ],
      default: [],
    },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
    },
    model: { type: String }, // which AI model / version produced this
    generatedAt: { type: Date },
  },
  { _id: false }
);

/**
 * fairnessFlags — embedded array (Section 5.2). Reviewed by Admins on the
 * TOR detail page (UC-5); not a queryable entity of its own.
 */
const fairnessFlagSchema = new Schema(
  {
    field: {
      type: String,
      enum: ["budget", "deadline", "category", "agency", "title", "qualificationRequirements", "other"],
      required: true,
    },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    message: { type: String, required: true },
    detectedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["open", "acknowledged", "dismissed"], default: "open" },
  },
  { _id: true }
);

/**
 * tors — the central entity.
 */
const torSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    // reference into GCS — the PDF binary is not stored in Mongo
    sourceDocumentUrl: { type: String },
    agency: { type: String, index: true },
    department: { type: String },
    // stable identifier from the source system (e.g. e-GP project code)
    projectCode: { type: String, unique: true, sparse: true },
    budget: { type: Number, min: 0 },
    announcementDate: { type: Date },
    submissionDeadline: { type: Date, index: true },
    technologyStack: { type: [String], default: [], index: true },
    projectType: { type: String, index: true },
    qualificationRequirements: { type: [String], default: [] },
    evaluationCriteria: { type: String },
    location: { type: String },
    // lifecycle status, derivable from submissionDeadline but denormalized for filtering
    status: {
      type: String,
      enum: ["open", "closing_soon", "closed"],
      default: "open",
      index: true,
    },
    viewCount: { type: Number, default: 0 },
    aiSummary: { type: aiSummarySchema, default: null },
    fairnessFlags: { type: [fairnessFlagSchema], default: [] },
    // FR-11 / FR-18 — precomputed "similar TOR" references
    similarTORs: { type: [{ type: Schema.Types.ObjectId, ref: "Tor" }], default: [] },
    // which ingestion run last created/updated this document
    ingestionRunId: { type: Schema.Types.ObjectId, ref: "IngestionRun" },
  },
  { timestamps: true }
);

// Full-text search over the fields the public search UI queries
torSchema.index({ title: "text", description: "text", agency: "text" });

module.exports = model("Tor", torSchema);
