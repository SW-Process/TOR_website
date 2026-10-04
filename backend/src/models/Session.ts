import { Schema, model, type Types } from "mongoose";

export type SessionMethod = "password" | "google";

export interface ISession {
  userId: Types.ObjectId;
  method: SessionMethod;
  /** Raw User-Agent at sign-in (truncated); parsed for display by utils/userAgent. */
  userAgent: string;
  /** Client IP at sign-in, as Express saw it. */
  ip: string | null;
  lastSeenAt: Date;
  /** Matches the session token's expiry; a TTL index removes the row after it. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * sessions — one per sign-in (password or Google). The session token carries this
 * row's id; deleting the row signs that device out, which is what the account
 * settings "อุปกรณ์ที่เข้าสู่ระบบ" page lists and revokes.
 */
const sessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    method: { type: String, enum: ["password", "google"], required: true },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: null },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>("Session", sessionSchema);
export default Session;
