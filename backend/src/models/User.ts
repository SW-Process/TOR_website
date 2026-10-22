import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { createHmac } from "node:crypto";
import bcrypt from "bcrypt";
import { MAX_PASSWORD_BYTES, MAX_PASSWORD_LENGTH, passwordByteLength } from "../utils/passwordPolicy";

/** bcrypt work factor (ASVS 11.4.2): about 250 ms per hash on Cloud Run. */
const SALT_ROUNDS = 12;
/** Marks hashes made from the pre-hashed password (below); a bare `$2b$…` is a legacy hash. */
const PREHASH_PREFIX = "v2$";

/**
 * bcrypt reads only 72 bytes. To allow long passwords (ASVS 6.2.9, up to
 * MAX_PASSWORD_LENGTH characters, Thai included), bcrypt hashes the base64 HMAC-SHA256
 * of the password instead (44 bytes). The fixed HMAC key just separates our pre-hashes
 * from plain SHA-256 dumps elsewhere (no "hash shucking"); the salt and cost are still
 * bcrypt's. Algorithm, cost and prefix can change together (ASVS 11.2.2): hashes carry
 * their scheme, and sign-in upgrades old ones.
 */
function prehash(password: string): string {
  return createHmac("sha256", "tor-checker/password-prehash/v1").update(password, "utf8").digest("base64");
}

/** Whether a stored hash is from before pre-hashing, so it should be replaced at the next sign-in. */
export function isLegacyPasswordHash(hash: string | null | undefined): boolean {
  return !!hash && !hash.startsWith(PREHASH_PREFIX);
}

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
  /** TOTP second factor is on: every sign-in also needs a code (services/mfa). */
  mfaEnabled: boolean;
  mfaEnabledAt: Date | null;
  /** The TOTP seed, sealed with AES-256-GCM (utils/secretBox). */
  mfaSecretEnc: string | null;
  /** A seed being set up, not yet confirmed with a code. */
  mfaPendingSecretEnc: string | null;
  mfaPendingAt: Date | null;
  /** Last accepted TOTP step: a code is accepted once only (ASVS 6.5.1). */
  mfaLastStep: number | null;
  /** Single-use recovery codes, bcrypt-hashed (ASVS 6.5.2). */
  mfaRecoveryCodes: IRecoveryCode[];
  /** Id of the one password/Google step that may still be completed with a code. */
  mfaPendingLoginJti: string | null;
  /** Wrong codes entered on that pending step. */
  mfaPendingFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRecoveryCode {
  hash: string;
  usedAt: Date | null;
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
    mfaEnabled: { type: Boolean, default: false },
    mfaEnabledAt: { type: Date, default: null },
    // Never selected by default — only services/mfa reads these.
    mfaSecretEnc: { type: String, default: null, select: false },
    mfaPendingSecretEnc: { type: String, default: null, select: false },
    mfaPendingAt: { type: Date, default: null, select: false },
    mfaLastStep: { type: Number, default: null, select: false },
    mfaRecoveryCodes: {
      type: [new Schema<IRecoveryCode>({ hash: { type: String, required: true }, usedAt: { type: Date, default: null } }, { _id: false })],
      default: [],
      select: false,
    },
    mfaPendingLoginJti: { type: String, default: null, select: false },
    mfaPendingFailures: { type: Number, default: 0, select: false },
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
  self.passwordHash = PREHASH_PREFIX + (await bcrypt.hash(prehash(self._plainPassword), SALT_ROUNDS));
  self._plainPassword = undefined;
});

/**
 * Compare a plaintext candidate against the stored hash.
 * Requires the document to be loaded with `.select("+passwordHash")`.
 */
userSchema.methods.comparePassword = function (this: UserDocument, candidate: string) {
  if (!this.passwordHash) return Promise.resolve(false);
  if (candidate.length > MAX_PASSWORD_LENGTH) return Promise.resolve(false);
  if (this.passwordHash.startsWith(PREHASH_PREFIX)) {
    return bcrypt.compare(prehash(candidate), this.passwordHash.slice(PREHASH_PREFIX.length));
  }
  // Legacy hash of the raw password: bcrypt would compare only the first 72 bytes, so a
  // longer candidate could match a stored password it merely starts with. Refuse it.
  if (passwordByteLength(candidate) > MAX_PASSWORD_BYTES) return Promise.resolve(false);
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
    delete out.mfaSecretEnc;
    delete out.mfaPendingSecretEnc;
    delete out.mfaPendingAt;
    delete out.mfaLastStep;
    delete out.mfaRecoveryCodes;
    delete out.mfaPendingLoginJti;
    delete out.mfaPendingFailures;
    delete out.__v;
    return out;
  },
});

export const User = model<IUser, UserModel>("User", userSchema);
export default User;
