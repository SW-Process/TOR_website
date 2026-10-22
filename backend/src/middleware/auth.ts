import type { Request, Response, NextFunction, RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { Session, User } from "../models";
import { verifyToken, sessionCookieName, sessionIdleTimeoutMs } from "../utils/token";
import { LAST_SEEN_RESOLUTION_MS } from "../services/sessions";
import type { UserRole } from "../models/User";
import type { AuthUser } from "../types/http";
import { securityLog } from "../utils/securityLog";

/**
 * Requests the frontend makes on a timer (chat and status polling) send this header, so
 * they don't count as the user being active: a tab left open must still time out.
 */
export const BACKGROUND_HEADER = "x-background-request";

/**
 * `code` of a 401 that means "you are not signed in (any more)", as opposed to a wrong
 * password or code: the frontend signs the user out of the UI on this one only.
 */
export const SESSION_INVALID = "session_invalid";

/**
 * The account a session cookie belongs to, or null when:
 * - the token is invalid or expired, or is not a session token (wrong `use`/`aud`/`iss`);
 * - the account is gone, or its token version is behind the user's (everything revoked;
 *   see User.tokenVersion);
 * - the session row is gone (that device was signed out), past its absolute end, or idle
 *   for longer than the inactivity timeout (ASVS 7.3.1, 7.3.2). An idle session is
 *   deleted here, so it can't come back.
 * The role comes from the database, not the token, so a role change applies at once.
 */
export async function sessionUser(token: string | undefined, req?: Request): Promise<AuthUser | null> {
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  if (!isValidObjectId(payload.sub) || !isValidObjectId(payload.sid)) return null;

  const [user, session] = await Promise.all([
    User.findById(payload.sub).select("role tokenVersion").lean(),
    Session.findOne({ _id: payload.sid, userId: payload.sub }).select("lastSeenAt expiresAt mfa createdAt").lean(),
  ]);
  if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0) || !session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null; // the TTL index removes it within a minute
  if (now - session.lastSeenAt.getTime() > sessionIdleTimeoutMs()) {
    await Session.deleteOne({ _id: session._id });
    securityLog(req, {
      event: "session.expired",
      outcome: "success",
      severity: "INFO",
      userId: String(user._id),
      sessionId: String(session._id),
      reason: "idle",
    });
    return null;
  }

  const background = req?.get(BACKGROUND_HEADER) === "1";
  if (!background && now - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date(now) } });
  }
  return {
    id: String(user._id),
    role: user.role,
    sessionId: String(session._id),
    mfa: session.mfa ?? false,
    signedInAt: session.createdAt,
  };
}

/**
 * Require a valid, still-current session cookie. Attaches `req.user = { id, role,
 * sessionId, ... }` on success, responds 401 otherwise.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[sessionCookieName()] as string | undefined;
  if (!token) {
    securityLog(req, { event: "authz.denied", outcome: "blocked", severity: "NOTICE", reason: "no_session" });
    res.status(401).json({ message: "Authentication required", code: SESSION_INVALID });
    return;
  }

  const user = await sessionUser(token, req);
  if (!user) {
    securityLog(req, { event: "authz.denied", outcome: "blocked", reason: "invalid_or_expired_session" });
    res.status(401).json({ message: "Invalid or expired session", code: SESSION_INVALID });
    return;
  }
  req.user = user;
  next();
}

/**
 * Attach `req.user` when a valid session cookie is present, but never blocks the
 * request — for endpoints usable by both anonymous and logged-in callers
 * (e.g. reporting a TOR error attributes it to the reporter when logged in).
 * A signed-out or invalid session proceeds as anonymous.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await sessionUser(req.cookies?.[sessionCookieName()] as string | undefined, req);
  if (user) req.user = user;
  next();
}

/**
 * Require the authenticated user to hold one of the given roles.
 * Use after requireAuth, e.g. `router.get("/x", requireAuth, requireRole("admin"), h)`.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      securityLog(req, { event: "authz.denied", outcome: "blocked", reason: "role", required: roles, role: req.user?.role });
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
