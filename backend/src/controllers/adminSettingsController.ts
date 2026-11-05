import type { Request, Response } from "express";
import {
  DEFAULT_FAIRNESS_PREFILTER,
  fairnessPrefilterSchema,
} from "../ingestion/enrichment/fairnessPrefilter";
import { getFairnessPrefilter, saveFairnessPrefilter, type StoredFairnessPrefilter } from "../services/fairnessSettings";
import { httpError } from "../utils/httpError";
import { key } from "../utils/personView";

/**
 * Admin settings for the fairness pre-filter (FR-20): the thresholds that decide
 * which AI fairness signals are published. Changes apply from the next enrichment
 * drain; TORs already enriched keep their flags until they are re-enriched.
 */

function view(s: StoredFairnessPrefilter) {
  return {
    settings: s.thresholds,
    defaults: DEFAULT_FAIRNESS_PREFILTER,
    isDefault: s.isDefault,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy ? key(s.updatedBy) : null,
  };
}

/** GET /api/admin/settings/fairness-prefilter — the thresholds in use and the defaults. */
export async function getFairnessPrefilterSettings(_req: Request, res: Response): Promise<void> {
  res.status(200).json(view(await getFairnessPrefilter()));
}

/** PUT /api/admin/settings/fairness-prefilter — replace all thresholds; every field is required. */
export async function putFairnessPrefilterSettings(req: Request, res: Response): Promise<void> {
  const parsed = fairnessPrefilterSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw httpError(
      400,
      parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ")
    );
  }
  res.status(200).json(view(await saveFairnessPrefilter(parsed.data, req.user!.id)));
}
