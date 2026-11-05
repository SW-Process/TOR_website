import type { Types } from "mongoose";
import { Setting } from "../models";
import {
  DEFAULT_FAIRNESS_PREFILTER,
  fairnessPrefilterSchema,
  type FairnessPrefilterThresholds,
} from "../ingestion/enrichment/fairnessPrefilter";

const KEY = "fairness-prefilter" as const;

export interface StoredFairnessPrefilter {
  thresholds: FairnessPrefilterThresholds;
  /** True while nothing has been saved yet (or the saved row is unreadable) and the defaults apply. */
  isDefault: boolean;
  updatedAt: Date | null;
  updatedBy: Types.ObjectId | null;
}

/** The thresholds the pre-filter uses now: the saved row, or the defaults when there is none or it is invalid. */
export async function getFairnessPrefilter(): Promise<StoredFairnessPrefilter> {
  const row = await Setting.findOne({ key: KEY }).lean();
  const parsed = row ? fairnessPrefilterSchema.safeParse(row.value) : null;
  if (!row || !parsed?.success) {
    if (row) {
      console.warn(JSON.stringify({ component: "fairnessSettings", event: "invalid-stored-value", key: KEY }));
    }
    return { thresholds: { ...DEFAULT_FAIRNESS_PREFILTER }, isDefault: true, updatedAt: null, updatedBy: null };
  }
  return { thresholds: parsed.data, isDefault: false, updatedAt: row.updatedAt, updatedBy: row.updatedBy ?? null };
}

/** Replaces the saved thresholds. The caller validates `thresholds` with `fairnessPrefilterSchema` first. */
export async function saveFairnessPrefilter(
  thresholds: FairnessPrefilterThresholds,
  updatedBy: string | Types.ObjectId
): Promise<StoredFairnessPrefilter> {
  const row = await Setting.findOneAndUpdate(
    { key: KEY },
    { $set: { value: thresholds, updatedBy } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
  return { thresholds, isDefault: false, updatedAt: row!.updatedAt, updatedBy: row!.updatedBy ?? null };
}
