import { z } from "zod";
import type { HydratedDocument } from "mongoose";
import type { ITor } from "../../models";
import { TAXONOMY_VERSION, isTaxonomyCategory, fallbackCategory } from "../../config/taxonomy";
import { PROJECT_TYPES, type ProjectType } from "../../config/projectTypes";
import { applyFairnessPrefilter, signalDataPoints, type FairnessPrefilterThresholds, type PrefilterFacts } from "./fairnessPrefilter";

const strArray = z.preprocess((v) => (v == null ? [] : v), z.array(z.string()));

/** A 0..1 confidence the model may leave out (older responses); a missing one is stored as unknown. */
const optionalConfidence = z.number().min(0).max(1).nullable().optional();

export const fairnessSignalSchema = z.object({
  field: z.enum(["budget", "deadline", "qualificationRequirements", "other"]),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(1),
  /** How strongly the source supports this signal (FR-20). */
  confidence: optionalConfidence,
  // FR-19. Lenient on purpose: a blank detail is dropped when stored, it should not cost a retry.
  reasoning: z.string().nullable().optional(),
  dataPoints: z.array(z.object({ label: z.string(), value: z.string() })).nullable().optional(),
});

export type FairnessSignal = z.infer<typeof fairnessSignalSchema>;

export const torExtractionResultSchema = z.object({
  isSoftwareRelated: z.boolean(),
  classificationReason: z.string().min(1),
  /** Confidence in the software/not-software classification, not in the summary. */
  confidence: z.number().min(0).max(1),
  /** Confidence that summary, keyPoints and qualifications reflect the document (FR-20). */
  summaryConfidence: optionalConfidence,
  category: z.string(),
  categoryTags: strArray,
  // Optional: older responses and unclear TORs omit it; unknown values are dropped in applyExtractionToTor.
  projectType: z.string().nullable().optional(),
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
  /** The Administrator's fairness pre-filter thresholds, told to the model (FR-20). */
  fairnessThresholds?: FairnessPrefilterThresholds;
}

export const bidDeadlineResultSchema = z.object({
  date: z.string().nullable(),
  time: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type BidDeadlineResult = z.infer<typeof bidDeadlineResultSchema>;

export interface BidDeadlineExtractor {
  extractBidDeadline(input: {
    pdf: { fileName: string; content: Buffer };
    /** `announcementDate`: ISO YYYY-MM-DD (Gregorian, Asia/Bangkok day) the invitation was published. */
    meta: { projectCode?: string; title: string; announcementDate?: string };
  }): Promise<BidDeadlineResult>;
}

export interface TorExtractor extends BidDeadlineExtractor {
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
  opts: { extractorId: string; fallbackText: string; fairnessThresholds?: FairnessPrefilterThresholds }
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
    // The summary's own confidence (FR-20), not the classification's: a scan the model can
    // classify confidently may still be summarized from only part of the text. Unknown stays unset.
    ...(result.summaryConfidence != null ? { confidence: bucketConfidence(result.summaryConfidence) } : {}),
    model: opts.extractorId,
    generatedAt: now,
  };

  const category = isTaxonomyCategory(result.category)
    ? result.category
    : fallbackCategory(`${opts.fallbackText} ${result.categoryTags.join(" ")}`);
  tor.category = category;
  tor.categoryTags = result.categoryTags;
  const projectType = (PROJECT_TYPES as readonly string[]).includes(result.projectType ?? "")
    ? (result.projectType as ProjectType)
    : undefined;
  tor.projectType = projectType;
  tor.taxonomyVersion = TAXONOMY_VERSION;

  const deadline = parseDeadline(result.submissionDeadline);
  if (deadline) tor.submissionDeadline = deadline;

  // An invitation announcement has no scope of work, so the model has nothing to judge fairness on:
  // never publish signals from it. They appear when a later capture upgrades the document to the TOR.
  const raw = tor.sourceDocument?.kind === "invitation" ? [] : result.fairnessSignals;
  // The pre-filter checks each signal against the TOR's own numbers (FR-20). The invitation's
  // bid deadline is preferred over the one the model read from the TOR.
  const invitationDeadline = tor.procurement?.bidDeadline;
  const facts: PrefilterFacts = {
    budget: tor.budget,
    referencePrice: tor.referencePrice,
    announcementDate: tor.announcementDate,
    bidDeadline: invitationDeadline?.date ?? tor.submissionDeadline,
    bidDeadlinePrecision: invitationDeadline?.precision,
  };
  const signals = opts.fairnessThresholds ? applyFairnessPrefilter(raw, facts, opts.fairnessThresholds) : raw;
  tor.fairnessFlags = signals.map((s) => ({
    field: s.field,
    severity: s.severity,
    message: s.message,
    ...(s.confidence != null ? { confidence: bucketConfidence(s.confidence) } : {}),
    ...(s.reasoning?.trim() ? { reasoning: s.reasoning.trim() } : {}),
    dataPoints: [
      ...signalDataPoints(s.field, facts, opts.fairnessThresholds).map((p) => ({ ...p, source: "system" })),
      ...(s.dataPoints ?? [])
        .map((p) => ({ label: p.label.trim(), value: p.value.trim(), source: "ai" }))
        .filter((p) => p.label && p.value),
    ],
    detectedAt: now,
    status: "open",
  })) as unknown as typeof tor.fairnessFlags;
}
