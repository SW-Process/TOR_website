import { z } from "zod";
import type { FairnessSignal } from "./torExtractor";

/**
 * Fairness pre-filter (FR-20): thresholds an Administrator sets to decide which
 * AI fairness signals are worth publishing. They are used twice:
 *  1. in the Gemini prompt, so the model knows the cut-offs before it judges; and
 *  2. as a deterministic gate on the model's output, using the TOR's own numbers,
 *     so a signal below a threshold is never saved even if the model reports it.
 */

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const fairnessPrefilterSchema = z
  .object({
    /** A "budget" signal needs the budget to differ from the reference price by at least this many percent. */
    budgetDeviationPercent: z.number().min(1).max(500),
    /** A "deadline" signal needs fewer than this many days between announcement and bid deadline. */
    minBidWindowDays: z.number().int().min(1).max(90),
    /** Signals below this severity are dropped. */
    minSeverity: z.enum(SEVERITIES),
  })
  .strict();

export type FairnessPrefilterThresholds = z.infer<typeof fairnessPrefilterSchema>;

/** Used until an Administrator saves their own values. `minSeverity: "low"` keeps every severity. */
export const DEFAULT_FAIRNESS_PREFILTER: Readonly<FairnessPrefilterThresholds> = Object.freeze({
  budgetDeviationPercent: 30,
  minBidWindowDays: 7,
  minSeverity: "low",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** |budget − referencePrice| as a percentage of the reference price, or null when it can't be computed. */
export function budgetDeviationPercent(budget?: number | null, referencePrice?: number | null): number | null {
  if (budget == null || referencePrice == null || !(referencePrice > 0) || !(budget >= 0)) return null;
  return (Math.abs(budget - referencePrice) / referencePrice) * 100;
}

/** Days from the announcement to the bid deadline, or null when either date is missing or out of order. */
export function bidWindowDays(announcementDate?: Date | null, bidDeadline?: Date | null): number | null {
  if (!announcementDate || !bidDeadline) return null;
  const ms = bidDeadline.getTime() - announcementDate.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / DAY_MS;
}

export interface PrefilterFacts {
  budget?: number | null;
  referencePrice?: number | null;
  announcementDate?: Date | null;
  bidDeadline?: Date | null;
}

/**
 * Keeps the signals that pass the thresholds. When a fact needed for a check is
 * missing (no reference price, no deadline) the check is skipped and the model's
 * judgment stands, because the gate cannot prove the signal wrong.
 */
export function applyFairnessPrefilter(
  signals: FairnessSignal[],
  facts: PrefilterFacts,
  t: FairnessPrefilterThresholds
): FairnessSignal[] {
  const minRank = SEVERITIES.indexOf(t.minSeverity);
  const deviation = budgetDeviationPercent(facts.budget, facts.referencePrice);
  const windowDays = bidWindowDays(facts.announcementDate, facts.bidDeadline);
  return signals.filter((s) => {
    if (SEVERITIES.indexOf(s.severity) < minRank) return false;
    if (s.field === "budget" && deviation != null && deviation < t.budgetDeviationPercent) return false;
    if (s.field === "deadline" && windowDays != null && windowDays >= t.minBidWindowDays) return false;
    return true;
  });
}

/** Prompt lines that tell the model the Administrator's cut-offs. */
export function fairnessPrefilterPrompt(t: FairnessPrefilterThresholds): string[] {
  return [
    "Fairness thresholds set by the administrator:",
    `- Report a "budget" signal only when the budget differs from the reference price by at least ${t.budgetDeviationPercent}%.`,
    `- Report a "deadline" signal only when there are fewer than ${t.minBidWindowDays} days between the announcement date and the bid submission deadline.`,
    `- Report only signals of severity "${t.minSeverity}" or higher.`,
  ];
}
