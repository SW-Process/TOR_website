import type { NextFunction, Request, Response } from "express";

/**
 * Content-Security-Policy for API responses. The backend only serves JSON and files,
 * never HTML, so nothing may load, run, be framed or submit from a response.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** One year, as ASVS 3.4.1 asks for, applied to subdomains too. */
const HSTS = "max-age=31536000; includeSubDomains";

/**
 * Browser security headers on every response (ASVS 3.4.1, 3.4.4–3.4.6, 3.2.1):
 * - Strict-Transport-Security: browsers only talk to us over HTTPS (ignored on plain-HTTP localhost).
 * - X-Content-Type-Options: nosniff: a response is only ever read as its declared type,
 *   so an uploaded file can't be sniffed into HTML or script.
 * - Content-Security-Policy / X-Frame-Options: nothing runs from a response and no page
 *   may embed one in a frame (clickjacking).
 * - Referrer-Policy: no URL (with ids or tokens in it) leaks to other sites.
 * - Cross-Origin-Opener-Policy: a page we open can't script the opener window.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Strict-Transport-Security", HSTS);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", API_CSP);
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
}
