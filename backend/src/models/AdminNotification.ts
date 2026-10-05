import { Schema, model, type Types } from "mongoose";

export type AdminNotificationType = "pipeline_run_failed";

export interface IAdminNotification {
  adminId: Types.ObjectId;
  type: AdminNotificationType;
  ingestionRunId: Types.ObjectId | null;
  message: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * adminNotifications — in-app alerts for Administrators about pipeline problems (FR-39).
 * One row per admin per failed or stalled run.
 */
const adminNotificationSchema = new Schema<IAdminNotification>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["pipeline_run_failed"], required: true },
    ingestionRunId: { type: Schema.Types.ObjectId, ref: "IngestionRun", default: null },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ adminId: 1, read: 1, createdAt: -1 });

export const AdminNotification = model<IAdminNotification>("AdminNotification", adminNotificationSchema);
export default AdminNotification;
