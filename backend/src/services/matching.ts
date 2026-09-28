import type { IVendorProfile } from "../models/VendorProfile";
import type { ITor } from "../models/Tor";

/**
 * Rule-based vendor↔TOR match score (FR-24/FR-25). Deterministic, no AI call —
 * three weighted signals compared against the vendor's own profile fields.
 */

export type MatchCriterion = "category" | "technologyStack" | "budgetRange";

export interface MatchResult {
  score: number;
  matchedCriteria: MatchCriterion[];
}

const WEIGHTS: Record<MatchCriterion, number> = {
  category: 40,
  technologyStack: 35,
  budgetRange: 25,
};

interface SignalScore {
  /** Points earned toward this signal's weight, 0..WEIGHTS[criterion]. */
  points: number;
  /** Whether this signal counts as "met" for matchedCriteria. */
  met: boolean;
  /** Whether both sides had enough data to evaluate this signal at all. */
  applicable: boolean;
}

function scoreCategory(profile: IVendorProfile, tor: ITor): SignalScore {
  if (!tor.category || profile.interestedCategories.length === 0) {
    return { points: 0, met: false, applicable: false };
  }
  const met = profile.interestedCategories.includes(tor.category);
  return { points: met ? WEIGHTS.category : 0, met, applicable: true };
}

function normalize(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean));
}

function scoreTechnologyStack(profile: IVendorProfile, tor: ITor): SignalScore {
  const required = normalize(tor.technologyStack);
  const offered = normalize(profile.technologyStack);
  if (required.size === 0 || offered.size === 0) {
    return { points: 0, met: false, applicable: false };
  }
  // What fraction of the TOR's required stack the vendor covers — rewards
  // vendors who cover what the TOR asks for, not just a large stack list.
  let overlap = 0;
  for (const tech of required) if (offered.has(tech)) overlap++;
  const coverage = overlap / required.size;
  return { points: WEIGHTS.technologyStack * coverage, met: overlap > 0, applicable: true };
}

function scoreBudgetRange(profile: IVendorProfile, tor: ITor): SignalScore {
  const min = profile.budgetRange?.min;
  const max = profile.budgetRange?.max;
  const value = tor.referencePrice ?? tor.budget;
  if ((min === undefined && max === undefined) || value === undefined) {
    return { points: 0, met: false, applicable: false };
  }
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  if (value >= lo && value <= hi) {
    return { points: WEIGHTS.budgetRange, met: true, applicable: true };
  }
  // Outside the range — decay toward 0 the further away it is, relative to
  // the nearest bound. `hi` can only be Infinity when the miss is on the
  // `lo` side (value < lo), so nearestBound is always finite here.
  const nearestBound = value < lo ? lo : hi;
  const distanceRatio = Math.min(1, Math.abs(value - nearestBound) / (nearestBound || 1));
  return { points: WEIGHTS.budgetRange * (1 - distanceRatio), met: false, applicable: true };
}

/**
 * Score a TOR against a vendor profile. Criteria the vendor hasn't filled in
 * yet (e.g. no budgetRange set) are excluded and the remaining applicable
 * weight is rescaled to 100, so an incomplete profile isn't unfairly capped —
 * it's just scored on fewer signals. An empty profile scores 0.
 */
export function computeMatch(profile: IVendorProfile, tor: ITor): MatchResult {
  const signals: Record<MatchCriterion, SignalScore> = {
    category: scoreCategory(profile, tor),
    technologyStack: scoreTechnologyStack(profile, tor),
    budgetRange: scoreBudgetRange(profile, tor),
  };

  const applicableWeight = (Object.keys(signals) as MatchCriterion[])
    .filter((k) => signals[k].applicable)
    .reduce((sum, k) => sum + WEIGHTS[k], 0);

  if (applicableWeight === 0) return { score: 0, matchedCriteria: [] };

  const earned = (Object.keys(signals) as MatchCriterion[])
    .filter((k) => signals[k].applicable)
    .reduce((sum, k) => sum + signals[k].points, 0);

  const matchedCriteria = (Object.keys(signals) as MatchCriterion[]).filter((k) => signals[k].met);

  return {
    score: Math.round((earned / applicableWeight) * 100),
    matchedCriteria,
  };
}
