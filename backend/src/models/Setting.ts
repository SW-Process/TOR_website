import { Schema, model, type Types } from "mongoose";

/** Keys of the admin-configurable settings. Each key has one document and its own zod schema for `value`. */
export type SettingKey = "fairness-prefilter";

export interface ISetting {
  key: SettingKey;
  value: unknown;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * settings — admin-configurable values that would otherwise be hard-coded (FR-20).
 * One document per key. `value` is validated by the owning module (e.g.
 * services/fairnessSettings.ts) on write and again on read, so a bad row falls back
 * to the defaults instead of breaking the pipeline.
 */
const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, enum: ["fairness-prefilter"], required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, minimize: false }
);

export const Setting = model<ISetting>("Setting", settingSchema);
export default Setting;
