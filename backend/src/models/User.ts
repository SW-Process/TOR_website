import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export type UserRole = "vendor" | "admin";

export interface IUser {
  email: string;
  /** Name shown in the header and greetings; null falls back to the email's local part on the client. */
  displayName: string | null;
  passwordHash: string | null;
  googleOAuthId?: string;
  role: UserRole;
  avatarKey?: string;
  avatarContentType?: string;
  /** Bumped to sign out every session issued before (password change, "log out other devices"). */
  tokenVersion: number;
  /** sha256 of the current "forgot password" token, if any; the raw token is only ever in the emailed link. */
  resetPasswordTokenHash: string | null;
  /** When the current reset token stops being accepted. */
  resetPasswordExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, {}, IUserMethods>;

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

interface UserDocumentInternals {
  _plainPassword?: string;
}

/**
 * users — shared identity for Vendor and Admin accounts.
 * Public users need no account and are never stored here.
 */
const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: { type: String, trim: true, maxlength: 60, default: null },
    // bcrypt hash — never selected by default, set via the `password` virtual
    passwordHash: { type: String, default: null, select: false },
    // Left unset (not null) for email/password accounts — a `null` default would
    // put every such account into the sparse unique index and collide on the 2nd one.
    googleOAuthId: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["vendor", "admin"],
      required: true,
    },
    // storage key for the uploaded avatar image (see storage/); avatarUrl is
    // derived from this in toJSON rather than exposed directly.
    avatarKey: { type: String },
    avatarContentType: { type: String },
    // Every session token carries the version it was issued under; a token whose
    // version no longer matches is rejected by the auth middleware.
    tokenVersion: { type: Number, default: 0 },
    // Never selected by default — only authController's reset flow reads these.
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

/**
 * Assign a plaintext password; it is hashed in the pre-save hook below.
 * e.g. `user.password = "secret123"` then `await user.save()`.
 */
userSchema.virtual("password").set(function (this: UserDocumentInternals, plain: string) {
  this._plainPassword = plain;
});

userSchema.pre("save", async function () {
  const self = this as UserDocument & UserDocumentInternals;
  if (!self._plainPassword) return;
  self.passwordHash = await bcrypt.hash(self._plainPassword, SALT_ROUNDS);
  self._plainPassword = undefined;
});

/**
 * Compare a plaintext candidate against the stored hash.
 * Requires the document to be loaded with `.select("+passwordHash")`.
 */
userSchema.methods.comparePassword = function (this: UserDocument, candidate: string) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.passwordHash);
};

// Strip sensitive / noisy fields from any JSON serialization
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const out = ret as unknown as Record<string, unknown>;
    out.avatarUrl = out.avatarKey ? `/api/auth/avatar/${out._id}` : null;
    delete out.passwordHash;
    delete out.avatarKey;
    delete out.avatarContentType;
    delete out.tokenVersion;
    delete out.resetPasswordTokenHash;
    delete out.resetPasswordExpiresAt;
    delete out.__v;
    return out;
  },
});

export const User = model<IUser, UserModel>("User", userSchema);
export default User;
