import type { Types } from "mongoose";
import { AdminNotification, User } from "../models";
import type { IngestionPhase } from "../models/IngestionRun";
import { getEmailSender } from "../email";
import { logIngestionEvent } from "./log";

export interface AlertedRun {
  _id: Types.ObjectId;
  phase: IngestionPhase;
  startedAt: Date;
}

/** ADMIN_ALERT_EMAILS: comma-separated addresses; blank means no email alerts. */
export function alertEmailsFromEnv(): string[] {
  return (process.env.ADMIN_ALERT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Tell administrators about runs just marked failed (FR-39): an in-app notification for every
 * admin account, plus one email per configured alert address. Never throws: a failed alert must
 * not undo or abort the run status change that already happened.
 */
export async function alertAdminsOfFailedRuns(runs: AlertedRun[], reason: string): Promise<void> {
  if (runs.length === 0) return;
  try {
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    if (admins.length > 0) {
      await AdminNotification.insertMany(
        admins.flatMap((admin) =>
          runs.map((run) => ({
            adminId: admin._id,
            type: "pipeline_run_failed" as const,
            ingestionRunId: run._id,
            message: `${run.phase} run ${run._id} marked failed: ${reason}`,
          }))
        )
      );
    }
  } catch (err) {
    console.error("admin in-app alert failed:", err);
  }

  const recipients = alertEmailsFromEnv();
  if (recipients.length === 0) return;
  const lines = runs.map(
    (run) => `- ${run.phase} run ${run._id} (started ${run.startedAt.toISOString()}): ${reason}`
  );
  const message = {
    subject: `[TOR] ${runs.length} pipeline run(s) failed or stalled`,
    text: `These ingestion runs were marked failed:\n\n${lines.join("\n")}\n`,
  };
  for (const to of recipients) {
    try {
      await getEmailSender().send({ to, ...message });
    } catch (err) {
      await logIngestionEvent({
        severity: "warning",
        component: "monitor.stalledRuns",
        message: `admin alert email to ${to} failed`,
        context: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
