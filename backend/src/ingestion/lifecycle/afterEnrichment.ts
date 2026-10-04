// backend/src/ingestion/lifecycle/afterEnrichment.ts
import type { BidDeadlineExtractor } from "../enrichment/torExtractor";
import { refreshLifecycle } from "./refreshLifecycle";

/**
 * Right after an enrichment drain, refresh the lifecycle (stage + bid deadline) of exactly the TORs
 * it just enriched, so they need not wait for the daily lifecycle run. Never throws: an enrichment
 * run or job must not fail because of the chained refresh.
 */
export async function chainLifecycleAfterEnrichment(
  out: { enrichedTorIds?: string[] } | undefined | null,
  opts: {
    trigger: "manual" | "scheduled";
    triggeredBy?: string | null;
    deadlineExtractor?: BidDeadlineExtractor;
  }
): Promise<void> {
  const torIds = out?.enrichedTorIds;
  if (!torIds || torIds.length === 0) return;
  try {
    await refreshLifecycle({
      torIds,
      trigger: opts.trigger,
      triggeredBy: opts.triggeredBy,
      deadlineExtractor: opts.deadlineExtractor,
    });
  } catch (err) {
    console.error("lifecycle after enrichment failed:", err);
  }
}
