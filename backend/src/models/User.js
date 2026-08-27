const { Schema, model } = require("mongoose");

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
    // null when the account is OAuth-only
    passwordHash: { type: String, default: null },
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

module.exports = model("User", userSchema);
