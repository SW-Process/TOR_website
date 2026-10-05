import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { Session, type SessionMethod } from "../models";
import type { UserDocument } from "../models/User";
import { COOKIE_NAME, cookieOptions, sessionLifetimeMs, signToken } from "../utils/token";

/** Longest User-Agent kept per session; real ones are well under this. */
const MAX_USER_AGENT_LENGTH = 400;
/** lastSeenAt is refreshed at most this often, so most requests do no session write. */
export const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;

/** Set the session cookie for `user`, bound to session row `sessionId`. */
export function setSessionCookie(res: Response, user: UserDocument, sessionId: string): void {
  res.cookie(COOKIE_NAME, signToken(user, sessionId), cookieOptions());
}

/** The fields a new session row records about this request's device. */
function deviceFields(req: Request, user: UserDocument, method: SessionMethod) {
  const now = new Date();
  return {
    userId: user._id,
    method,
    userAgent: String(req.get("user-agent") ?? "").slice(0, MAX_USER_AGENT_LENGTH),
    ip: req.ip ?? null,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + sessionLifetimeMs()),
  };
}

/** Record a new sign-in from this request's device and hand it its cookie. */
export async function startSession(
  req: Request,
  res: Response,
  user: UserDocument,
  method: SessionMethod
): Promise<string> {
  const session = await Session.create(deviceFields(req, user, method));
  setSessionCookie(res, user, session.id);
  return session.id;
}

/** Stable key for a pre-session cookie: the same token always maps to the same row. */
export function legacyKeyOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const DUPLICATE_KEY = 11000;

/**
 * Give a cookie from before session tracking its row, so the device shows up in the
 * session list and can be signed out. Keyed by the token's hash with a unique index:
 * a page load fires several signed-in requests at once, and they must all land on one
 * row (a plain insert per request left phantom "devices"). Returns null when that
 * row was signed out (tombstoned) — the old cookie must not come back to life.
 */
export async function adoptLegacySession(
  req: Request,
  res: Response,
  user: UserDocument,
  method: SessionMethod,
  token: string
): Promise<string | null> {
  const legacyKey = legacyKeyOf(token);
  let row;
  try {
    row = await Session.findOneAndUpdate(
      { legacyKey },
      { $setOnInsert: { ...deviceFields(req, user, method), legacyKey, revokedAt: null } },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (err) {
    // Two upserts raced on the unique key: the other one inserted; read its row.
    if ((err as { code?: number }).code !== DUPLICATE_KEY) throw err;
    row = await Session.findOne({ legacyKey }).lean();
  }
  if (!row || row.revokedAt) return null;
  setSessionCookie(res, user, String(row._id));
  return String(row._id);
}

/**
 * Sign out the sessions matching `filter` (already scoped to one user by the caller).
 * Ordinary rows are deleted; adopted legacy rows are tombstoned (see ISession.revokedAt).
 * Returns how many live sessions were ended.
 */
export async function endSessions(filter: Record<string, unknown>): Promise<number> {
  const [tombstoned, deleted] = await Promise.all([
    Session.updateMany({ ...filter, legacyKey: { $type: "string" }, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    Session.deleteMany({ ...filter, legacyKey: null }),
  ]);
  return tombstoned.modifiedCount + deleted.deletedCount;
}
