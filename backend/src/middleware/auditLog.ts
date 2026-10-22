import type { NextFunction, Request, Response } from "express";
import { securityLog } from "../utils/securityLog";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Audit trail for admin changes (ASVS 16.3.3): every state-changing request on the admin
 * and ingestion routers is logged once its response is sent, with the admin, the route,
 * the outcome and the names of the fields it sent. Field values are left out: they can
 * be long (help articles) or personal (report notes), and the change itself is in the
 * database.
 */
export function auditAdminAction(req: Request, res: Response, next: NextFunction): void {
  if (READ_METHODS.has(req.method)) return next();
  res.on("finish", () => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    securityLog(req, {
      event: "admin.action",
      outcome: res.statusCode < 400 ? "success" : "failure",
      severity: res.statusCode < 400 ? "NOTICE" : "WARNING",
      status: res.statusCode,
      // e.g. /api/admin/tors/:id — the id stays in `path`, the route pattern here.
      route: `${req.baseUrl}${req.route?.path ?? ""}`,
      fields: Object.keys(body).slice(0, 30),
    });
  });
  next();
}
