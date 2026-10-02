import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { ErrorReport, Tor, User, VendorProfile } from "../models";
import { httpError } from "../utils/httpError";

/**
 * Admin inbox for "this TOR's info is wrong" reports (FR-41): who reported it
 * (account + vendor company, or anonymous with an optional contact email),
 * what they said, which TOR, and the resolution.
 */

const listQuerySchema = z.object({
  status: z.enum(["open", "resolved", "all"]).default("open"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const updateSchema = z
  .object({
    status: z.enum(["open", "resolved"]),
    resolutionNote: z.string().trim().max(1000).optional(),
  })
  .strict();

type Id = { toString(): string };
const key = (id: Id | null | undefined) => (id ? id.toString() : "");

interface UserLite {
  _id: Id;
  email: string;
  role: string;
  avatarKey?: string;
}

function person(u: UserLite | undefined, companyName?: string) {
  if (!u) return null;
  return {
    id: key(u._id),
    email: u.email,
    displayName: companyName || u.email.split("@")[0],
    companyName: companyName ?? null,
    role: u.role,
    avatarUrl: u.avatarKey ? `/api/auth/avatar/${key(u._id)}` : null,
  };
}

/** GET /api/admin/reports?status=open|resolved|all — newest first, with reporter and TOR. */
export async function listReports(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const q = parsed.data;
  const filter = q.status === "all" ? {} : { status: q.status };

  const [reports, totalCount, openCount, resolvedCount] = await Promise.all([
    ErrorReport.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    ErrorReport.countDocuments(filter),
    ErrorReport.countDocuments({ status: "open" }),
    ErrorReport.countDocuments({ status: "resolved" }),
  ]);

  const userIds = [...new Set(reports.flatMap((r) => [key(r.reportedBy), key(r.resolvedBy)]).filter(Boolean))];
  const torIds = [...new Set(reports.map((r) => key(r.torId)))];
  const [users, profiles, tors] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("email role avatarKey").lean<UserLite[]>(),
    VendorProfile.find({ userId: { $in: userIds } }).select("userId companyName").lean(),
    // Any pipeline status: a report can outlive the TOR being hidden.
    Tor.find({ _id: { $in: torIds } }).select("title projectCode agency pipelineStatus").lean(),
  ]);
  const userById = new Map(users.map((u) => [key(u._id), u]));
  const companyByUser = new Map(profiles.map((p) => [key(p.userId), p.companyName ?? undefined]));
  const torById = new Map(tors.map((t) => [key(t._id), t]));

  const data = reports.map((r) => {
    const tor = torById.get(key(r.torId));
    return {
      id: key(r._id),
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
      reporter: r.reportedBy
        ? person(userById.get(key(r.reportedBy)), companyByUser.get(key(r.reportedBy)))
        : null,
      // Contact an anonymous reporter left, if any.
      reporterEmail: r.reportedBy ? null : (r.reporterEmail ?? null),
      tor: tor
        ? {
            id: key(tor._id),
            title: tor.title,
            projectCode: tor.projectCode ?? null,
            agency: tor.agency ?? null,
            isPublic: tor.pipelineStatus === "enriched",
          }
        : null,
      resolution:
        r.status === "resolved"
          ? {
              note: r.resolutionNote ?? null,
              resolvedAt: r.resolvedAt,
              resolvedBy: person(userById.get(key(r.resolvedBy))),
            }
          : null,
    };
  });

  res.status(200).json({
    data,
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    counts: { open: openCount, resolved: resolvedCount },
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}

/** PATCH /api/admin/reports/:id — resolve (with an optional note) or reopen a report. */
export async function updateReport(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid report id");
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const { status, resolutionNote } = parsed.data;

  const update =
    status === "resolved"
      ? { status, resolutionNote: resolutionNote || undefined, resolvedBy: req.user!.id, resolvedAt: new Date() }
      : { status, resolvedBy: null, resolvedAt: null, $unset: { resolutionNote: 1 } };

  const report = await ErrorReport.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean();
  if (!report) throw httpError(404, "Report not found");
  res.status(200).json({
    report: { id: key(report._id), status: report.status, resolvedAt: report.resolvedAt },
  });
}
