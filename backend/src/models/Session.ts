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
  /**
   * sha256 of the pre-session cookie this row was adopted for (see adoptLegacySession);
   * null for rows created at sign-in. Unique, so concurrent first requests share one row.
   */
  legacyKey: string | null;
  /**
   * Set instead of deleting an adopted row when it's signed out: the old cookie can't
   * carry a session id, so the tombstone is what keeps it from being adopted again.
   * The TTL index still removes it at expiresAt.
   */
  revokedAt: Date | null;
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
    legacyKey: { type: String, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ legacyKey: 1 }, { unique: true, partialFilterExpression: { legacyKey: { $type: "string" } } });

export const Session = model<ISession>("Session", sessionSchema);
export default Session;
