const { User } = require("../models");
const { signToken, cookieOptions, COOKIE_NAME } = require("../utils/token");
const httpError = require("../utils/httpError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateCredentials({ email, password }) {
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    throw httpError(400, "A valid email is required");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function sendSession(res, user, status) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.status(status).json({ user });
}

/** POST /api/auth/register — create a vendor account and start a session. */
async function register(req, res) {
  const { email, password } = req.body ?? {};
  validateCredentials({ email, password });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw httpError(409, "Email is already registered");

  const user = new User({ email, role: "vendor" });
  user.password = password;
  await user.save();

  sendSession(res, user, 201);
}

/** POST /api/auth/login — verify credentials and start a session. */
async function login(req, res) {
  const { email, password } = req.body ?? {};
  validateCredentials({ email, password });

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) {
    throw httpError(401, "Invalid email or password");
  }

  sendSession(res, user, 200);
}

/** POST /api/auth/logout — clear the session cookie. */
async function logout(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.status(200).json({ message: "Logged out" });
}

/** GET /api/auth/me — return the authenticated user. */
async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw httpError(401, "Account no longer exists");
  res.status(200).json({ user });
}

module.exports = { register, login, logout, me };
