/** Create an Error carrying an HTTP status for the central error handler. */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = httpError;
