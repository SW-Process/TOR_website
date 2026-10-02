import type { Request, Response } from "express";
import type { QueryFilter } from "mongoose";
import { z } from "zod";
import { SystemLog } from "../models";
import type { ISystemLog } from "../models";
import { httpError } from "../utils/httpError";

/** Escape a user string so it is a literal inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SEVERITIES = ["info", "warning", "error"] as const;

const listQuerySchema = z.object({
  severity: z.enum(SEVERITIES).optional(),
  source: z.enum(["ingestion", "ai-pipeline", "application"]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/admin/logs — system logs newest first (FR-37, FR-38), filterable by
 * severity / source and a case-insensitive search over component + message.
 * `counts` are per severity under the other filters, for the tab badges.
 */
export async function listLogs(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const q = parsed.data;

  const base: QueryFilter<ISystemLog> = {};
  if (q.source) base.source = q.source;
  if (q.q) {
    const re = { $regex: escapeRegExp(q.q), $options: "i" };
    base.$or = [{ message: re }, { component: re }];
  }
  const filter = q.severity ? { ...base, severity: q.severity } : base;

  const [data, totalCount, bySeverity] = await Promise.all([
    SystemLog.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .select("-__v")
      .lean(),
    SystemLog.countDocuments(filter),
    SystemLog.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: "$severity", n: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<(typeof SEVERITIES)[number], number>;
  for (const row of bySeverity) {
    if (row._id in counts) counts[row._id as keyof typeof counts] = row.n;
  }

  res.status(200).json({
    data,
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    counts,
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}
