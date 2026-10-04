import type { Request, Response, NextFunction, RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { User } from "../models";
import { verifyToken, COOKIE_NAME } from "../utils/token";
import type { UserRole } from "../models/User";
import type { AuthUser } from "../types/http";

/**
 * The account a session cookie belongs to, or null when the token is invalid or
 * expired, the account is gone, or the session was signed out (its token version
 * is behind the user's — see User.tokenVersion). The role comes from the database,
 * not the token, so a role change applies at once.
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

  const user = await User.findById(payload.sub).select("role tokenVersion").lean();
  if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) return null;
  return { id: String(user._id), role: user.role };
}

/**
 * Require a valid, still-current session cookie. Attaches `req.user = { id, role }`
 * on success, responds 401 otherwise.
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
