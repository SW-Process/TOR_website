import type { QueryFilter, Types } from "mongoose";
import { Tor, type ITor, type IProcurement, type IProcurementAnnouncement } from "../../models";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import { resolveBidDeadline } from "../../utils/bidDeadline";
import type { BidDeadlineExtractor } from "../enrichment/torExtractor";

export interface DeadlineStepArgs {
  torId: Types.ObjectId;
  projectCode?: string;
  title: string;
  /** What the refresh has just written (its `lastCheckedAt` is the write precondition). */
  procurement: IProcurement;
  /** announcementId → e-GP file name, from the announcements the refresh just fetched. */
  filenames: ReadonlyMap<string, string>;
}

export interface DeadlineStepDeps {
  client: EgpClientLike;
  storage: BlobStorage;
  extractor: BidDeadlineExtractor;
  now: () => Date;
}

export type DeadlineStepOutcome = "skipped" | "read" | "unreadable" | "conflict";

const timeOf = (a: IProcurementAnnouncement): number => a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

/** Latest invitation that has a file; on equal dates the later one in stored order wins. */
function latestInvitation(p: IProcurement): IProcurementAnnouncement | null {
  return p.announcements
    .filter((a) => a.kind === "invitation" && a.hasFile)
    .reduce<IProcurementAnnouncement | null>((best, a) => (best === null || timeOf(a) >= timeOf(best) ? a : best), null);
}

/**
 * Read the real bid deadline from the latest invitation PDF of an `inviting` TOR. Attempted once
 * per invitation id; never overrides an admin value. Gemini/e-GP/storage errors propagate (nothing
 * is recorded, so the next run retries); the caller isolates them per TOR.
 */
export async function runDeadlineStep(args: DeadlineStepArgs, deps: DeadlineStepDeps): Promise<DeadlineStepOutcome> {
  const p = args.procurement;
  if (p.stage !== "inviting") return "skipped";
  if (p.bidDeadline?.source === "admin") return "skipped";
  const invitation = latestInvitation(p);
  if (!invitation) return "skipped";
  if (p.deadlineAttempt?.announcementId === invitation.announcementId) return "skipped";
  const filename = args.filenames.get(invitation.announcementId);
  if (!filename) return "skipped";

  const content = await deps.client.downloadFile(invitation.announcementId, filename);
  const key = `tor-pdfs/${args.projectCode ?? String(args.torId)}/${invitation.announcementId}.pdf`;
  await deps.storage.put(key, content, { contentType: "application/pdf" });

  const result = await deps.extractor.extractBidDeadline({
    pdf: { fileName: filename, content },
    meta: { projectCode: args.projectCode, title: args.title },
  });
  const deadline = resolveBidDeadline(result, { notBefore: invitation.publishedAt ?? null });

  const now = deps.now();
  // lastCheckedAt moves with this write so a stale concurrent writer (which preconditions on it)
  // is detected and cannot drop the storage key / deadline written here.
  const res = await Tor.updateOne(
    { _id: args.torId, "procurement.lastCheckedAt": p.lastCheckedAt } as QueryFilter<ITor>,
    {
      $set: {
        "procurement.announcements.$[a].storageKey": key,
        "procurement.bidDeadline": deadline ? { date: deadline, source: "invitation-pdf", extractedAt: now } : null,
        "procurement.deadlineAttempt": {
          announcementId: invitation.announcementId,
          at: now,
          outcome: deadline ? "read" : "unreadable",
        },
        "procurement.lastCheckedAt": now,
      },
    },
    { arrayFilters: [{ "a.announcementId": invitation.announcementId }], timestamps: false }
  );
  if (res.matchedCount === 0) return "conflict";
  return deadline ? "read" : "unreadable";
}
