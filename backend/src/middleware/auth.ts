import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyToken, COOKIE_NAME } from "../utils/token";
import type { UserRole } from "../models/User";

/**
 * Require a valid auth cookie. Attaches `req.user = { id, role }` on success,
 * responds 401 otherwise.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session" });
  }
}

/**
 * Attach `req.user` when a valid auth cookie is present, but never blocks the
 * request — for endpoints usable by both anonymous and logged-in callers
 * (e.g. reporting a TOR error attributes it to the reporter when logged in).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // invalid/expired cookie on an optional-auth route — proceed as anonymous
  }
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
