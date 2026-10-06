import type { Request, Response } from "express";
import { IngestionRun } from "../models";
import { httpError } from "../utils/httpError";
import { runIngestion } from "../ingestion/runIngestion";
import { drainEnrichmentQueue } from "../ingestion/enrichment/drainEnrichmentQueue";
import { countRunnable, maxCallsPerRun } from "../ingestion/enrichment/enrichmentJobRepo";
import { refreshLifecycle } from "../ingestion/lifecycle/refreshLifecycle";
import { countLifecycleCandidates, maxDeadlineExtractionsPerRun, maxLifecycleRefreshPerRun } from "../ingestion/lifecycle/candidates";
import { sweepStaleEnrichmentRuns, sweepStaleRuns } from "../ingestion/enrichment/sweepStaleRuns";
import { chainLifecycleAfterEnrichment } from "../ingestion/lifecycle/afterEnrichment";
import { selectExtractor } from "../jobs/enrichment";

const MAX_PROJECTS_CEILING = 500;
const LOOKBACK_DAYS_CEILING = 6000; // ~200 months
const ENRICHMENT_MAX_CALLS_CEILING = 200;
const LIFECYCLE_MAX_TORS_CEILING = 300;
const LIFECYCLE_MAX_DEADLINE_EXTRACTIONS_CEILING = 200;

function parseMaxProjects(raw: unknown): number {
  const fallback = Number(process.env.INGEST_DEFAULT_MAX_PROJECTS) || 50;
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PROJECTS_CEILING) {
    throw httpError(400, `maxProjects must be an integer between 1 and ${MAX_PROJECTS_CEILING}`);
  }
  return n;
}

function parseLookbackDays(raw: unknown): number {
  const fallback = Number(process.env.INGEST_LOOKBACK_DAYS) || 7;
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > LOOKBACK_DAYS_CEILING) {
    throw httpError(400, `lookbackDays must be an integer between 1 and ${LOOKBACK_DAYS_CEILING}`);
  }
  return n;
}

function parseEnrichmentMaxCalls(raw: unknown): number | undefined {
  if (raw === undefined) return undefined; // fall back to MAX_AI_CALLS_PER_RUN
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > ENRICHMENT_MAX_CALLS_CEILING) {
    throw httpError(400, `maxCalls must be an integer between 1 and ${ENRICHMENT_MAX_CALLS_CEILING}`);
  }
  return n;
}

function parseLifecycleMaxTors(raw: unknown): number | undefined {
  if (raw === undefined) return undefined; // fall back to MAX_LIFECYCLE_REFRESH_PER_RUN
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > LIFECYCLE_MAX_TORS_CEILING) {
    throw httpError(400, `maxTors must be an integer between 1 and ${LIFECYCLE_MAX_TORS_CEILING}`);
  }
  return n;
}

function parseLifecycleMaxDeadlineExtractions(raw: unknown): number | undefined {
  if (raw === undefined) return undefined; // fall back to MAX_DEADLINE_EXTRACTIONS_PER_RUN
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > LIFECYCLE_MAX_DEADLINE_EXTRACTIONS_CEILING) {
    throw httpError(
      400,
      `maxDeadlineExtractions must be an integer between 1 and ${LIFECYCLE_MAX_DEADLINE_EXTRACTIONS_CEILING}`
    );
  }
  return n;
}

function parseLifecycleOnlyOpen(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined; // check every stage
  if (typeof raw !== "boolean") throw httpError(400, "onlyOpen must be a boolean");
  return raw;
}

function parseSearchText(raw: unknown): string {
  if (raw === undefined) return process.env.INGEST_DEFAULT_SEARCH ?? "ซอฟต์แวร์";
  if (typeof raw !== "string" || raw.length > 200) {
    throw httpError(400, "searchText must be a string of at most 200 characters");
  }
  return raw;
}

/** POST /api/ingestion/runs — admin-triggered ingestion (FR-35). */
export async function createRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const maxProjects = parseMaxProjects(body.maxProjects);
  const searchText = parseSearchText(body.searchText);
  const lookbackDays = parseLookbackDays(body.lookbackDays);
  const announceAllTypes = body.announceAllTypes === true;

  const active = await IngestionRun.exists({ status: "running" });
  if (active) throw httpError(409, "An ingestion run is already in progress");

  const { runId } = await runIngestion({
    trigger: "manual",
    triggeredBy: req.user!.id,
    maxProjects,
    searchText,
    lookbackDays,
    announceAllTypes,
  });

  res.status(202).json({ runId, status: "running" });
}

/** POST /api/ingestion/enrichment/runs — admin-triggered enrichment drain. */
export async function createEnrichmentRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const maxCalls = parseEnrichmentMaxCalls(body.maxCalls);

  // A run whose worker died (e.g. backend restart) must not block new runs forever.
  await sweepStaleEnrichmentRuns();
  const active = await IngestionRun.exists({ status: "running", phase: "enrichment" });
  if (active) throw httpError(409, "An enrichment run is already in progress");

  const extractor = selectExtractor();
  const adminId = req.user!.id;
  void drainEnrichmentQueue({ extractor, maxCalls })
    .then((out) =>
      chainLifecycleAfterEnrichment(out, { trigger: "manual", triggeredBy: adminId, deadlineExtractor: extractor })
    )
    .catch((err) => {
      console.error("enrichment run failed:", err);
    });

  res.status(202).json({ status: "running" });
}

/** GET /api/ingestion/enrichment/pending — how many TORs the next enrichment run would process. */
export async function getEnrichmentPending(_req: Request, res: Response): Promise<void> {
  const runnable = await countRunnable();
  const maxCalls = maxCallsPerRun();
  res.status(200).json({ runnable, maxCalls, willProcess: Math.max(0, Math.min(runnable, maxCalls)) });
}

/** POST /api/ingestion/lifecycle/runs — admin-triggered procurement-stage refresh. */
export async function createLifecycleRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const maxTors = parseLifecycleMaxTors(body.maxTors);
  const maxDeadlineExtractions = parseLifecycleMaxDeadlineExtractions(body.maxDeadlineExtractions);
  const onlyOpen = parseLifecycleOnlyOpen(body.onlyOpen);

  // A run whose worker died (e.g. backend restart) must not block new runs forever.
  await sweepStaleRuns("lifecycle");
  const active = await IngestionRun.exists({ status: "running", phase: "lifecycle" });
  if (active) throw httpError(409, "A lifecycle refresh is already in progress");

  // A missing/invalid extractor must not block the status refresh itself — run without the deadline step.
  let deadlineExtractor: ReturnType<typeof selectExtractor> | undefined;
  try {
    deadlineExtractor = selectExtractor();
  } catch (err) {
    console.error("lifecycle run without deadline extraction:", err);
  }

  void refreshLifecycle({
    trigger: "manual",
    triggeredBy: req.user!.id,
    maxTors,
    maxDeadlineExtractions,
    deadlineExtractor,
    onlyOpen,
  }).catch((err) => {
    console.error("lifecycle run failed:", err);
  });

  res.status(202).json({ status: "running" });
}

/** GET /api/ingestion/lifecycle/pending — how many TORs the next refresh would check. */
export async function getLifecyclePending(req: Request, res: Response): Promise<void> {
  const onlyOpen = req.query.onlyOpen === "1" || req.query.onlyOpen === "true";
  const candidates = await countLifecycleCandidates({ onlyOpen });
  const maxTors = maxLifecycleRefreshPerRun();
  res.status(200).json({
    candidates,
    maxTors,
    willCheck: Math.min(candidates, maxTors),
    maxDeadlineExtractions: maxDeadlineExtractionsPerRun(),
  });
}

/** GET /api/ingestion/runs — recent run history (FR-34). */
export async function listRuns(req: Request, res: Response): Promise<void> {
  // so the admin UI sees a dead run as failed, not "running"
  await Promise.all([sweepStaleEnrichmentRuns(), sweepStaleRuns("lifecycle")]);
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 20;
  const runs = await IngestionRun.find({}).sort({ startedAt: -1 }).limit(limit).lean();
  res.status(200).json({ runs });
}

/** GET /api/ingestion/runs/:id — one run. */
export async function getRun(req: Request, res: Response): Promise<void> {
  const run = await IngestionRun.findById(req.params.id).lean();
  if (!run) throw httpError(404, "Ingestion run not found");
  res.status(200).json({ run });
}
