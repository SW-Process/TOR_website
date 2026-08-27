const jwt = require("jsonwebtoken");

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const COOKIE_NAME = "token";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

/** Sign a JWT carrying the user id and role. */
function signToken(user) {
  return jwt.sign({ role: user.role }, getSecret(), {
    subject: String(user._id),
    expiresIn: JWT_EXPIRES_IN,
  });
}

/** Verify a JWT and return its payload, or throw. */
function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

/** Cookie options for the auth token — HttpOnly + Secure in production. */
function cookieOptions() {
  const days = Number.parseInt(JWT_EXPIRES_IN, 10) || 7;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

module.exports = { signToken, verifyToken, cookieOptions, COOKIE_NAME };
