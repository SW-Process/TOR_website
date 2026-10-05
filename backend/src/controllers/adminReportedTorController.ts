import type { Request, Response } from "express";
import type { Types } from "mongoose";
import { z } from "zod";
import { ErrorReport, Tor, User, VendorProfile } from "../models";
import { httpError } from "../utils/httpError";
import { key, person, type UserLite } from "../utils/personView";

/**
 * Admin queue of TORs that have open error reports (FR-40/FR-41): one row per TOR,
 * with how many reports are open and the newest one, so an admin can go straight to
 * the TOR to correct it. Resolved reports don't put a TOR in the queue.
 */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

interface ReportedGroup {
  _id: Types.ObjectId;
  openCount: number;
  latest: {
    _id: Types.ObjectId;
    reportedBy: Types.ObjectId | null;
    reporterEmail?: string;
    description: string;
    createdAt: Date;
  };
}

/** GET /api/admin/tors/reported — TORs with open reports, most recently reported first. */
export async function listReportedTors(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const q = parsed.data;

  const [page] = await ErrorReport.aggregate<{ data: ReportedGroup[]; total: Array<{ n: number }> }>([
    { $match: { status: "open" } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$torId",
        openCount: { $sum: 1 },
        latest: { $first: "$$ROOT" },
      },
    },
    { $sort: { "latest.createdAt": -1, _id: -1 } },
    {
      $facet: {
        data: [{ $skip: (q.page - 1) * q.pageSize }, { $limit: q.pageSize }],
        total: [{ $count: "n" }],
      },
    },
  ]);
  const groups = page?.data ?? [];
  const totalCount = page?.total[0]?.n ?? 0;

  const torIds = groups.map((g) => g._id);
  const userIds = [...new Set(groups.map((g) => key(g.latest.reportedBy)).filter(Boolean))];
  const [tors, users, profiles] = await Promise.all([
    // Any pipeline status: a reported TOR can have been hidden since.
    Tor.find({ _id: { $in: torIds } }).select("title projectCode agency pipelineStatus").lean(),
    User.find({ _id: { $in: userIds } }).select("email role avatarKey").lean<UserLite[]>(),
    VendorProfile.find({ userId: { $in: userIds } }).select("userId companyName").lean(),
  ]);
  const torById = new Map(tors.map((t) => [key(t._id), t]));
  const userById = new Map(users.map((u) => [key(u._id), u]));
  const companyByUser = new Map(profiles.map((p) => [key(p.userId), p.companyName ?? undefined]));

  const data = groups.map((g) => {
    const tor = torById.get(key(g._id));
    const r = g.latest;
    const reportedBy = r.reportedBy ? key(r.reportedBy) : null;
    return {
      tor: tor
        ? {
            id: key(tor._id),
            title: tor.title,
            projectCode: tor.projectCode ?? null,
            agency: tor.agency ?? null,
            isPublic: tor.pipelineStatus === "enriched",
          }
        : null,
      openReportCount: g.openCount,
      latestReport: {
        id: key(r._id),
        description: r.description,
        createdAt: r.createdAt,
        reporter: reportedBy ? person(userById.get(reportedBy), companyByUser.get(reportedBy)) : null,
        reporterEmail: reportedBy ? null : (r.reporterEmail ?? null),
      },
    };
  });

  res.status(200).json({
    data,
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}
