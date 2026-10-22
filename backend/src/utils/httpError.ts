/** An Error carrying an HTTP status for the central error handler. */
export interface HttpError extends Error {
  status: number;
  /** Extra fields for a 4xx response body next to `message` (e.g. a machine-readable `code`). */
  body?: Record<string, unknown>;
}

/** Create an Error carrying an HTTP status (and optional extra 4xx body fields) for the central error handler. */
export function httpError(status: number, message: string, body?: Record<string, unknown>): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  if (body) err.body = body;
  return err;
}

export default httpError;
