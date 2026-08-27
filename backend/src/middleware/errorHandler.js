/* eslint-disable no-unused-vars */

/** 404 fallthrough for unmatched routes. */
function notFound(req, res, next) {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

/**
 * Central error handler. Controllers can `throw` or `next(err)` and land here.
 * Must keep all four args so Express recognizes it as an error handler.
 */
function errorHandler(err, req, res, next) {
  // Mongo duplicate key (e.g. email already registered)
  if (err.code === 11000) {
    return res.status(409).json({ message: "Resource already exists" });
  }
  // Mongoose validation
  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Validation failed",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);
  return res.status(status).json({ message: err.message || "Internal server error" });
}

module.exports = { notFound, errorHandler };
