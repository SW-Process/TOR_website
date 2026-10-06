// backend/src/ingestion/lifecycle/candidates.ts
import type { QueryFilter } from "mongoose";
import { Tor, type ITor } from "../../models";
import { gprocEnabled } from "../../scraper/gprocClient";

/**
 * Contract statuses after which a project no longer changes, so it is no longer refreshed:
 * work delivered in full, on time, or late. ("ยกเลิกโครงการ" is covered by the cancelled stage.)
 */
const FINISHED_CONTRACT_STATUSES = ["ส่งงานครบถ้วน", "ส่งงานตามกำหนด", "ส่งงานล่าช้ากว่ากำหนด"];

const DEFAULT_MAX_PER_RUN = 100;

/** Max TORs one lifecycle refresh may check (`MAX_LIFECYCLE_REFRESH_PER_RUN`, default 100). */
export function maxLifecycleRefreshPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MAX_LIFECYCLE_REFRESH_PER_RUN);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_PER_RUN;
}

const DEFAULT_MAX_DEADLINE_EXTRACTIONS = 20;

/** Max invitation PDFs one lifecycle run may send to Gemini (`MAX_DEADLINE_EXTRACTIONS_PER_RUN`, default 20). */
export function maxDeadlineExtractionsPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MAX_DEADLINE_EXTRACTIONS_PER_RUN);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_DEADLINE_EXTRACTIONS;
}

/**
 * TORs worth re-checking: publicly visible (enriched), reachable (has a listing URL, or, with
 * process5 on, an 11-digit project code) and not
 * finished (not cancelled, work not yet delivered). `$ne` / `$nin` also match a missing field, so
 * TORs that have never been checked are included.
 *
 * One-time backfill: finished/cancelled TORs are still selected while their bid deadline has never
 * been attempted (`deadlineAttempt` missing) and they have an invitation with a file, so the
 * deadline is read for every TOR whatever its stage. Once an attempt is recorded they drop out of
 * that branch and are no longer re-checked.
 *
 * Month-only deadlines (`bidDeadline.precision: "month"`, read from the PDF) are ALWAYS candidates,
 * finished or cancelled included, so the file keeps being re-checked until a day is known or an
 * admin overrides the value.
 */
export function lifecycleFilter(opts: { gproc?: boolean } = {}): QueryFilter<ITor> {
  const useGproc = opts.gproc ?? gprocEnabled();
  // process5 needs only the 11-digit project number, so a TOR without a listing URL is reachable too.
  const reachable: QueryFilter<ITor> = useGproc
    ? {
        $or: [
          { sourceListingUrl: { $type: "string", $ne: "" } },
          { projectCode: { $regex: /^\d{11}$/ } },
        ],
      }
    : { sourceListingUrl: { $type: "string", $ne: "" } };
  return {
    pipelineStatus: "enriched",
    $and: [
      reachable,
      {
        $or: [
          {
            "procurement.stage": { $ne: "cancelled" },
            "procurement.contractStatus": { $nin: FINISHED_CONTRACT_STATUSES },
          },
          // A month-only AI deadline is re-checked until a day is known (or an admin sets one).
          { "procurement.bidDeadline.precision": "month", "procurement.bidDeadline.source": "invitation-pdf" },
          {
            "procurement.deadlineAttempt": null,
            "procurement.announcements": { $elemMatch: { kind: "invitation", hasFile: true } },
          },
        ],
      },
    ],
  };
}

export function countLifecycleCandidates(): Promise<number> {
  return Tor.countDocuments(lifecycleFilter());
}

/**
 * e-GP's project id is the last path segment of the listing URL that `mapProject` stored
 * (`<listingBase>/<projectId>`). Returns null when it cannot be recovered.
 */
export function projectIdFromListingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last !== "project-detail" ? last : null;
}
