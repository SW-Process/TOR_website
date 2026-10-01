import type { Request, Response } from "express";
import { z } from "zod";
// Mongoose 9 renamed `FilterQuery` (the brief's name) to `QueryFilter`.
import type { QueryFilter } from "mongoose";
import { Tor } from "../models";
import type { ITor } from "../models";
import { httpError } from "../utils/httpError";
import { PROJECT_TYPES } from "../config/projectTypes";

/** Escape a user string so it is a literal inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const asArray = (v: unknown): string[] | undefined => {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.map(String) : [String(v)];
};

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  agency: z.preprocess(asArray, z.array(z.string()).optional()),
  category: z.preprocess(asArray, z.array(z.string()).optional()),
  tech: z.preprocess(asArray, z.array(z.string().trim().min(1).max(100)).max(20).optional()),
  projectType: z.preprocess(asArray, z.array(z.enum(PROJECT_TYPES)).optional()),
  budgetMin: z.coerce.number().min(0).optional(),
  budgetMax: z.coerce.number().min(0).optional(),
  publishedFrom: z.coerce.date().optional(),
  publishedTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
  .refine((q) => q.budgetMin === undefined || q.budgetMax === undefined || q.budgetMin <= q.budgetMax, {
    message: "budgetMin must not exceed budgetMax",
  });

type ListQuery = z.infer<typeof listQuerySchema>;

const LIST_PROJECTION =
  "title agency category budget referencePrice announcementDate submissionDeadline status projectCode projectType technologyStack sourceListingUrl";

function buildFilter(q: ListQuery): QueryFilter<ITor> {
  const filter: QueryFilter<ITor> = { pipelineStatus: "enriched" };
  // RULING: q is a case-insensitive regex match, not MongoDB $text — the default
  // text index tokenizes on whitespace and Thai has no word spaces. FR-1 asks for
  // title + description + extracted content: we have no stored OCR text, so the
  // AI summary, key points and tech stack stand in for the latter two, alongside
  // agency and projectCode which the search box also promises.
  if (q.q) {
    const re = { $regex: escapeRegExp(q.q), $options: "i" };
    filter.$or = [
      { title: re },
      { agency: re },
      { projectCode: re },
      { "aiSummary.summary": re },
      { "aiSummary.keyPoints": re },
      { technologyStack: re },
    ];
  }
  if (q.agency?.length) filter.agency = { $in: q.agency };
  if (q.category?.length) filter.category = { $in: q.category };
  // technologyStack is free text from the model ("Linux", "linux", …), so match
  // each requested tech case-insensitively but as a whole value, not a substring.
  if (q.tech?.length) {
    filter.technologyStack = { $in: q.tech.map((t) => new RegExp(`^${escapeRegExp(t)}$`, "i")) };
  }
  if (q.projectType?.length) filter.projectType = { $in: q.projectType };
  if (q.budgetMin !== undefined || q.budgetMax !== undefined) {
    const range: Record<string, number> = {};
    if (q.budgetMin !== undefined) range.$gte = q.budgetMin;
    if (q.budgetMax !== undefined) range.$lte = q.budgetMax;
    filter.budget = range;
  }
  if (q.publishedFrom || q.publishedTo) {
    const range: Record<string, Date> = {};
    if (q.publishedFrom) range.$gte = q.publishedFrom;
    if (q.publishedTo) range.$lte = q.publishedTo;
    filter.announcementDate = range;
  }
  return filter;
}

function parseQuery(req: Request): ListQuery {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}

/** GET /api/tors */
export async function listTors(req: Request, res: Response): Promise<void> {
  const q = parseQuery(req);
  const filter = buildFilter(q);
  const [data, totalCount] = await Promise.all([
    Tor.find(filter)
      .select(LIST_PROJECTION)
      .sort({ announcementDate: -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    Tor.countDocuments(filter),
  ]);
  res.status(200).json({
    data,
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}

/**
 * GET /api/tors/agencies — every agency that has at least one public TOR, for
 * the search page's agency filter options (FR-5). Read from the whole
 * collection, so options don't depend on which page of results was loaded.
 */
export async function listAgencies(_req: Request, res: Response): Promise<void> {
  const filter: QueryFilter<ITor> = { pipelineStatus: "enriched" };
  const [agencies, totalCount] = await Promise.all([
    Tor.distinct("agency", { ...filter, agency: { $nin: [null, ""] } }),
    Tor.countDocuments(filter),
  ]);
  const data = (agencies as string[]).sort((a, b) => a.localeCompare(b, "th"));
  res.status(200).json({ data, totalCount });
}

/**
 * GET /api/tors/technologies — tech-stack values across public TORs, most used
 * first, as suggestions for the search page's tech filter (FR-6).
 */
export async function listTechnologies(_req: Request, res: Response): Promise<void> {
  const rows = await Tor.aggregate<{ _id: string; count: number }>([
    { $match: { pipelineStatus: "enriched" } },
    { $unwind: "$technologyStack" },
    { $group: { _id: "$technologyStack", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  res.status(200).json({ data: rows.map((r) => ({ name: r._id, count: r.count })) });
}

/** GET /api/tors/:id */
export async function getTor(req: Request, res: Response): Promise<void> {
  const tor = await Tor.findOne({ _id: req.params.id, pipelineStatus: "enriched" })
    .select(
      "-sourceContentHash -classification -ingestionRunId -__v -sourceDocument.storageKey -sourceDocument.sha256"
    )
    .lean();
  if (!tor) throw httpError(404, "TOR not found");
  res.status(200).json({ tor });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? loVal;
  if (lo === hi) return loVal;
  return loVal + (hiVal - loVal) * (idx - lo);
}

/** GET /api/tors/price-stats */
export async function priceStats(req: Request, res: Response): Promise<void> {
  const groupBy = String(req.query.groupBy ?? "category");
  if (groupBy !== "category") throw httpError(400, "groupBy must be 'category'");
  const q = parseQuery(req);
  const filter = buildFilter(q);

  const rows = await Tor.find(filter).select("category budget referencePrice").lean();
  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    const value = typeof r.referencePrice === "number" ? r.referencePrice : r.budget;
    if (typeof value !== "number") continue;
    const key = r.category ?? "other";
    const arr = byKey.get(key);
    if (arr) arr.push(value);
    else byKey.set(key, [value]);
  }

  const groups = [...byKey.entries()]
    .map(([key, values]) => {
      const s = [...values].sort((a, b) => a - b);
      return {
        key,
        count: s.length,
        min: s[0] ?? 0,
        p25: percentile(s, 0.25),
        median: percentile(s, 0.5),
        p75: percentile(s, 0.75),
        max: s[s.length - 1] ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  res.status(200).json({ groupBy: "category", groups });
}
