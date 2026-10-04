import type { Request, Response } from "express";
import { z } from "zod";
import { Tor } from "../models";
import type { ITor } from "../models";
import { computeMatch } from "../services/matching";
import { loadOrCreateProfile } from "./vendorProfileController";
import { httpError } from "../utils/httpError";
import { statusClause, withDisplayStatus } from "../utils/torStatus";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const OPEN_TOR_PROJECTION =
  "title agency category budget referencePrice technologyStack announcementDate submissionDeadline status procurement.stage procurement.contractStatus procurement.bidDeadline procurement.lastCheckedAt viewCount";

/**
 * GET /api/vendor/matches — open TORs ranked by rule-based match score
 * against the caller's own vendor profile (FR-24/FR-25). Computed on demand:
 * three cheap arithmetic comparisons per TOR, no caching needed at this scale.
 */
export async function listMatches(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const q = parsed.data;
  const profile = await loadOrCreateProfile(req.user!.id);

  // pipelineStatus gate mirrors the public read API. Candidates are TORs a vendor can still act
  // on — a draft ahead of bidding, or bidding itself; awarded, cancelled and closed (including
  // manually closed) projects are no opportunity. A TOR with no procurement yet reads as draft.
  const now = new Date();
  const openTors = await Tor.find({
    pipelineStatus: "enriched",
    _id: { $nin: profile!.hiddenTors.map((h) => h.torId) },
    $or: (["draft", "open", "closing_soon"] as const).map((s) => statusClause(s, now)),
  })
    .select(OPEN_TOR_PROJECTION)
    .lean<ITor[]>();

  const ranked = openTors
    .map((tor) => ({ tor, ...computeMatch(profile, tor) }))
    .sort((a, b) => b.score - a.score);

  const start = (q.page - 1) * q.pageSize;
  const page = ranked.slice(start, start + q.pageSize);

  res.status(200).json({
    data: page.map(({ tor, score, matchedCriteria }) => ({
      tor: withDisplayStatus(tor),
      matchScore: score,
      matchedCriteria,
    })),
    page: q.page,
    pageSize: q.pageSize,
    totalCount: ranked.length,
    hasNextPage: q.page * q.pageSize < ranked.length,
  });
}
