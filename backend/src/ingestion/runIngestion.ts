import type { Types } from "mongoose";
import { Tor, IngestionRun } from "../models";
import { EgpClient, egpConfigFromEnv, listingUrl } from "../scraper/egpClient";
import { TOR_TYPE_ID, type EgpClientLike } from "../scraper/egpClient.types";
import { getStorage } from "../storage";
import type { BlobStorage } from "../storage/storage.types";
import { mapProject } from "./mapProject";
import { fetchAndStoreTorPdf } from "./fetchAndStoreTorPdf";
import { logIngestionEvent } from "./log";
import type { PdfParseFn } from "./pdfInspect";

export interface RunIngestionOptions {
  trigger: "manual" | "scheduled";
  triggeredBy: string | null;
  maxProjects: number;
  searchText: string;
  announceAllTypes?: boolean;
}

export interface RunIngestionDeps {
  client?: EgpClientLike;
  storage?: BlobStorage;
  parse?: PdfParseFn;
}

export interface RunIngestionResult {
  runId: string;
  done: Promise<void>;
}

const PAGE_SIZE = 50;

async function collectProjects(
  client: EgpClientLike,
  opts: RunIngestionOptions
): Promise<{ projectId: string; projectNumber: string }[]> {
  const out: { projectId: string; projectNumber: string }[] = [];
  for (let page = 1; out.length < opts.maxProjects; page += 1) {
    const batch = await client.searchProjects({
      page,
      pageSize: PAGE_SIZE,
      announceTypeId: opts.announceAllTypes ? null : TOR_TYPE_ID,
      searchText: opts.searchText,
    });
    out.push(...batch.data.map((p) => ({ projectId: p.projectId, projectNumber: p.projectNumber })));
    if (!batch.hasNextPage || batch.data.length === 0) break;
  }
  return out.slice(0, opts.maxProjects);
}

async function processProject(
  project: { projectId: string; projectNumber: string },
  runId: Types.ObjectId,
  client: EgpClientLike,
  storage: BlobStorage,
  parse: PdfParseFn | undefined,
  stats: { torsCreated: number; torsUpdated: number }
): Promise<void> {
  const detail = await client.projectDetail(project.projectId);
  const announcements = await client.announcements(project.projectId);
  const mapped = mapProject(project, detail, announcements, {
    fileBase: egpConfigFromEnv().fileBase,
    listingBase: listingUrl("", process.env).replace(/\/$/, ""),
  });

  let tor = await Tor.findOne({ projectCode: mapped.projectCode });
  let created = false;
  let updated = false;
  if (!tor) {
    tor = await Tor.create({
      ...mapped.set,
      projectCode: mapped.projectCode,
      sourceContentHash: mapped.sourceContentHash,
      ingestionRunId: runId,
    });
    created = true;
    stats.torsCreated += 1;
  } else if (tor.sourceContentHash !== mapped.sourceContentHash) {
    tor.set({ ...mapped.set, sourceContentHash: mapped.sourceContentHash, ingestionRunId: runId });
    await tor.save();
    updated = true;
    stats.torsUpdated += 1;
  }

  for (const message of mapped.ingestErrors) {
    await logIngestionEvent({ severity: "warning", message, component: "runIngestion", ingestionRunId: runId });
  }

  // RULING: only fetch the PDF when the TOR was just created, its detail changed,
  // or it has no successfully stored document yet. Re-downloading an unchanged
  // TOR's PDF on every run would violate NFR-07 politeness and the idempotency intent.
  const needsPdf = created || updated || !tor.sourceDocument?.storageKey;
  if (mapped.torAnnouncement && needsPdf) {
    await fetchAndStoreTorPdf(tor, mapped.torAnnouncement, runId, { client, storage, parse });
  }
}

async function crawl(
  runId: Types.ObjectId,
  opts: RunIngestionOptions,
  client: EgpClientLike,
  storage: BlobStorage,
  parse: PdfParseFn | undefined
): Promise<void> {
  const run = await IngestionRun.findById(runId);
  if (!run) return;
  const stats = { torsCreated: 0, torsUpdated: 0 };
  let torsFailed = 0;

  try {
    const projects = await collectProjects(client, opts);
    run.stats.torsFound = projects.length;
    await run.save();

    for (const project of projects) {
      try {
        await processProject(project, runId, client, storage, parse, stats);
      } catch (err) {
        torsFailed += 1;
        await logIngestionEvent({
          severity: "error",
          message: `project ${project.projectNumber} failed: ${(err as Error).message}`,
          component: "runIngestion",
          context: { projectId: project.projectId, stack: (err as Error).stack },
          ingestionRunId: runId,
        });
      }
    }

    run.stats.torsCreated = stats.torsCreated;
    run.stats.torsUpdated = stats.torsUpdated;
    run.stats.torsFailed = torsFailed;
    run.completedAt = new Date();
    run.status =
      torsFailed === 0 ? "success" : torsFailed === run.stats.torsFound ? "failed" : "partial";
    run.outcomeSummary = `found ${run.stats.torsFound}, created ${stats.torsCreated}, updated ${stats.torsUpdated}, failed ${torsFailed}`;
    await run.save();
    await logIngestionEvent({ severity: "info", message: run.outcomeSummary, component: "runIngestion", ingestionRunId: runId });
  } catch (fatal) {
    run.completedAt = new Date();
    run.status = "failed";
    run.outcomeSummary = `run aborted: ${(fatal as Error).message}`;
    await run.save();
    await logIngestionEvent({
      severity: "error",
      message: run.outcomeSummary,
      component: "runIngestion",
      context: { stack: (fatal as Error).stack },
      ingestionRunId: runId,
    });
  }
}

/**
 * Start an ingestion run. Creates the IngestionRun row synchronously and returns
 * its id; the crawl itself runs in the background. `done` resolves when the crawl
 * finishes — production ignores it, tests await it.
 */
export async function runIngestion(
  opts: RunIngestionOptions,
  deps: RunIngestionDeps = {}
): Promise<RunIngestionResult> {
  const client = deps.client ?? new EgpClient(egpConfigFromEnv());
  const storage = deps.storage ?? getStorage();

  const run = await IngestionRun.create({
    trigger: opts.trigger,
    triggeredBy: opts.triggeredBy,
    status: "running",
  });

  const done = crawl(run._id as Types.ObjectId, opts, client, storage, deps.parse);
  void done.catch(() => undefined); // never surfaces as an unhandled rejection

  return { runId: (run._id as Types.ObjectId).toString(), done };
}

export default runIngestion;
