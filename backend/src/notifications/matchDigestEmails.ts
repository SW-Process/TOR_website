import type { Types } from "mongoose";
import { Tor, User, VendorProfile } from "../models";
import { getEmailSender } from "../email";
import { buildMatchDigestEmail, type MatchDigestItem } from "../email/matchDigestEmail";
import { clientUrl } from "../utils/clientUrl";
import type { CreatedMatchNotification } from "./types";

/** A digest lists at most this many TORs; the rest are summarized as "and N more". */
export const MAX_DIGEST_ITEMS = 20;

const PROFILE_REASON = "ตรงกับโปรไฟล์ของคุณ";

interface ProfileLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  savedSearches: { _id: Types.ObjectId; name: string; alertsEnabled: boolean }[];
}

interface TorLean {
  _id: Types.ObjectId;
  title: string;
  agency?: string;
  budget?: number;
}

/**
 * Email each vendor one digest of the match notifications an enrichment run just
 * created for them (FR-29). Skips vendors with `emailAlertsEnabled: false`, and any
 * saved-search match whose saved search no longer has alerts on. A TOR matched more
 * than once (profile and a saved search) is listed once with every reason. Never
 * throws; one vendor's failed send does not stop the others. The in-app
 * notification is the record — a failed email is logged, not retried. Returns the
 * number of emails sent.
 */
export async function emailMatchDigests(created: CreatedMatchNotification[]): Promise<number> {
  if (created.length === 0) return 0;

  let byVendor: Map<string, { email: string; items: MatchDigestItem[] }>;
  try {
    byVendor = await buildDigests(created);
  } catch (err) {
    console.error("match digest emails failed:", err);
    return 0;
  }

  let sent = 0;
  for (const { email, items } of byVendor.values()) {
    const shown = items.slice(0, MAX_DIGEST_ITEMS);
    try {
      await getEmailSender().send({
        to: email,
        ...buildMatchDigestEmail({
          items: shown,
          moreCount: items.length - shown.length,
          dashboardLink: clientUrl("/dashboard"),
        }),
      });
      sent += 1;
    } catch (err) {
      console.error(`match digest email to ${email} failed:`, err);
    }
  }
  return sent;
}

async function buildDigests(
  created: CreatedMatchNotification[]
): Promise<Map<string, { email: string; items: MatchDigestItem[] }>> {
  const vendorIds = [...new Set(created.map((n) => String(n.vendorId)))];
  const torIds = [...new Set(created.map((n) => String(n.torId)))];

  // `$ne: false` also covers profiles saved before the flag existed (on by default).
  const profiles = await VendorProfile.find({ _id: { $in: vendorIds }, emailAlertsEnabled: { $ne: false } })
    .select("userId savedSearches")
    .lean<ProfileLean[]>();
  const [users, tors] = await Promise.all([
    User.find({ _id: { $in: profiles.map((p) => p.userId) } })
      .select("email")
      .lean<{ _id: Types.ObjectId; email: string }[]>(),
    Tor.find({ _id: { $in: torIds } })
      .select("title agency budget")
      .lean<TorLean[]>(),
  ]);
  const emailByUser = new Map(users.map((u) => [String(u._id), u.email]));
  const torById = new Map(tors.map((t) => [String(t._id), t]));

  const out = new Map<string, { email: string; items: MatchDigestItem[] }>();
  for (const profile of profiles) {
    const email = emailByUser.get(String(profile.userId));
    if (!email) continue;
    const searchById = new Map(profile.savedSearches.map((s) => [String(s._id), s]));

    // One entry per TOR, in the order the notifications were created, collecting every reason.
    const reasonsByTor = new Map<string, string[]>();
    for (const n of created) {
      if (String(n.vendorId) !== String(profile._id)) continue;
      let reason: string;
      if (n.type === "profile_match") {
        reason = PROFILE_REASON;
      } else {
        const search = n.savedSearchId ? searchById.get(String(n.savedSearchId)) : undefined;
        if (!search?.alertsEnabled) continue;
        reason = `การค้นหาที่บันทึกไว้ "${search.name}"`;
      }
      const reasons = reasonsByTor.get(String(n.torId)) ?? [];
      if (!reasons.includes(reason)) reasons.push(reason);
      reasonsByTor.set(String(n.torId), reasons);
    }

    const items: MatchDigestItem[] = [];
    for (const [torId, reasons] of reasonsByTor) {
      const tor = torById.get(torId);
      if (!tor) continue;
      items.push({
        title: tor.title,
        agency: tor.agency,
        budget: tor.budget,
        link: clientUrl(`/tor/${torId}`),
        reasons,
      });
    }
    if (items.length > 0) out.set(String(profile._id), { email, items });
  }
  return out;
}
