/** An Error carrying an HTTP status for the central error handler. */
export interface HttpError extends Error {
  status: number;
}

/** Create an Error carrying an HTTP status for the central error handler. */
export function httpError(status: number, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  return err;
}

export default httpError;
