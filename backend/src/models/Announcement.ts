import { Schema, model, type Types } from "mongoose";

export type AnnouncementKind = "news" | "update" | "maintenance";
export type HelpStatus = "draft" | "published";

export interface IAnnouncement {
  /** Stable key for seeded content, so re-seeding never duplicates; null for admin-written posts. */
  slug: string | null;
  title: string;
  /** Light markup (paragraphs, "- " lists, **bold**, [links](/path)) rendered safely by the frontend. */
  body: string;
  kind: AnnouncementKind;
  pinned: boolean;
  status: HelpStatus;
  /** Set when first published; drives the public order. */
  publishedAt: Date | null;
  /** After this the post shows as "[สิ้นสุด]" (e.g. a finished maintenance window). */
  endsAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** announcements — help-center notices admins post ("ประกาศ"). */
const announcementSchema = new Schema<IAnnouncement>(
  {
    slug: { type: String, default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 20000 },
    kind: { type: String, enum: ["news", "update", "maintenance"], default: "news" },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    publishedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Unique only among seeded rows; admin-written posts all have slug null.
announcementSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string" } } });
announcementSchema.index({ status: 1, pinned: -1, publishedAt: -1 });

export const Announcement = model<IAnnouncement>("Announcement", announcementSchema);
export default Announcement;
