import type { Types } from "mongoose";
import { Notification, Tor, VendorProfile } from "../models";
import type { ITor } from "../models/Tor";
import type { IVendorProfile } from "../models/VendorProfile";
import { computeMatch } from "../services/matching";

type WithId<T> = T & { _id: Types.ObjectId };

/**
 * A match at or above this score is worth alerting a vendor about — the same cut
 * the match-score badge (frontend/src/components/MatchScoreBadge.tsx) already uses
 * to color a score "good" (green) rather than "fair" (amber).
 */
export const PROFILE_MATCH_THRESHOLD = 70;

const TOR_PROJECTION = "title category budget referencePrice technologyStack";

/**
 * After an enrichment drain, create a `profile_match` Notification for every vendor
 * whose profile scores at or above the threshold against each just-enriched TOR
 * (FR-30). Never throws — a notification failure must not affect the enrichment run
 * it rides on. Idempotent: rerunning for the same TOR never gives a vendor a second
 * profile_match notification for it.
 */
export async function notifyProfileMatches(torIds: string[] | undefined | null): Promise<number> {
  if (!torIds || torIds.length === 0) return 0;

  try {
    const [tors, profiles] = await Promise.all([
      Tor.find({ _id: { $in: torIds } })
        .select(TOR_PROJECTION)
        .lean<WithId<ITor>[]>(),
      VendorProfile.find({}).lean<WithId<IVendorProfile>[]>(),
    ]);
    if (tors.length === 0 || profiles.length === 0) return 0;

    const candidates: { vendorId: Types.ObjectId; torId: Types.ObjectId; message: string }[] = [];
    for (const tor of tors) {
      for (const profile of profiles) {
        if (computeMatch(profile, tor).score >= PROFILE_MATCH_THRESHOLD) {
          candidates.push({ vendorId: profile._id, torId: tor._id, message: `TOR ใหม่ตรงกับโปรไฟล์ของคุณ: ${tor.title}` });
        }
      }
    }
    if (candidates.length === 0) return 0;

    // A vendor already notified about this TOR (e.g. a rerun) gets no second row.
    const already = await Notification.find({
      type: "profile_match",
      torId: { $in: tors.map((t) => t._id) },
      vendorId: { $in: profiles.map((p) => p._id) },
    })
      .select("vendorId torId")
      .lean();
    const seen = new Set(already.map((n) => `${n.vendorId}:${n.torId}`));
    const toInsert = candidates.filter((c) => !seen.has(`${c.vendorId}:${c.torId}`));
    if (toInsert.length === 0) return 0;

    const created = await Notification.insertMany(
      toInsert.map((c) => ({ ...c, type: "profile_match" as const })),
      { ordered: false }
    );
    return created.length;
  } catch (err) {
    console.error("profile-match notifications failed:", err);
    return 0;
  }
}
