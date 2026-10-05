import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { AdminNotification } from "../models";
import { httpError } from "../utils/httpError";

/**
 * An admin's own in-app alerts about pipeline problems (FR-39). Each admin sees and
 * marks only their own rows.
 */

const LIST_LIMIT = 50;

/** GET /api/admin/notifications — newest first, with the unread count for the badge. */
export async function listAdminNotifications(req: Request, res: Response): Promise<void> {
  const adminId = req.user!.id;
  const [rows, unreadCount] = await Promise.all([
    AdminNotification.find({ adminId }).sort({ createdAt: -1, _id: -1 }).limit(LIST_LIMIT).lean(),
    AdminNotification.countDocuments({ adminId, read: false }),
  ]);
  res.status(200).json({
    data: rows.map((n) => ({
      id: String(n._id),
      type: n.type,
      message: n.message,
      ingestionRunId: n.ingestionRunId ? String(n.ingestionRunId) : null,
      read: n.read,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    unreadCount,
  });
}

/** PATCH /api/admin/notifications/:id/read — mark one of your own alerts as read. */
export async function markAdminNotificationRead(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid notification id");
  const updated = await AdminNotification.findOneAndUpdate(
    { _id: id, adminId: req.user!.id },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  ).lean();
  if (!updated) throw httpError(404, "Notification not found");
  res.status(200).json({ id: String(updated._id), read: updated.read, readAt: updated.readAt });
}
