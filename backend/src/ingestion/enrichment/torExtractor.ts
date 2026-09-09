import { z } from "zod";
import type { HydratedDocument } from "mongoose";
import type { ITor } from "../../models";
import { TAXONOMY_VERSION, isTaxonomyCategory, fallbackCategory } from "../../config/taxonomy";

const strArray = z.preprocess((v) => (v == null ? [] : v), z.array(z.string()));

export const fairnessSignalSchema = z.object({
  field: z.enum(["budget", "deadline", "qualificationRequirements", "other"]),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(1),
});

export type FairnessSignal = z.infer<typeof fairnessSignalSchema>;

export const torExtractionResultSchema = z.object({
  isSoftwareRelated: z.boolean(),
  classificationReason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  category: z.string(),
  categoryTags: strArray,
  summary: z.string().nullable(),
  keyPoints: strArray,
  qualifications: strArray,
  evaluationCriteria: z.preprocess(
    (v) => (v == null ? [] : v),
    z.array(z.object({ label: z.string(), weight: z.number().nullable().default(null) }))
  ),
  technologyStack: strArray,
  submissionDeadline: z.string().nullable(),
  fairnessSignals: z.preprocess((v) => (v == null ? [] : v), z.array(fairnessSignalSchema)),
});

export type TorExtractionResult = z.infer<typeof torExtractionResultSchema>;

export interface ExtractInput {
  pdfs: { fileName: string; content: Buffer }[];
  meta: {
    projectCode?: string;
    title: string;
    agency?: string;
    budget?: number;
    referencePrice?: number;
    goodsCategory?: string;
    announcementDate?: string;
  };
}

export interface TorExtractor {
  readonly id: string;
  extract(input: ExtractInput): Promise<TorExtractionResult>;
}

export function bucketConfidence(n: number): "high" | "medium" | "low" {
  if (n >= 0.8) return "high";
  if (n >= 0.5) return "medium";
  return "low";
}

// TOR source PDFs are dated in the Thai solar calendar (พ.ศ. = ค.ศ. + 543).
// Gemini sometimes returns the year exactly as printed instead of converting
// it (e.g. "2567-04-25" meaning 25 เมษายน 2567, which is 2024-04-25 CE). No
// TOR on this site is dated anywhere near the 2400s CE, so any year that high
// is unambiguously a Buddhist Era year that slipped through un-converted.
const BUDDHIST_ERA_OFFSET = 543;
const BUDDHIST_ERA_YEAR_THRESHOLD = 2400;

function toGregorianYear(d: Date): Date {
  if (d.getUTCFullYear() < BUDDHIST_ERA_YEAR_THRESHOLD) return d;
  const fixed = new Date(d);
  fixed.setUTCFullYear(d.getUTCFullYear() - BUDDHIST_ERA_OFFSET);
  return fixed;
}

function parseDeadline(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : toGregorianYear(d);
}

/** Mutates `tor` in place; caller saves. */
export function applyExtractionToTor(
  tor: HydratedDocument<ITor>,
  result: TorExtractionResult,
  opts: { extractorId: string; fallbackText: string }
): void {
  const now = new Date();
  tor.classification = {
    isSoftwareRelated: result.isSoftwareRelated,
    reason: result.classificationReason,
    confidence: result.confidence,
    model: opts.extractorId,
    at: now,
  };

  if (!result.isSoftwareRelated) {
    tor.pipelineStatus = "rejected";
    return;
  }

  tor.pipelineStatus = "enriched";
  tor.technologyStack = result.technologyStack;

  tor.aiSummary = {
    summary: result.summary,
    keyPoints: result.keyPoints,
    qualifications: result.qualifications,
    evaluationCriteria: result.evaluationCriteria.map((c) => ({
      label: c.label,
      // The Tor schema constrains weight to 0..100; clamp so an out-of-range
      // model value does not make tor.save() throw a ValidationError.
      ...(c.weight != null ? { weight: Math.max(0, Math.min(100, c.weight)) } : {}),
    })),
    confidence: bucketConfidence(result.confidence),
    model: opts.extractorId,
    generatedAt: now,
  };

  const category = isTaxonomyCategory(result.category)
    ? result.category
    : fallbackCategory(`${opts.fallbackText} ${result.categoryTags.join(" ")}`);
  tor.category = category;
  tor.categoryTags = result.categoryTags;
  tor.taxonomyVersion = TAXONOMY_VERSION;

  const deadline = parseDeadline(result.submissionDeadline);
  if (deadline) tor.submissionDeadline = deadline;

  tor.fairnessFlags = result.fairnessSignals.map((s) => ({
    field: s.field,
    severity: s.severity,
    message: s.message,
    detectedAt: now,
    status: "open",
  })) as unknown as typeof tor.fairnessFlags;
}
