const { Schema, model } = require("mongoose");

/**
 * savedSearches — embedded in vendorProfiles (FR-28).
 * Small, vendor-scoped, never queried independently of the vendor.
 */
const savedSearchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // arbitrary filter payload the frontend replays against the TOR search API
    filters: { type: Schema.Types.Mixed, default: {} },
    // when true, new TORs matching these filters raise a notification (FR-30)
    alertsEnabled: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/**
 * vendorProfiles — one per Vendor, holding the FR-22 business profile.
 */
const vendorProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // 1:1 with users
    },
    businessType: { type: String, trim: true },
    registeredCapital: { type: Number, min: 0 },
    yearsExperience: { type: Number, min: 0 },
    certifications: { type: [String], default: [] },
    technologyStack: { type: [String], default: [] },
    budgetRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    serviceArea: { type: String, trim: true },
    savedSearches: { type: [savedSearchSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = model("VendorProfile", vendorProfileSchema);
