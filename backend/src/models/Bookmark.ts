import { Schema, model, type Types } from "mongoose";

export type ApplicationStatus = "interested" | "preparing" | "submitted" | "missed";

export interface IBookmark {
  vendorId: Types.ObjectId;
  torId: Types.ObjectId;
  applicationStatus: ApplicationStatus;
  note?: string;
  bookmarkedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * bookmarks — join between a Vendor and a TOR, carrying application status
 * (FR-27, FR-31, FR-32). Kept as its own collection (not embedded) because it
 * has its own timestamps / status transitions and Admin analytics may query it
 * independently of any one vendor.
 */
const bookmarkSchema = new Schema<IBookmark>(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "VendorProfile",
      required: true,
      index: true,
    },
    torId: {
      type: Schema.Types.ObjectId,
      ref: "Tor",
      required: true,
      index: true,
    },
    applicationStatus: {
      type: String,
      enum: ["interested", "preparing", "submitted", "missed"],
      default: "interested",
    },
    note: { type: String },
    bookmarkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A vendor bookmarks a given TOR at most once
bookmarkSchema.index({ vendorId: 1, torId: 1 }, { unique: true });

export const Bookmark = model<IBookmark>("Bookmark", bookmarkSchema);
export default Bookmark;
