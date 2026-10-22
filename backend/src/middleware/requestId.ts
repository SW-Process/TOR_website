import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** Cloud Run's trace header: `TRACE_ID/SPAN_ID;o=1`, TRACE_ID being 32 hex characters. */
const CLOUD_TRACE = /^([0-9a-f]{32})\//i;

/**
 * Give every request an id that its log entries share (ASVS 16.2.1), echoed back as
 * `X-Request-Id` so a user's error report can be matched to the log. Behind Cloud Run the
 * trace id is reused, so our entries line up with the platform's request log. Only a
 * well-formed trace id is taken from the header; anything else gets a random id, so a
 * client can't inject text into the logs through it.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const trace = CLOUD_TRACE.exec(req.get("x-cloud-trace-context") ?? "");
  req.requestId = trace ? trace[1]!.toLowerCase() : randomBytes(16).toString("hex");
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
