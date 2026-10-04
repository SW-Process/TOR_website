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

/** Record a new sign-in from this request's device and hand it its cookie. */
export async function startSession(
  req: Request,
  res: Response,
  user: UserDocument,
  method: SessionMethod
): Promise<string> {
  const now = new Date();
  const session = await Session.create({
    userId: user._id,
    method,
    userAgent: String(req.get("user-agent") ?? "").slice(0, MAX_USER_AGENT_LENGTH),
    ip: req.ip ?? null,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + sessionLifetimeMs()),
  });
  setSessionCookie(res, user, session.id);
  return session.id;
}
