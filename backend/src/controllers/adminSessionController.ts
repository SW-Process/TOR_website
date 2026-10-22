import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Session, User } from "../models";
import { httpError } from "../utils/httpError";
import { escapeRegExp } from "../utils/escapeRegExp";
import { securityLog } from "../utils/securityLog";
import { requireRecentAuth } from "../services/reauth";

/**
 * Admins ending other people's sessions (ASVS 7.4.5): one user's, after a reported
 * compromise, or everyone's, after a suspected breach. Both are logged.
 */

const lookupSchema = z.object({ email: z.string().trim().min(3).max(254) }).strict();

/** GET /api/admin/users?email= — find accounts by (part of) their e-mail, with how many devices are signed in. */
export async function findUsers(req: Request, res: Response): Promise<void> {
  const parsed = lookupSchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, "Search with at least 3 characters of an email");
  const users = await User.find({ email: { $regex: escapeRegExp(parsed.data.email.toLowerCase()) } })
    .select("email role createdAt")
    .sort({ email: 1 })
    .limit(20)
    .lean();
  const counts = await Session.aggregate<{ _id: unknown; n: number }>([
    { $match: { userId: { $in: users.map((u) => u._id) }, expiresAt: { $gt: new Date() } } },
    { $group: { _id: "$userId", n: { $sum: 1 } } },
  ]);
  const byUser = new Map(counts.map((c) => [String(c._id), c.n]));
  res.status(200).json({
    data: users.map((u) => ({ id: String(u._id), email: u.email, role: u.role, sessions: byUser.get(String(u._id)) ?? 0 })),
  });
}

/** POST /api/admin/users/:id/sessions/revoke — sign one user out of every device. */
export async function revokeUserSessions(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid user id");
  const user = await User.findById(id);
  if (!user) throw httpError(404, "User not found");
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // also kills any token whose row lingers
  await user.save();
  const { deletedCount } = await Session.deleteMany({ userId: user._id });
  securityLog(req, { event: "session.revoke_user", outcome: "success", severity: "NOTICE", targetUserId: user.id, ended: deletedCount });
  res.status(200).json({ ended: deletedCount });
}

/**
 * POST /api/admin/sessions/revoke-all — sign every user out of every device, except the
 * admin's own session. Needs a fresh re-authentication: it logs out the whole site.
 */
export async function revokeAllSessions(req: Request, res: Response): Promise<void> {
  const admin = await User.findById(req.user!.id).select("+passwordHash");
  if (!admin) throw httpError(401, "Account no longer exists");
  await requireRecentAuth(req, admin);
  const { deletedCount } = await Session.deleteMany({ _id: { $ne: req.user!.sessionId } });
  securityLog(req, { event: "session.revoke_all", outcome: "success", severity: "WARNING", ended: deletedCount });
  res.status(200).json({ ended: deletedCount });
}
