import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Notification, Tor } from "../models";
import { httpError } from "../utils/httpError";
import { loadOrCreateProfile } from "./vendorProfileController";

/**
 * A vendor's own in-app notifications (FR-30): TOR matches today, saved-search
 * matches and deadline reminders later. Each vendor sees and marks only their own.
 */

const TOR_PROJECTION = "title agency projectCode category pipelineStatus";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

async function vendorIdOf(req: Request) {
  const profile = await loadOrCreateProfile(req.user!.id);
  return profile!._id;
}

/** GET /api/vendor/notifications — newest first, with the unread count for the badge. */
export async function listNotifications(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const q = parsed.data;
  const vendorId = await vendorIdOf(req);

  const [rows, totalCount, unreadCount] = await Promise.all([
    Notification.find({ vendorId })
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    Notification.countDocuments({ vendorId }),
    Notification.countDocuments({ vendorId, read: false }),
  ]);

  // Any pipeline status: a notification can outlive the TOR being hidden since.
  const tors = await Tor.find({ _id: { $in: rows.map((n) => n.torId) } }).select(TOR_PROJECTION).lean();
  const torById = new Map(tors.map((t) => [String(t._id), t]));

  res.status(200).json({
    data: rows.map((n) => {
      const tor = torById.get(String(n.torId));
      return {
        id: String(n._id),
        type: n.type,
        message: n.message ?? null,
        savedSearchId: n.savedSearchId ? String(n.savedSearchId) : null,
        read: n.read,
        createdAt: n.createdAt,
        tor: tor
          ? {
              id: String(tor._id),
              title: tor.title,
              agency: tor.agency ?? null,
              projectCode: tor.projectCode ?? null,
              category: tor.category ?? null,
              isPublic: tor.pipelineStatus === "enriched",
            }
          : null,
      };
    }),
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    unreadCount,
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}

/** PATCH /api/vendor/notifications/:id/read — mark one of your own notifications as read. */
export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid notification id");
  const vendorId = await vendorIdOf(req);

  const updated = await Notification.findOneAndUpdate(
    { _id: id, vendorId },
    { $set: { read: true } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw httpError(404, "Notification not found");
  res.status(200).json({ id: String(updated._id), read: updated.read });
}
