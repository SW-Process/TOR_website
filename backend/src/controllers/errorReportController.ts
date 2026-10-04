import type { Request, Response } from "express";
import { z } from "zod";
import { ErrorReport, Tor } from "../models";
import { httpError } from "../utils/httpError";

const reportBodySchema = z.object({
  description: z.string().trim().min(5).max(2000),
  // only meaningful for an anonymous reporter — ignored when logged in, since
  // reportedBy already identifies the account.
  reporterEmail: z.string().trim().toLowerCase().email().max(200).optional(),
});

/** POST /api/tors/:id/report — file a "this TOR's info is wrong" report (FR-41). */
export async function reportTorError(req: Request, res: Response): Promise<void> {
  const tor = await Tor.findById(req.params.id).select("_id").lean();
  if (!tor) throw httpError(404, "TOR not found");

  const parsed = reportBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { description, reporterEmail } = parsed.data;

  const report = await ErrorReport.create({
    torId: tor._id,
    reportedBy: req.user?.id ?? null,
    reporterEmail: req.user ? undefined : reporterEmail,
    description,
  });

  res.status(201).json({
    report: {
      id: report.id,
      torId: report.torId,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
}

/** How many of their own reports a user sees; plenty for one account. */
const MY_REPORTS_LIMIT = 200;

/**
 * GET /api/auth/reports — the caller's own error reports, newest first, with the
 * TOR they're about and, once resolved, the admin's note. Who resolved it stays
 * private; a TOR that is no longer public comes back as null.
 */
export async function listMyReports(req: Request, res: Response): Promise<void> {
  const reports = await ErrorReport.find({ reportedBy: req.user!.id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MY_REPORTS_LIMIT)
    .lean();
  const tors = await Tor.find({ _id: { $in: reports.map((r) => r.torId) }, pipelineStatus: "enriched" })
    .select("title agency projectCode category")
    .lean();
  const torById = new Map(tors.map((t) => [String(t._id), t]));

  res.status(200).json({
    data: reports.map((r) => {
      const tor = torById.get(String(r.torId));
      return {
        id: String(r._id),
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
        resolution:
          r.status === "resolved" ? { note: r.resolutionNote ?? null, resolvedAt: r.resolvedAt } : null,
        tor: tor
          ? {
              id: String(tor._id),
              title: tor.title,
              agency: tor.agency ?? null,
              projectCode: tor.projectCode ?? null,
              category: tor.category ?? null,
            }
          : null,
      };
    }),
  });
}
