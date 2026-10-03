import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { Bookmark, Tor } from "../models";
import { httpError } from "../utils/httpError";
import { withDisplayStatus } from "../utils/torStatus";
import { loadOrCreateProfile } from "./vendorProfileController";

const APPLICATION_STATUSES = ["interested", "preparing", "submitted", "missed"] as const;

// Same public fields the TOR list exposes (torController LIST_PROJECTION).
const TOR_PROJECTION =
  "title agency category budget referencePrice announcementDate submissionDeadline status projectCode projectType technologyStack sourceListingUrl procurement.stage procurement.contractStatus procurement.bidDeadline procurement.lastCheckedAt";

const updateSchema = z
  .object({
    applicationStatus: z.enum(APPLICATION_STATUSES).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

async function vendorIdOf(req: Request) {
  const profile = await loadOrCreateProfile(req.user!.id);
  return profile!._id;
}

function torIdParam(req: Request): string {
  const torId = String(req.params.torId);
  if (!isValidObjectId(torId)) throw httpError(400, "Invalid TOR id");
  return torId;
}

function parseUpdate(body: unknown) {
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}

function serialize(b: {
  torId: unknown;
  applicationStatus: string;
  note?: string | null;
  bookmarkedAt: Date;
  updatedAt?: Date;
}) {
  return {
    torId: String(b.torId),
    applicationStatus: b.applicationStatus,
    note: b.note ?? null,
    bookmarkedAt: b.bookmarkedAt,
    updatedAt: b.updatedAt,
  };
}

/**
 * GET /api/vendor/bookmarks — the caller's bookmarks with their TORs, for the
 * saved list and the application-status Kanban board (FR-27, FR-32). Bookmarks
 * whose TOR is no longer public are left out.
 */
export async function listBookmarks(req: Request, res: Response): Promise<void> {
  const vendorId = await vendorIdOf(req);
  const bookmarks = await Bookmark.find({ vendorId }).sort({ bookmarkedAt: -1 }).lean();
  const tors = await Tor.find({
    _id: { $in: bookmarks.map((b) => b.torId) },
    pipelineStatus: "enriched",
  })
    .select(TOR_PROJECTION)
    .lean();
  const torById = new Map(tors.map((t) => [String(t._id), t]));

  const data = bookmarks.flatMap((b) => {
    const tor = torById.get(String(b.torId));
    return tor ? [{ ...serialize(b), tor: withDisplayStatus(tor) }] : [];
  });
  res.status(200).json({ data });
}

/**
 * PUT /api/vendor/bookmarks/:torId — bookmark a TOR (idempotent: re-bookmarking
 * keeps the existing status). Optional body sets the status/note (FR-27, FR-31).
 */
export async function putBookmark(req: Request, res: Response): Promise<void> {
  const torId = torIdParam(req);
  const update = parseUpdate(req.body);
  const exists = await Tor.exists({ _id: torId, pipelineStatus: "enriched" });
  if (!exists) throw httpError(404, "TOR not found");

  const vendorId = await vendorIdOf(req);
  const bookmark = await Bookmark.findOneAndUpdate(
    { vendorId, torId },
    { $setOnInsert: { vendorId, torId }, ...(Object.keys(update).length ? { $set: update } : {}) },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  res.status(200).json({ bookmark: serialize(bookmark!) });
}

/** PATCH /api/vendor/bookmarks/:torId — update application status / note (FR-31). */
export async function updateBookmark(req: Request, res: Response): Promise<void> {
  const torId = torIdParam(req);
  const update = parseUpdate(req.body);
  if (!Object.keys(update).length) throw httpError(400, "Nothing to update");

  const vendorId = await vendorIdOf(req);
  const bookmark = await Bookmark.findOneAndUpdate(
    { vendorId, torId },
    { $set: update },
    { returnDocument: "after", runValidators: true }
  ).lean();
  if (!bookmark) throw httpError(404, "Bookmark not found");
  res.status(200).json({ bookmark: serialize(bookmark) });
}

/** DELETE /api/vendor/bookmarks/:torId — remove a bookmark (idempotent). */
export async function deleteBookmark(req: Request, res: Response): Promise<void> {
  const torId = torIdParam(req);
  const vendorId = await vendorIdOf(req);
  await Bookmark.deleteOne({ vendorId, torId });
  res.status(204).end();
}
