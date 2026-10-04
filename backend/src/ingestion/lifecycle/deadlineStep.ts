import type { QueryFilter, Types } from "mongoose";
import { ZodError } from "zod";
import { Tor, type ITor, type IProcurement, type IProcurementAnnouncement } from "../../models";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import { resolveBidDeadline } from "../../utils/bidDeadline";
import type { BidDeadlineExtractor, BidDeadlineResult } from "../enrichment/torExtractor";

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

/** "cleared": a stale AI deadline was removed because the latest invitation has no readable file yet. */
export type DeadlineStepOutcome = "skipped" | "read" | "unreadable" | "conflict" | "cleared";

const UNREADABLE: BidDeadlineResult = { date: null, time: null, confidence: 0 };

/**
 * Errors that will fail the same way tomorrow because of THIS PDF: unusable model output, or the
 * API rejecting the request itself (400 bad request, 413 too large, 422 unprocessable). Auth,
 * permission, not-found and timeout errors (401/403/404/408), 429, 5xx and network errors are
 * deployment or transient problems (service account, role, model name, project, quota): they must
 * stay retryable, or one misconfiguration would mark every inviting TOR "unreadable" for good.
 */
const PERMANENT_STATUSES = new Set([400, 413, 422]);
function isNonRetryable(err: unknown): boolean {
  if (err instanceof ZodError) return true;
  const e = err as { message?: unknown; status?: unknown; code?: unknown } | null;
  if (typeof e?.message === "string" && e.message.startsWith("Gemini returned invalid JSON")) return true;
  const n = Number(e?.status ?? e?.code);
  return PERMANENT_STATUSES.has(n);
}

const timeOf = (a: IProcurementAnnouncement): number => a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

/** Latest invitation (file or not, like stage derivation); on equal dates the later one in stored order wins. */
function latestInvitation(p: IProcurement): IProcurementAnnouncement | null {
  return p.announcements
    .filter((a) => a.kind === "invitation")
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
  const filename = invitation.hasFile ? args.filenames.get(invitation.announcementId) : undefined;
  if (!filename) {
    // The current invitation has no readable file (yet). A deadline read from an OLDER invitation
    // is stale, so clear it; no attempt is recorded, so the read happens once the file appears.
    if (p.bidDeadline?.source !== "invitation-pdf") return "skipped";
    const res = await Tor.updateOne(
      {
        _id: args.torId,
        "procurement.lastCheckedAt": p.lastCheckedAt,
        "procurement.bidDeadline.source": { $ne: "admin" },
      } as QueryFilter<ITor>,
      { $set: { "procurement.bidDeadline": null, "procurement.lastCheckedAt": deps.now() } },
      { timestamps: false }
    );
    return res.matchedCount === 0 ? "conflict" : "cleared";
  }

  const content = await deps.client.downloadFile(invitation.announcementId, filename);
  const key = `tor-pdfs/${args.projectCode ?? String(args.torId)}/${invitation.announcementId}.pdf`;
  await deps.storage.put(key, content, { contentType: "application/pdf" });

  let result: BidDeadlineResult;
  try {
    result = await deps.extractor.extractBidDeadline({
      pdf: { fileName: filename, content },
      meta: { projectCode: args.projectCode, title: args.title },
    });
  } catch (err) {
    // A PDF that always fails must not cost a Gemini call every day: record it as unreadable.
    if (!isNonRetryable(err)) throw err;
    result = UNREADABLE;
  }
  const deadline = resolveBidDeadline(result, { notBefore: invitation.publishedAt ?? null });

  const now = deps.now();
  // lastCheckedAt moves with this write so a stale concurrent writer (which preconditions on it)
  // is detected and cannot drop the storage key / deadline written here.
  const res = await Tor.updateOne(
    {
      _id: args.torId,
      "procurement.lastCheckedAt": p.lastCheckedAt,
      // an admin edit made while the PDF was being read must never be overwritten
      "procurement.bidDeadline.source": { $ne: "admin" },
    } as QueryFilter<ITor>,
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
