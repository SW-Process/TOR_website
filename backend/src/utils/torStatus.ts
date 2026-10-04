// backend/src/utils/torStatus.ts
import type { QueryFilter } from "mongoose";
import type { ITor } from "../models";

/**
 * User-facing lifecycle status of a TOR (spec §1). Derived from `Tor.procurement` — and the
 * admin's manual close — never from the legacy `submissionDeadline`.
 */
export const TOR_STATUSES = ["draft", "open", "closing_soon", "closed", "awarded", "cancelled"] as const;
export type TorDisplayStatus = (typeof TOR_STATUSES)[number];

/** A TOR whose bid deadline is at most this many days away is "closing soon". */
export const CLOSING_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

/** The minimal shape the rules read; satisfied by hydrated docs, lean docs and plain JSON. */
export interface StatusInput {
  /** The stored, admin-controlled status. Only "closed" matters (manual close). */
  status?: string | null;
  procurement?: {
    stage?: string | null;
    bidDeadline?: { date?: Date | string | null } | null;
  } | null;
}

/**
 * Precedence (first match wins): manual close → cancelled → awarded → inviting (by bid
 * deadline: passed = closed, within CLOSING_SOON_DAYS = closing_soon, later or unknown = open)
 * → draft (also for a TOR with no procurement yet). Keep `statusClause` in step with this.
 */
export function computeTorStatus(tor: StatusInput, now: Date = new Date()): TorDisplayStatus {
  if (tor.status === "closed") return "closed";
  const stage = tor.procurement?.stage;
  if (stage === "cancelled") return "cancelled";
  if (stage === "awarded") return "awarded";
  if (stage === "inviting") {
    const raw = tor.procurement?.bidDeadline?.date;
    const deadline = raw ? new Date(raw).getTime() : Number.NaN;
    if (Number.isNaN(deadline)) return "open";
    if (deadline < now.getTime()) return "closed";
    return deadline <= now.getTime() + CLOSING_SOON_DAYS * DAY_MS ? "closing_soon" : "open";
  }
  return "draft";
}

/** MongoDB mirror of `computeTorStatus`: matches exactly the TORs it would label `status`. */
export function statusClause(status: TorDisplayStatus, now: Date): QueryFilter<ITor> {
  const soon = new Date(now.getTime() + CLOSING_SOON_DAYS * DAY_MS);
  const notManuallyClosed = { status: { $ne: "closed" as const } };
  const inviting = { "procurement.stage": "inviting" };
  switch (status) {
    case "closed":
      return {
        $or: [{ status: "closed" }, { ...inviting, "procurement.bidDeadline.date": { $lt: now } }],
      } as QueryFilter<ITor>;
    case "cancelled":
      return { $and: [notManuallyClosed, { "procurement.stage": "cancelled" }] } as QueryFilter<ITor>;
    case "awarded":
      return { $and: [notManuallyClosed, { "procurement.stage": "awarded" }] } as QueryFilter<ITor>;
    case "draft":
      // Total complement of the other stages: `$nin` also matches a missing/null stage (no
      // procurement yet) and any unknown stage, as computeTorStatus's fall-through does.
      return {
        $and: [notManuallyClosed, { "procurement.stage": { $nin: ["inviting", "awarded", "cancelled"] } }],
      } as QueryFilter<ITor>;
    case "closing_soon":
      return {
        $and: [notManuallyClosed, inviting, { "procurement.bidDeadline.date": { $gte: now, $lte: soon } }],
      } as QueryFilter<ITor>;
    case "open":
      return {
        $and: [
          notManuallyClosed,
          inviting,
          { $or: [{ "procurement.bidDeadline.date": { $gt: soon } }, { "procurement.bidDeadline.date": null }] },
        ],
      } as QueryFilter<ITor>;
  }
}

/** Stamp the computed status on a response row. Returns a new object. */
export function withDisplayStatus<T extends StatusInput>(
  row: T,
  now: Date = new Date()
): T & { displayStatus: TorDisplayStatus } {
  return { ...row, displayStatus: computeTorStatus(row, now) };
}
