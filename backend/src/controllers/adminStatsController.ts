import type { Request, Response } from "express";
import { IngestionRun, Tor } from "../models";

/** Bangkok has no DST, so a fixed offset is exact. */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC instant of 00:00 Bangkok time on the Bangkok day containing `at`. */
function startOfBkkDay(at: Date): Date {
  const local = new Date(at.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BKK_OFFSET_MS);
}

/** The last `count` Bangkok months ending with the one containing `at`, oldest first. */
function lastBkkMonths(at: Date, count: number): { key: string; start: Date }[] {
  const local = new Date(at.getTime() + BKK_OFFSET_MS);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (count - 1 - i), 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, start: new Date(d.getTime() - BKK_OFFSET_MS) };
  });
}

// Runs from before `phase` existed are discovery runs.
const DISCOVERY = { phase: { $in: ["discovery" as const, null] } };

function runSummary(run: { status: string; startedAt: Date; completedAt: Date | null } | null) {
  return run ? { status: run.status, startedAt: run.startedAt, completedAt: run.completedAt } : null;
}

/**
 * GET /api/admin/stats?months=5|8 — numbers for the admin overview: TORs
 * ingested today, open fairness signals, latest pipeline runs, 30-day run
 * success rate, and TORs ingested per month (by `createdAt`, Bangkok time).
 */
export async function getAdminStats(req: Request, res: Response): Promise<void> {
  const months = req.query.months === "8" ? 8 : 5;
  const now = new Date();
  const today = startOfBkkDay(now);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const monthRange = lastBkkMonths(now, months);
  const since30d = new Date(now.getTime() - 30 * DAY_MS);

  const [
    createdToday,
    createdYesterday,
    flaggedCount,
    lastDiscovery,
    lastEnrichment,
    finished30d,
    succeeded30d,
    perMonth,
  ] = await Promise.all([
    Tor.countDocuments({ createdAt: { $gte: today } }),
    Tor.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
    Tor.countDocuments({ pipelineStatus: "enriched", fairnessFlags: { $elemMatch: { status: "open" } } }),
    IngestionRun.findOne(DISCOVERY).sort({ startedAt: -1 }).lean(),
    IngestionRun.findOne({ phase: "enrichment" }).sort({ startedAt: -1 }).lean(),
    IngestionRun.countDocuments({ startedAt: { $gte: since30d }, status: { $ne: "running" } }),
    IngestionRun.countDocuments({ startedAt: { $gte: since30d }, status: "success" }),
    Tor.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: monthRange[0]!.start } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Bangkok" } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const countByMonth = new Map(perMonth.map((m) => [m._id, m.count]));
  res.status(200).json({
    createdToday,
    createdYesterday,
    flaggedCount,
    lastDiscovery: runSummary(lastDiscovery),
    lastEnrichment: runSummary(lastEnrichment),
    runs30d: { finished: finished30d, succeeded: succeeded30d },
    monthly: monthRange.map((m) => ({ month: m.key, count: countByMonth.get(m.key) ?? 0 })),
  });
}
