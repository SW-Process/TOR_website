const { Schema, model } = require("mongoose");

/**
 * errorReports — TOR error reports submitted by public or vendor users,
 * routed to Admins (FR-41).
 */
const errorReportSchema = new Schema(
  {
    torId: {
      type: Schema.Types.ObjectId,
      ref: "Tor",
      required: true,
      index: true,
    },
    // null when submitted by an unauthenticated public user
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // optional contact left by an anonymous reporter
    reporterEmail: { type: String, trim: true, lowercase: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
      index: true,
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolutionNote: { type: String },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = model("ErrorReport", errorReportSchema);
