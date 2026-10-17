import type { Types } from "mongoose";
import { Notification, Tor, VendorProfile } from "../models";
import { tryBuildFilterFromRaw } from "../controllers/torController";

interface SavedSearchLean {
  _id: Types.ObjectId;
  name: string;
  filters: Record<string, unknown>;
  alertsEnabled: boolean;
}

interface VendorProfileLean {
  _id: Types.ObjectId;
  savedSearches: SavedSearchLean[];
}

/**
 * After an enrichment drain, create a `saved_search_match` Notification for every
 * vendor saved search (with alerts on) that a just-enriched TOR matches (FR-30,
 * FR-28). A search's stored `filters` is replayed through the exact same filter the
 * public TOR list builds from `?query=string`s, so "matches" means the same thing
 * here as it would if the vendor ran the search again right now. Never throws — a
 * notification failure must not affect the enrichment run it rides on. Idempotent:
 * rerunning for the same TOR never gives a vendor a second notification for the
 * same saved search.
 */
export async function notifySavedSearchMatches(torIds: string[] | undefined | null): Promise<number> {
  if (!torIds || torIds.length === 0) return 0;

  try {
    const profiles = await VendorProfile.find({ "savedSearches.alertsEnabled": true })
      .select("savedSearches")
      .lean<VendorProfileLean[]>();
    if (profiles.length === 0) return 0;

    const candidates: { vendorId: Types.ObjectId; torId: Types.ObjectId; savedSearchId: Types.ObjectId; message: string }[] = [];
    for (const profile of profiles) {
      for (const search of profile.savedSearches) {
        if (!search.alertsEnabled) continue;
        const filter = tryBuildFilterFromRaw(search.filters);
        if (!filter) continue; // a saved search whose filters no longer parse is skipped, not fatal

        // One saved search at a time keeps this simple; the volume here is small.
        const matches = await Tor.find({ _id: { $in: torIds }, ...filter })
          .select("title")
          .lean<{ _id: Types.ObjectId; title: string }[]>();
        for (const tor of matches) {
          candidates.push({
            vendorId: profile._id,
            torId: tor._id,
            savedSearchId: search._id,
            message: `TOR ใหม่ตรงกับการค้นหาที่บันทึกไว้ "${search.name}": ${tor.title}`,
          });
        }
      }
    }
    if (candidates.length === 0) return 0;

    // A vendor already notified about this TOR for this saved search (e.g. a rerun) gets no second row.
    const already = await Notification.find({
      type: "saved_search_match",
      torId: { $in: candidates.map((c) => c.torId) },
      vendorId: { $in: candidates.map((c) => c.vendorId) },
    })
      .select("vendorId torId savedSearchId")
      .lean();
    const seen = new Set(already.map((n) => `${n.vendorId}:${n.torId}:${n.savedSearchId}`));
    const toInsert = candidates.filter((c) => !seen.has(`${c.vendorId}:${c.torId}:${c.savedSearchId}`));
    if (toInsert.length === 0) return 0;

    const created = await Notification.insertMany(
      toInsert.map((c) => ({ ...c, type: "saved_search_match" as const })),
      { ordered: false }
    );
    return created.length;
  } catch (err) {
    console.error("saved-search-match notifications failed:", err);
    return 0;
  }
}
