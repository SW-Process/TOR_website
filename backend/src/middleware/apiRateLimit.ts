import { ipKeyGenerator, rateLimit as expressRateLimit } from "express-rate-limit";
import { securityLog } from "../utils/securityLog";
import { clientIp, rateLimitEnabled } from "./rateLimit";

/** Requests one client IP may make to the API per minute, across every route. */
export const API_LIMIT_PER_MINUTE = 300;

/**
 * Global per-IP limit in front of every API route (ASVS 2.4.1, threat T19), so no route,
 * signed in or not, can be hammered without bound. It is a ceiling well above normal use;
 * the stricter limiters on sign-in, MFA, password reset, re-auth, reports, views and chat
 * still apply on top. Like those, it is off under Jest unless RATE_LIMIT_ENABLED=true.
 *
 * Counts are in memory, per server instance. Server-side rendering in the frontend calls
 * the API from the frontend server's own IP, so those calls share one bucket.
 */
export const apiRateLimit = expressRateLimit({
  windowMs: 60 * 1000,
  limit: API_LIMIT_PER_MINUTE,
  standardHeaders: "draft-6",
  legacyHeaders: false,
  // The IP Express resolved (honours TRUST_PROXY); IPv6 addresses are grouped by /56.
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  skip: () => !rateLimitEnabled(),
  handler: (req, res, _next, options) => {
    securityLog(req, {
      event: "ratelimit.exceeded",
      outcome: "blocked",
      limiter: "api",
      max: API_LIMIT_PER_MINUTE,
      windowMs: options.windowMs,
    });
    res.status(429).json({ message: "Too many requests. Please wait a minute and try again." });
  },
});
