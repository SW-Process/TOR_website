import type { Request, Response } from "express";
import { Session, type SessionMethod } from "../models";
import type { UserDocument } from "../models/User";
import { cookieOptions, sessionCookieName, sessionLifetimeMs, signToken } from "../utils/token";
import { securityLog } from "../utils/securityLog";

/** Longest User-Agent kept per session; real ones are well under this. */
const MAX_USER_AGENT_LENGTH = 400;
/**
 * lastSeenAt is refreshed at most this often, so most requests do no session write. It is
 * also the precision of the inactivity timeout: a session can live this much past it.
 */
export const LAST_SEEN_RESOLUTION_MS = 60 * 1000;
/**
 * Most signed-in devices one account may have at once (ASVS 7.1.2). Signing in on one
 * more ends the least recently used session, so a forgotten device drops off rather than
 * the new sign-in failing. See docs/security/session-management.md.
 */
export const MAX_SESSIONS_PER_USER = 10;

/** Set the session cookie for `user`, bound to session row `sessionId`, ending when the row does. */
export function setSessionCookie(res: Response, user: UserDocument, sessionId: string, expiresAt: Date): void {
  res.cookie(sessionCookieName(), signToken(user, sessionId, expiresAt), cookieOptions(expiresAt));
}

export interface StartSessionOptions {
  /** The second factor was checked for this sign-in (stored as the session's `mfa`). */
  mfa?: boolean;
}

/** Record a new sign-in from this request's device and hand it its cookie. */
export async function startSession(
  req: Request,
  res: Response,
  user: UserDocument,
  method: SessionMethod,
  options: StartSessionOptions = {}
): Promise<string> {
  const now = new Date();
  const session = await Session.create({
    userId: user._id,
    method,
    mfa: options.mfa ?? false,
    userAgent: String(req.get("user-agent") ?? "").slice(0, MAX_USER_AGENT_LENGTH),
    ip: req.ip ?? null,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + sessionLifetimeMs()),
  });
  setSessionCookie(res, user, session.id, session.expiresAt);
  await evictExtraSessions(req, user);
  securityLog(req, { event: "session.start", outcome: "success", userId: user.id, sessionId: session.id, method, mfa: session.mfa });
  return session.id;
}

/** Keep at most MAX_SESSIONS_PER_USER sessions: the least recently used beyond that are ended. */
async function evictExtraSessions(req: Request, user: UserDocument): Promise<void> {
  const extra = await Session.find({ userId: user._id })
    .sort({ lastSeenAt: -1, _id: -1 })
    .skip(MAX_SESSIONS_PER_USER)
    .select("_id")
    .lean();
  if (extra.length === 0) return;
  await Session.deleteMany({ _id: { $in: extra.map((s) => s._id) } });
  securityLog(req, { event: "session.evicted", outcome: "success", userId: user.id, count: extra.length, reason: "max_sessions" });
}

/**
 * Sign out the sessions matching `filter` (already scoped to one user by the caller).
 * Returns how many sessions were ended.
 */
export async function endSessions(filter: Record<string, unknown>): Promise<number> {
  const { deletedCount } = await Session.deleteMany(filter);
  return deletedCount;
}
