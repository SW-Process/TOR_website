import type { Request, Response, NextFunction } from "express";
import { Error as MongooseError } from "mongoose";

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
  _req: Request,
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

  // Mongoose validation
  if (err instanceof MongooseError.ValidationError) {
    res.status(400).json({
      message: "Validation failed",
      errors: Object.values(err.errors).map((detail) => detail.message),
    });
    return;
  }

  const status = e.status ?? e.statusCode ?? 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: e.message || "Internal server error" });
}
