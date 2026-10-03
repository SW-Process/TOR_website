import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import type { QueryFilter } from "mongoose";
import { z } from "zod";
import { Tor } from "../models";
import type { ITor } from "../models";
import { TAXONOMY } from "../config/taxonomy";
import { httpError } from "../utils/httpError";
import { withDisplayStatus, type StatusInput } from "../utils/torStatus";
import { DEFAULT_ORDER, LIST_PROJECTION, buildFilter, parseQuery, sortStages } from "./torController";

/**
 * Admin data-quality review of public TORs (UC-5): the same filters as the
 * public list, plus the fairness flags and a "has open flags" filter, and
 * manual corrections. Flags stay neutral review signals, never accusations.
 */

const ADMIN_PROJECT_STAGE = Object.fromEntries(
  [...LIST_PROJECTION.split(" "), "fairnessFlags", "pipelineStatus"].map((f) => [f, 1])
);

const HAS_OPEN_FLAG: QueryFilter<ITor> = { fairnessFlags: { $elemMatch: { status: "open" } } };

/** GET /api/admin/tors — public TORs with their flags; `flagged=true` keeps only open-flag rows. */
export async function listAdminTors(req: Request, res: Response): Promise<void> {
  const q = parseQuery(req);
  const flaggedOnly = req.query.flagged === "true";
  const base = buildFilter(q);
  const filter = flaggedOnly ? { $and: [base, HAS_OPEN_FLAG] } : base;
  const order = q.order ?? DEFAULT_ORDER[q.sort];

  const [result] = await Tor.aggregate<{
    data: unknown[];
    meta: { totalCount: number }[];
    flagged: { count: number }[];
  }>([
    { $match: { pipelineStatus: "enriched" } },
    {
      $facet: {
        data: [
          { $match: filter },
          ...sortStages(q.sort, order),
          { $skip: (q.page - 1) * q.pageSize },
          { $limit: q.pageSize },
          { $project: ADMIN_PROJECT_STAGE },
        ],
        meta: [{ $match: filter }, { $count: "totalCount" }],
        // Badge count for the "needs review" tab, independent of the other filters.
        flagged: [{ $match: HAS_OPEN_FLAG }, { $count: "count" }],
      },
    },
  ]);
  const totalCount = result?.meta[0]?.totalCount ?? 0;
  res.status(200).json({
    data: (result?.data ?? []).map((row) => withDisplayStatus(row as StatusInput)),
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    flaggedCount: result?.flagged[0]?.count ?? 0,
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    agency: z.string().trim().min(1).max(200).optional(),
    category: z.enum(TAXONOMY).optional(),
    budget: z.number().min(0).nullable().optional(),
    submissionDeadline: z.coerce.date().nullable().optional(),
    status: z.enum(["open", "closing_soon", "closed"]).optional(),
    /** Mark every open fairness flag as acknowledged (reviewed). */
    resolveFlags: z.boolean().optional(),
  })
  .strict();

function torIdParam(req: Request): string {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid TOR id");
  return id;
}

/** PATCH /api/admin/tors/:id — correct extracted fields and/or mark flags reviewed. */
export async function updateAdminTor(req: Request, res: Response): Promise<void> {
  const id = torIdParam(req);
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const { resolveFlags, budget, submissionDeadline, ...fields } = parsed.data;

  const tor = await Tor.findOne({ _id: id, pipelineStatus: "enriched" });
  if (!tor) throw httpError(404, "TOR not found");

  tor.set(fields);
  // null clears the field (e.g. a deadline the model got wrong and the TOR doesn't state).
  if (budget !== undefined) tor.set("budget", budget ?? undefined);
  if (submissionDeadline !== undefined) tor.set("submissionDeadline", submissionDeadline ?? undefined);
  if (resolveFlags) {
    for (const flag of tor.fairnessFlags) {
      if (flag.status === "open") flag.status = "acknowledged";
    }
  }
  await tor.save();

  const saved = await Tor.findById(id).select(ADMIN_PROJECT_STAGE).lean();
  res.status(200).json({ tor: saved ? withDisplayStatus(saved) : saved });
}

/**
 * DELETE /api/admin/tors/:id — hide a TOR from the public site. Not a hard
 * delete: the next ingestion run would just re-create it from e-GP, so it is
 * marked `rejected` instead (the public API only serves `enriched`).
 */
export async function hideAdminTor(req: Request, res: Response): Promise<void> {
  const id = torIdParam(req);
  const result = await Tor.updateOne({ _id: id, pipelineStatus: "enriched" }, { pipelineStatus: "rejected" });
  if (result.matchedCount === 0) throw httpError(404, "TOR not found");
  res.status(204).end();
}
