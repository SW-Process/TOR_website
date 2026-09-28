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
