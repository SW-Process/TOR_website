const { verifyToken, COOKIE_NAME } = require("../utils/token");

/**
 * Require a valid auth cookie. Attaches `req.user = { id, role }` on success,
 * responds 401 otherwise.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

/**
 * Require the authenticated user to hold one of the given roles.
 * Use after requireAuth, e.g. `router.get("/x", requireAuth, requireRole("admin"), h)`.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
