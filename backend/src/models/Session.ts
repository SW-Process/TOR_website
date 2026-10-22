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
  /** Absolute end of the session (sign-in + SESSION_MAX_HOURS); the token expires with it and a TTL index removes the row. */
  expiresAt: Date;
  /** The second factor (TOTP or a recovery code) was checked when this session started. */
  mfa: boolean;
  /** Last time this session re-entered its factors for a sensitive change (services/reauth). */
  reauthAt: Date | null;
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
    mfa: { type: Boolean, default: false },
    reauthAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>("Session", sessionSchema);
export default Session;
