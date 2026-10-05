import type { Request, Response, NextFunction, RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { Session, User } from "../models";
import { verifyToken, COOKIE_NAME } from "../utils/token";
import { LAST_SEEN_RESOLUTION_MS, adoptLegacySession, legacyKeyOf } from "../services/sessions";
import type { UserRole } from "../models/User";
import type { AuthUser } from "../types/http";

/**
 * The account a session cookie belongs to, or null when the token is invalid or
 * expired, the account is gone, or the session was signed out — its row deleted
 * (one device revoked) or its token version behind the user's (everything revoked;
 * see User.tokenVersion). The role comes from the database, not the token, so a
 * role change applies at once. A token from before session rows existed has no
 * `sid`; it's matched to its adopted row by hash, or reported with no sessionId
 * until requireAuth adopts it.
 */
export async function sessionUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  if (!isValidObjectId(payload.sub)) return null;
  if (payload.sid !== undefined && !isValidObjectId(payload.sid)) return null;

  // A legacy cookie (no sid) is found by its hash once it has been adopted.
  const sessionFilter = payload.sid ? { _id: payload.sid } : { legacyKey: legacyKeyOf(token) };
  const [user, session] = await Promise.all([
    User.findById(payload.sub).select("role tokenVersion").lean(),
    Session.findOne({ ...sessionFilter, userId: payload.sub }).select("lastSeenAt revokedAt").lean(),
  ]);
  if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) return null;
  if (session?.revokedAt) return null; // an adopted legacy session that was signed out
  if (payload.sid && !session) return null;

  if (session && Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });
  }
  return { id: String(user._id), role: user.role, ...(session ? { sessionId: String(session._id) } : {}) };
}

/**
 * Require a valid, still-current session cookie. Attaches `req.user = { id, role,
 * sessionId }` on success, responds 401 otherwise. A legacy cookie (no session row)
 * is upgraded here — a row is created and the cookie re-issued — so every signed-in
 * device shows up in the session list. Only requireAuth upgrades: optionalAuth also
 * serves server-side fetches whose Set-Cookie would be thrown away, minting orphans.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const user = await sessionUser(token);
  if (!user) {
    res.status(401).json({ message: "Invalid or expired session" });
    return;
  }
  if (!user.sessionId) {
    const doc = await User.findById(user.id).select("+passwordHash");
    const method = doc?.googleOAuthId && !doc.passwordHash ? "google" : "password";
    const sessionId = doc ? await adoptLegacySession(req, res, doc, method, token) : null;
    if (!sessionId) {
      res.status(401).json({ message: "Invalid or expired session" });
      return;
    }
    user.sessionId = sessionId;
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
  const user = await sessionUser(req.cookies?.[COOKIE_NAME] as string | undefined);
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
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
