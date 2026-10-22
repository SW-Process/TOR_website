import type { Request, Response, NextFunction } from "express";
import { Error as MongooseError } from "mongoose";
import { MulterError } from "multer";
import { securityLog } from "../utils/securityLog";

/** 404 fallthrough for unmatched routes. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

interface MaybeHttpError {
  status?: number;
  statusCode?: number;
  code?: number;
  message?: string;
}

/**
 * Central error handler. Controllers can `throw` or `next(err)` and land here.
 * Must keep all four args so Express recognizes it as an error handler.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const e = (err ?? {}) as MaybeHttpError;

  // Mongo duplicate key (e.g. email already registered)
  if (e.code === 11000) {
    res.status(409).json({ message: "Resource already exists" });
    return;
  }

  if (err instanceof MulterError) {
    securityLog(req, { event: "input.rejected", outcome: "blocked", severity: "NOTICE", reason: "upload", detail: err.code });
    res.status(400).json({ message: err.message });
    return;
  }

  // Mongoose validation
  if (err instanceof MongooseError.ValidationError) {
    securityLog(req, { event: "input.rejected", outcome: "blocked", severity: "NOTICE", reason: "schema", fields: Object.keys(err.errors) });
    res.status(400).json({
      message: "Validation failed",
      errors: Object.values(err.errors).map((detail) => detail.message),
    });
    return;
  }

  if (err instanceof MongooseError.CastError) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  const raw = e.status ?? e.statusCode;
  const status = typeof raw === "number" && raw >= 400 && raw <= 599 ? raw : 500;

  // 5xx: the cause is ours, not the client's. Log the full error server-side but
  // answer with a fixed message, so stack details, driver errors, file paths or
  // config names never reach the client (ASVS V16 error handling).
  if (status >= 500) {
    securityLog(req, {
      event: "error.unexpected",
      outcome: "failure",
      severity: "ERROR",
      status,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join(" | ") : undefined,
    });
    res.status(status).json({ message: "Internal server error" });
    return;
  }
  if (status === 400) {
    // Our own validation said no: worth a line, since probing for gaps in validation looks like this (ASVS 16.3.3).
    securityLog(req, { event: "input.rejected", outcome: "blocked", severity: "NOTICE", reason: "validation", message: e.message });
  }
  res.status(status).json({ message: e.message || "Request failed" });
}
