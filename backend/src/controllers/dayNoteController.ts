import type { Request, Response } from "express";
import { z } from "zod";
import { VendorProfile } from "../models";
import { httpError } from "../utils/httpError";
import { loadOrCreateProfile } from "./vendorProfileController";

/**
 * The bookmark calendar's day notes (FR-32). They used to live in the browser's
 * localStorage, which outlived logout on shared computers (ASVS 14.3.1); now the
 * server keeps them with the rest of the vendor's data.
 */

/** Upper bound on one vendor's notes, so the embedded map stays small. */
export const MAX_DAY_NOTES = 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const noteBodySchema = z.object({ note: z.string().max(2000) }).strict();

/** A real calendar day: `2026-02-30` has the right shape but isn't one (ASVS 2.2.3). */
function isCalendarDate(key: string): boolean {
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

function dateParam(req: Request): string {
  const date = String(req.params.date);
  if (!DATE_KEY.test(date) || !isCalendarDate(date)) throw httpError(400, "date must be a real YYYY-MM-DD day");
  return date;
}

/** GET /api/vendor/day-notes — every note of the caller, as `{ "YYYY-MM-DD": "text" }`. */
export async function listDayNotes(req: Request, res: Response): Promise<void> {
  const profile = await loadOrCreateProfile(req.user!.id);
  res.status(200).json({ notes: Object.fromEntries(profile?.dayNotes ?? []) });
}

/** PUT /api/vendor/day-notes/:date — set one day's note; blank removes it. */
export async function putDayNote(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  const parsed = noteBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const note = parsed.data.note.trim() ? parsed.data.note : "";

  const profile = await loadOrCreateProfile(req.user!.id);
  const path = `dayNotes.${date}`;
  if (!note) {
    await VendorProfile.updateOne({ _id: profile!._id }, { $unset: { [path]: "" } });
    res.status(204).end();
    return;
  }
  if (!profile!.dayNotes?.has(date) && (profile!.dayNotes?.size ?? 0) >= MAX_DAY_NOTES) {
    throw httpError(409, `You can keep at most ${MAX_DAY_NOTES} day notes`);
  }
  await VendorProfile.updateOne({ _id: profile!._id }, { $set: { [path]: note } }, { runValidators: true });
  res.status(204).end();
}
