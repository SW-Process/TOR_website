import type { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { Tor, VendorProfile } from "../models";
import { httpError } from "../utils/httpError";
import { withDisplayStatus } from "../utils/torStatus";
import { loadOrCreateProfile } from "./vendorProfileController";

/** Upper bound on one vendor's hidden list, so the embedded array stays small. */
export const MAX_HIDDEN_TORS = 1000;

// The public TOR list fields (torController LIST_PROJECTION), plus the AI summary line the
// settings cards show.
const TOR_PROJECTION =
  "title agency category budget referencePrice announcementDate submissionDeadline status projectCode projectType technologyStack sourceListingUrl procurement.stage procurement.contractStatus procurement.bidDeadline procurement.lastCheckedAt aiSummary.summary";

function torIdParam(req: Request): string {
  const torId = String(req.params.torId);
  if (!isValidObjectId(torId)) throw httpError(400, "Invalid TOR id");
  return torId;
}

/** Ids of the TORs a vendor user has hidden; empty for anyone without a profile. */
export async function hiddenTorIdsOf(userId: string): Promise<Types.ObjectId[]> {
  const profile = await VendorProfile.findOne({ userId }).select("hiddenTors.torId").lean();
  return (profile?.hiddenTors ?? []).map((h) => h.torId);
}

/**
 * GET /api/vendor/hidden-tors — the caller's hidden TORs, newest first, for the
 * account settings list. Hidden TORs that are no longer public are left out.
 */
export async function listHiddenTors(req: Request, res: Response): Promise<void> {
  const profile = await loadOrCreateProfile(req.user!.id);
  const hidden = [...(profile?.hiddenTors ?? [])].sort((a, b) => b.hiddenAt.getTime() - a.hiddenAt.getTime());
  const tors = await Tor.find({ _id: { $in: hidden.map((h) => h.torId) }, pipelineStatus: "enriched" })
    .select(TOR_PROJECTION)
    .lean();
  const torById = new Map(tors.map((t) => [String(t._id), t]));

  const data = hidden.flatMap((h) => {
    const tor = torById.get(String(h.torId));
    return tor ? [{ torId: String(h.torId), hiddenAt: h.hiddenAt, tor: withDisplayStatus(tor) }] : [];
  });
  res.status(200).json({ data });
}

/** PUT /api/vendor/hidden-tors/:torId — hide a TOR from the caller's lists (idempotent). */
export async function hideTor(req: Request, res: Response): Promise<void> {
  const torId = torIdParam(req);
  if (!(await Tor.exists({ _id: torId, pipelineStatus: "enriched" }))) throw httpError(404, "TOR not found");

  const profile = await loadOrCreateProfile(req.user!.id);
  const already = profile!.hiddenTors.some((h) => String(h.torId) === torId);
  if (!already) {
    if (profile!.hiddenTors.length >= MAX_HIDDEN_TORS) {
      throw httpError(409, `You can hide at most ${MAX_HIDDEN_TORS} TORs`);
    }
    // The $ne guard keeps a concurrent double-click from adding the TOR twice.
    await VendorProfile.updateOne(
      { _id: profile!._id, "hiddenTors.torId": { $ne: torId } },
      { $push: { hiddenTors: { torId, hiddenAt: new Date() } } }
    );
  }
  res.status(204).end();
}

/** DELETE /api/vendor/hidden-tors/:torId — show a hidden TOR again (idempotent). */
export async function unhideTor(req: Request, res: Response): Promise<void> {
  const torId = torIdParam(req);
  await VendorProfile.updateOne({ userId: req.user!.id }, { $pull: { hiddenTors: { torId } } });
  res.status(204).end();
}
