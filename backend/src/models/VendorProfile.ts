import { Schema, model, type Types } from "mongoose";

export interface ISavedSearch {
  name: string;
  filters: Record<string, unknown>;
  alertsEnabled: boolean;
  createdAt: Date;
}

export interface IVendorProfile {
  userId: Types.ObjectId;
  companyName?: string;
  businessType?: string;
  registeredCapital?: number;
  yearsExperience?: number;
  teamSize?: number;
  certifications: string[];
  technologyStack: string[];
  // TOR categories the vendor wants to be matched against (FR-30)
  interestedCategories: string[];
  budgetRange?: { min?: number; max?: number };
  serviceArea?: string;
  savedSearches: Types.DocumentArray<ISavedSearch>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * savedSearches — embedded in vendorProfiles (FR-28).
 * Small, vendor-scoped, never queried independently of the vendor.
 */
const savedSearchSchema = new Schema<ISavedSearch>(
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
const vendorProfileSchema = new Schema<IVendorProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // 1:1 with users
    },
    companyName: { type: String, trim: true },
    businessType: { type: String, trim: true },
    registeredCapital: { type: Number, min: 0 },
    yearsExperience: { type: Number, min: 0 },
    teamSize: { type: Number, min: 0 },
    certifications: { type: [String], default: [] },
    technologyStack: { type: [String], default: [] },
    interestedCategories: { type: [String], default: [] },
    budgetRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
    },
    serviceArea: { type: String, trim: true },
    savedSearches: { type: [savedSearchSchema], default: [] },
  },
  { timestamps: true }
);

export const VendorProfile = model<IVendorProfile>("VendorProfile", vendorProfileSchema);
export default VendorProfile;
