const { Schema, model } = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 12;

/**
 * users — shared identity for Vendor and Admin accounts.
 * Public users need no account and are never stored here.
 */
const userSchema = new Schema(
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
userSchema.virtual("password").set(function (plain) {
  this._plainPassword = plain;
});

userSchema.pre("save", async function () {
  if (!this._plainPassword) return;
  this.passwordHash = await bcrypt.hash(this._plainPassword, SALT_ROUNDS);
  this._plainPassword = undefined;
});

/**
 * Compare a plaintext candidate against the stored hash.
 * Requires the document to be loaded with `.select("+passwordHash")`.
 */
userSchema.methods.comparePassword = function (candidate) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.passwordHash);
};

// Strip sensitive / noisy fields from any JSON serialization
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = model("User", userSchema);
