import type { Types } from "mongoose";
import { logIngestionEvent } from "./log";
import { alertAdminsOfFailedRuns } from "./adminAlerts";
import type { IngestionPhase } from "../models/IngestionRun";

export interface FailedRunRef {
  _id: Types.ObjectId;
  phase: IngestionPhase;
  startedAt: Date;
  updatedAt: Date;
}

/**
 * One SystemLog error per run that was marked failed by a stall check (FR-39), so the
 * admin console shows why a run was failed, and admins are alerted (in-app and by email).
 * Callers mark the run first, then call this.
 */
export async function logFailedRuns(runs: FailedRunRef[], reason: string, now: Date): Promise<void> {
  await alertAdminsOfFailedRuns(runs, reason);
  await Promise.all(
    runs.map((run) =>
      logIngestionEvent({
        severity: "error",
        component: "monitor.stalledRuns",
        message: `${run.phase} run marked failed: ${reason}`,
        ingestionRunId: run._id,
        context: {
          phase: run.phase,
          startedAt: run.startedAt,
          lastUpdatedAt: run.updatedAt,
          markedAt: now,
        },
      })
    )
  );
}
