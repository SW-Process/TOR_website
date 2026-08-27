import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export type UserRole = "vendor" | "admin";

export interface IUser {
  email: string;
  passwordHash: string | null;
  googleOAuthId: string | null;
  role: UserRole;
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
    // bcrypt hash — never selected by default, set via the `password` virtual
    passwordHash: { type: String, default: null, select: false },
    // null when the account has never used Google sign-in
    googleOAuthId: { type: String, default: null, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["vendor", "admin"],
      required: true,
    },
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
    delete out.passwordHash;
    delete out.__v;
    return out;
  },
});

export const User = model<IUser, UserModel>("User", userSchema);
export default User;
