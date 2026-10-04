import crypto from "crypto";
import type { Request, Response } from "express";
import { Bookmark, ChatConversation, ChatMessage, ErrorReport, Notification, User, VendorProfile } from "../models";
import type { UserDocument } from "../models/User";
import { signToken, cookieOptions, COOKIE_NAME } from "../utils/token";
import { httpError } from "../utils/httpError";
import { getStorage } from "../storage";
import {
  isGoogleOAuthConfigured,
  buildGoogleAuthUrl,
  exchangeCodeForIdentity,
  type GoogleIdentity,
} from "../config/google";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const OAUTH_STATE_COOKIE = "oauth_state";
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

interface Credentials {
  email: string;
  password: string;
}

function validateCredentials(body: unknown): Credentials {
  const { email, password } = (body ?? {}) as Partial<Credentials>;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    throw httpError(400, "A valid email is required");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return { email, password };
}

/** Set the session cookie for `user`. */
function issueSession(res: Response, user: UserDocument): void {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
}

function sendSession(res: Response, user: UserDocument, status: number): void {
  issueSession(res, user);
  res.status(status).json({ user });
}

function clientUrl(path: string): string {
  const base = process.env.CLIENT_ORIGIN || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

/** POST /api/auth/register — create a vendor account and start a session. */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = validateCredentials(req.body);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw httpError(409, "Email is already registered");

  const user = new User({ email, role: "vendor" });
  user.set("password", password);
  await user.save();

  sendSession(res, user, 201);
}

/** POST /api/auth/login — verify credentials and start a session. */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = validateCredentials(req.body);

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) {
    throw httpError(401, "Invalid email or password");
  }

  sendSession(res, user, 200);
}

/** POST /api/auth/logout — clear the session cookie. */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.status(200).json({ message: "Logged out" });
}

/** The caller's User with its password hash loaded (for account checks), or 401. */
async function loadAccount(req: Request): Promise<UserDocument> {
  const user = await User.findById(req.user!.id).select("+passwordHash");
  if (!user) throw httpError(401, "Account no longer exists");
  return user;
}

/** Public user JSON plus the account-settings flags the hash itself must never leak. */
function accountView(user: UserDocument) {
  return { ...user.toJSON(), hasPassword: !!user.passwordHash, googleLinked: !!user.googleOAuthId };
}

/** Accounts with a password must confirm it; Google-only accounts (no hash) have none to give. */
async function confirmPassword(user: UserDocument, candidate: unknown): Promise<void> {
  if (!user.passwordHash) return;
  if (typeof candidate !== "string" || !(await user.comparePassword(candidate))) {
    throw httpError(401, "Current password is incorrect");
  }
}

/** GET /api/auth/me — return the authenticated user. */
export async function me(req: Request, res: Response): Promise<void> {
  const user = await loadAccount(req);
  res.status(200).json({ user: accountView(user) });
}

const MAX_DISPLAY_NAME_LENGTH = 60;

/** PATCH /api/auth/me — update the display name; blank resets it to the email-derived default. */
export async function updateAccount(req: Request, res: Response): Promise<void> {
  const { displayName } = (req.body ?? {}) as { displayName?: unknown };
  if (typeof displayName !== "string") throw httpError(400, "displayName is required");
  const name = displayName.trim();
  if (name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw httpError(400, `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`);
  }

  const user = await loadAccount(req);
  user.displayName = name || null;
  await user.save();
  res.status(200).json({ user: accountView(user) });
}

/**
 * Save `user` with a bumped token version — which signs out every existing session —
 * then re-issue this device's cookie under the new version. The cookie goes out only
 * after the save, so a failed write can't strand this device on a version the
 * database never reached.
 */
async function saveAndRevokeOtherSessions(res: Response, user: UserDocument): Promise<void> {
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  issueSession(res, user);
}

/**
 * PUT /api/auth/password — change the password (current one required), or set a
 * first one on a Google-only account. Every other device is signed out; this one
 * stays signed in.
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const user = await loadAccount(req);
  await confirmPassword(user, currentPassword);
  user.set("password", newPassword);
  await saveAndRevokeOtherSessions(res, user);
  res.status(200).json({ user: accountView(user) });
}

/** POST /api/auth/logout-others — sign out every device except this one. */
export async function logoutOthers(req: Request, res: Response): Promise<void> {
  const user = await loadAccount(req);
  await saveAndRevokeOtherSessions(res, user);
  res.status(200).json({ user: accountView(user) });
}

/**
 * PUT /api/auth/email — change the sign-in email. Needs the current password, so a
 * Google-only account must set one first. A linked Google login keeps working: it
 * matches on googleOAuthId, not on email.
 */
export async function changeEmail(req: Request, res: Response): Promise<void> {
  const { email, currentPassword } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    throw httpError(400, "A valid email is required");
  }
  const next = email.trim().toLowerCase();

  const user = await loadAccount(req);
  if (!user.passwordHash) throw httpError(400, "Set a password before changing your email");
  await confirmPassword(user, currentPassword);

  if (next !== user.email) {
    if (await User.exists({ email: next })) throw httpError(409, "Email is already registered");
    user.email = next;
    await user.save();
  }
  res.status(200).json({ user: accountView(user) });
}

/**
 * DELETE /api/auth/me — permanently delete a vendor account and the data tied to it
 * (profile, bookmarks, notifications, chat, avatar). Error reports it filed stay, but
 * anonymised. Confirms with the password, or the account email for Google-only accounts.
 * Admin accounts are not self-deletable, so the panel can't be locked out by accident.
 */
export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const { currentPassword, confirmEmail } = (req.body ?? {}) as Record<string, unknown>;
  const user = await loadAccount(req);
  if (user.role === "admin") throw httpError(403, "Admin accounts cannot be deleted here");

  if (user.passwordHash) {
    await confirmPassword(user, currentPassword);
  } else if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== user.email) {
    throw httpError(400, "Type your account email to confirm");
  }

  const profile = await VendorProfile.findOne({ userId: user._id }).select("_id");
  if (profile) {
    await Promise.all([
      Bookmark.deleteMany({ vendorId: profile._id }),
      Notification.deleteMany({ vendorId: profile._id }),
    ]);
    await profile.deleteOne();
  }

  const conversations = await ChatConversation.find({ user: user._id }).distinct("_id");
  await ChatMessage.deleteMany({ conversation: { $in: conversations } });
  await ChatConversation.deleteMany({ _id: { $in: conversations } });
  await ErrorReport.updateMany({ reportedBy: user._id }, { $set: { reportedBy: null } });

  if (user.avatarKey) {
    await getStorage().delete?.(user.avatarKey).catch(() => {}); // an orphaned blob is harmless
  }
  await user.deleteOne();

  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.status(200).json({ message: "Account deleted" });
}

/** POST /api/auth/avatar — upload/replace the caller's profile picture. */
export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw httpError(400, "An image file is required");
  if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
    throw httpError(400, "Avatar must be a JPEG, PNG, WebP, or GIF image");
  }

  const user = await User.findById(req.user!.id);
  if (!user) throw httpError(401, "Account no longer exists");

  const key = `avatars/${user.id}`;
  await getStorage().put(key, file.buffer, { contentType: file.mimetype });
  user.avatarKey = key;
  user.avatarContentType = file.mimetype;
  await user.save();

  res.status(200).json({ user });
}

/** GET /api/auth/avatar/:userId — stream a user's avatar image (public, no auth). */
export async function streamAvatar(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.params.userId);
  if (!user?.avatarKey) throw httpError(404, "No avatar for this user");

  let stream: NodeJS.ReadableStream;
  try {
    stream = await getStorage().getStream(user.avatarKey);
  } catch {
    throw httpError(404, "Stored avatar is unavailable");
  }

  res.setHeader("Content-Type", user.avatarContentType ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=300");
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

/* ------------------------------ Google OAuth ------------------------------- */

/** GET /api/auth/google — redirect the browser to Google's consent screen (FR-21). */
export async function googleStart(_req: Request, res: Response): Promise<void> {
  if (!isGoogleOAuthConfigured()) throw httpError(503, "Google sign-in is not available");

  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...cookieOptions(),
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(buildGoogleAuthUrl(state));
}

/**
 * GET /api/auth/google/callback — Google redirects here with `code` + `state`.
 * Verifies the identity, upserts the User, starts a session, and bounces the
 * browser back to the frontend.
 */
export async function googleCallback(req: Request, res: Response): Promise<void> {
  const fail = (reason: string) => res.redirect(clientUrl(`/login?error=${reason}`));

  if (!isGoogleOAuthConfigured()) return fail("google_unavailable");

  const { code, state } = req.query;
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
  res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions());

  if (typeof code !== "string" || typeof state !== "string" || state !== expectedState) {
    return fail("google_state");
  }

  let identity: GoogleIdentity;
  try {
    identity = await exchangeCodeForIdentity(code);
  } catch {
    return fail("google_exchange");
  }
  if (!identity.emailVerified) return fail("google_unverified_email");

  const email = identity.email.toLowerCase();
  let user = await User.findOne({ googleOAuthId: identity.googleId });
  let isNew = false;

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      user.googleOAuthId = identity.googleId; // link Google to the existing account
      await user.save();
    } else {
      user = await User.create({ email, role: "vendor", googleOAuthId: identity.googleId });
      isNew = true;
    }
  }

  issueSession(res, user);
  res.redirect(clientUrl(isNew ? "/account/profile?onboarding=1" : "/dashboard"));
}
