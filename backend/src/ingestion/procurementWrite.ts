import type { QueryFilter, Types } from "mongoose";
import { Tor, type ITor, type IProcurement } from "../models";

/**
 * The only way the lifecycle refresh and discovery write `procurement` on an existing TOR.
 *
 * Both work from a read taken before slow e-GP calls. The write is conditional on the stored
 * procurement still being the one that was read (`lastCheckedAt` is advanced by every writer,
 * including the deadline step), so a concurrent writer is detected instead of overwritten.
 * Only the refresh-owned paths are set, so `bidDeadline` and `deadlineAttempt` (owned by the
 * deadline step / admin) are never touched. `{ timestamps: false }` keeps `updatedAt` stable.
 *
 * @returns true when written; false when the TOR changed since `existing` was read — the caller
 *          skips it and the next run retries.
 */
export async function writeProcurementIfUnchanged(
  torId: Types.ObjectId,
  existing: IProcurement | null | undefined,
  merged: IProcurement
): Promise<boolean> {
  if (!existing) {
    // `procurement: null` matches both a missing and a null field.
    const res = await Tor.updateOne(
      { _id: torId, procurement: null } as QueryFilter<ITor>,
      { $set: { procurement: merged } },
      { timestamps: false }
    );
    return res.matchedCount > 0;
  }

  const $set: Record<string, unknown> = {
    "procurement.stage": merged.stage,
    "procurement.announcements": merged.announcements,
    "procurement.lastCheckedAt": merged.lastCheckedAt,
  };
  if (merged.source) $set["procurement.source"] = merged.source;
  const $unset: Record<string, 1> = {};
  if (merged.contractStatus === undefined) $unset["procurement.contractStatus"] = 1;
  else $set["procurement.contractStatus"] = merged.contractStatus;

  const res = await Tor.updateOne(
    { _id: torId, "procurement.lastCheckedAt": existing.lastCheckedAt } as QueryFilter<ITor>,
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { timestamps: false }
  );
  return res.matchedCount > 0;
}
