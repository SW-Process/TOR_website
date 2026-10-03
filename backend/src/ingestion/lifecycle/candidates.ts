// backend/src/ingestion/lifecycle/candidates.ts
import type { QueryFilter } from "mongoose";
import { Tor, type ITor } from "../../models";

/** Contract status after which a project no longer changes, so it is no longer refreshed. */
const FINISHED_CONTRACT_STATUS = "ส่งงานครบถ้วน";

const DEFAULT_MAX_PER_RUN = 100;

/** Max TORs one lifecycle refresh may check (`MAX_LIFECYCLE_REFRESH_PER_RUN`, default 100). */
export function maxLifecycleRefreshPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MAX_LIFECYCLE_REFRESH_PER_RUN);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_PER_RUN;
}

/**
 * TORs worth re-checking: publicly visible (enriched), reachable (has a listing URL) and not
 * finished (not cancelled, contract not yet complete). `$ne` also matches a missing field, so
 * TORs that have never been checked are included.
 */
export function lifecycleFilter(): QueryFilter<ITor> {
  return {
    pipelineStatus: "enriched",
    sourceListingUrl: { $type: "string", $ne: "" },
    "procurement.stage": { $ne: "cancelled" },
    "procurement.contractStatus": { $ne: FINISHED_CONTRACT_STATUS },
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
