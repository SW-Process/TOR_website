import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  /** Length of one counting window, in milliseconds. */
  windowMs: number;
  /** Requests allowed per key in one window; the next one gets 429. */
  max: number;
  /** What to count by. Defaults to the client IP (see TRUST_PROXY for proxies). */
  key?: (req: Request) => string;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Limits are on everywhere except under Jest, where suites log in hundreds of times.
 * RATE_LIMIT_ENABLED=true|false overrides that (the limiter's own tests turn it on).
 */
function enabled(): boolean {
  const flag = process.env.RATE_LIMIT_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "test";
}

/** The client IP Express resolved (honours `trust proxy`), or a fixed bucket if unknown. */
export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Fixed-window rate limiter kept in memory, against brute force, credential stuffing and
 * spam (ASVS 6.3.1, 2.4.1). Each limiter counts on its own. Counts are per server instance:
 * with several Cloud Run instances an attacker gets `max` per instance, still a hard cap.
 * Answers 429 with Retry-After once a key is over the limit.
 */
export function rateLimit({ windowMs, max, key = clientIp }: RateLimitOptions) {
  const windows = new Map<string, Window>();
  let lastSweep = Date.now();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    if (!enabled()) return next();

    const now = Date.now();
    // Drop finished windows now and then, so the map can't grow without bound.
    if (now - lastSweep > windowMs) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      lastSweep = now;
    }

    const k = key(req);
    let w = windows.get(k);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      windows.set(k, w);
    }
    w.count += 1;

    const resetSeconds = Math.ceil((w.resetAt - now) / 1000);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - w.count)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (w.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(429).json({ message: "Too many attempts. Please wait a few minutes and try again." });
      return;
    }
    next();
  };
}
