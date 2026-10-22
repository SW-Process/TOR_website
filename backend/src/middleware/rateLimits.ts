import type { Request } from "express";
import { clientIp, rateLimit } from "./rateLimit";

const MINUTE = 60 * 1000;

/** IP + submitted email, so one attacker can't lock a victim out from everywhere. */
function ipAndEmail(req: Request): string {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${clientIp(req)}|${email}`;
}

/**
 * The limits used on our routes (documented for ASVS 6.1.1):
 * | Route                         | Limit                                           |
 * | ----------------------------- | ----------------------------------------------- |
 * | POST /api/auth/login          | 10 per IP+email and 50 per IP, per 15 minutes   |
 * | POST /api/auth/register       | 10 per IP per hour                              |
 * | POST /api/auth/forgot-password| 5 per IP+email per hour, 20 per IP per hour     |
 * | POST /api/auth/reset-password | 10 per IP per 15 minutes                        |
 * | password / email / delete     | 10 per IP per 15 minutes (re-enter password)    |
 * | POST /api/tors/:id/report     | 10 per IP per hour                              |
 * | POST /api/tors/:id/view       | 60 per IP per minute                            |
 * Limits are per IP (+email), never per account alone, so nobody can lock out
 * someone else's account by failing logins on purpose.
 */
export const loginPerAccount = rateLimit({ name: "loginPerAccount", windowMs: 15 * MINUTE, max: 10, key: ipAndEmail });
export const loginPerIp = rateLimit({ name: "loginPerIp", windowMs: 15 * MINUTE, max: 50 });
export const registerLimit = rateLimit({ name: "registerLimit", windowMs: 60 * MINUTE, max: 10 });
export const forgotPasswordPerAccount = rateLimit({ name: "forgotPasswordPerAccount", windowMs: 60 * MINUTE, max: 5, key: ipAndEmail });
export const forgotPasswordPerIp = rateLimit({ name: "forgotPasswordPerIp", windowMs: 60 * MINUTE, max: 20 });
export const resetPasswordLimit = rateLimit({ name: "resetPasswordLimit", windowMs: 15 * MINUTE, max: 10 });
export const reauthLimit = rateLimit({ name: "reauthLimit", windowMs: 15 * MINUTE, max: 10 });
export const reportLimit = rateLimit({ name: "reportLimit", windowMs: 60 * MINUTE, max: 10 });
export const viewLimit = rateLimit({ name: "viewLimit", windowMs: MINUTE, max: 60 });
