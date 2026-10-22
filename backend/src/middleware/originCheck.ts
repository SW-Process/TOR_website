import type { NextFunction, Request, Response } from "express";

import { securityLog } from "../utils/securityLog";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The capture route the admin Chrome extension posts to (extension/background.js). */
const EXTENSION_ROUTE = "/api/ingestion/capture";

function allowedOrigins(): Set<string> {
  const list = [process.env.CLIENT_ORIGIN || "http://localhost:3000", ...(process.env.TRUSTED_ORIGINS ?? "").split(",")];
  return new Set(list.map((o) => o.trim().replace(/\/$/, "")).filter(Boolean));
}

/**
 * Cross-site request forgery guard (ASVS 3.5.1, 3.5.2). Our session is a cookie, so a
 * page on another site could make the browser send a state-changing request with it,
 * including simple requests that skip the CORS preflight (a form POST, or a POST with no
 * body like /logout-others). Browsers always label such requests:
 * - `Origin` must be our frontend (CLIENT_ORIGIN, plus any TRUSTED_ORIGINS);
 * - with no Origin, `Sec-Fetch-Site` must not be "cross-site".
 * A request with neither header doesn't come from a browser, so it carries no victim's
 * cookies and is let through (curl, server-to-server, tests).
 * The admin Chrome extension (Origin chrome-extension://…) may only reach its capture
 * route, which still needs an admin session.
 */
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin) {
    if (allowedOrigins().has(origin)) return next();
    if (origin.startsWith("chrome-extension://") && req.path === EXTENSION_ROUTE) return next();
    securityLog(req, { event: "csrf.blocked", outcome: "blocked", origin });
    res.status(403).json({ message: "Cross-site request blocked" });
    return;
  }

  if (req.get("sec-fetch-site") === "cross-site") {
    securityLog(req, { event: "csrf.blocked", outcome: "blocked", secFetchSite: "cross-site" });
    res.status(403).json({ message: "Cross-site request blocked" });
    return;
  }
  next();
}
