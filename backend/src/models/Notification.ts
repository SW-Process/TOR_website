import { Schema, model, type Types } from "mongoose";

export type NotificationType = "profile_match" | "saved_search_match" | "deadline_reminder";

export interface INotification {
  vendorId: Types.ObjectId;
  torId: Types.ObjectId;
  type: NotificationType;
  savedSearchId: Types.ObjectId | null;
  message?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * notifications — in-app notifications for TOR matches (FR-30).
 */
const notificationSchema = new Schema<INotification>(
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
    },
    type: {
      type: String,
      enum: ["profile_match", "saved_search_match", "deadline_reminder"],
      required: true,
    },
    // which saved search triggered this, when type === "saved_search_match"
    savedSearchId: { type: Schema.Types.ObjectId, default: null },
    message: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ vendorId: 1, read: 1, createdAt: -1 });

export const Notification = model<INotification>("Notification", notificationSchema);
export default Notification;
