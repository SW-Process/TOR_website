import type { Request, Response } from "express";
import { IngestionRun } from "../models";
import { httpError } from "../utils/httpError";
import { runIngestion } from "../ingestion/runIngestion";

const MAX_PROJECTS_CEILING = 500;

function parseMaxProjects(raw: unknown): number {
  const fallback = Number(process.env.INGEST_DEFAULT_MAX_PROJECTS) || 50;
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PROJECTS_CEILING) {
    throw httpError(400, `maxProjects must be an integer between 1 and ${MAX_PROJECTS_CEILING}`);
  }
  return n;
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
  const announceAllTypes = body.announceAllTypes === true;

  const { runId } = await runIngestion({
    trigger: "manual",
    triggeredBy: req.user!.id,
    maxProjects,
    searchText,
    announceAllTypes,
  });

  res.status(202).json({ runId, status: "running" });
}

/** GET /api/ingestion/runs — recent run history (FR-34). */
export async function listRuns(req: Request, res: Response): Promise<void> {
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
