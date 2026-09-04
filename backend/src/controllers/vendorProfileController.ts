import type { Request, Response } from "express";
import { VendorProfile } from "../models";
import type { IVendorProfile } from "../models";
import { httpError } from "../utils/httpError";

const MAX_STR = 200;
const MAX_ITEMS = 100;
const MAX_ITEM_LEN = 120;

/* ------------------------------- validation -------------------------------- */

function asString(raw: unknown, field: string, max = MAX_STR): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") throw httpError(400, `${field} must be a string`);
  const trimmed = raw.trim();
  if (trimmed.length > max) throw httpError(400, `${field} must be at most ${max} characters`);
  return trimmed || undefined;
}

function asNonNegativeNumber(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) throw httpError(400, `${field} must be a number >= 0`);
  return n;
}

function asStringArray(raw: unknown, field: string): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw httpError(400, `${field} must be an array of strings`);
  if (raw.length > MAX_ITEMS) throw httpError(400, `${field} must have at most ${MAX_ITEMS} items`);
  return raw
    .map((item, i) => {
      if (typeof item !== "string") throw httpError(400, `${field}[${i}] must be a string`);
      const trimmed = item.trim();
      if (trimmed.length > MAX_ITEM_LEN) {
        throw httpError(400, `${field}[${i}] must be at most ${MAX_ITEM_LEN} characters`);
      }
      return trimmed;
    })
    .filter(Boolean);
}

type EditableProfile = Pick<
  IVendorProfile,
  | "companyName"
  | "businessType"
  | "registeredCapital"
  | "yearsExperience"
  | "teamSize"
  | "certifications"
  | "technologyStack"
  | "interestedCategories"
  | "budgetRange"
  | "serviceArea"
>;

function validateProfileBody(body: Record<string, unknown>): EditableProfile {
  const budgetSource = (body.budgetRange ?? {}) as Record<string, unknown>;
  const budgetMin = asNonNegativeNumber(body.budgetMin ?? budgetSource.min, "budgetMin");
  const budgetMax = asNonNegativeNumber(body.budgetMax ?? budgetSource.max, "budgetMax");
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
    throw httpError(400, "budgetMin must not exceed budgetMax");
  }

  return {
    companyName: asString(body.companyName, "companyName"),
    businessType: asString(body.businessType, "businessType"),
    registeredCapital: asNonNegativeNumber(body.registeredCapital, "registeredCapital"),
    yearsExperience: asNonNegativeNumber(body.yearsExperience ?? body.experienceYears, "yearsExperience"),
    teamSize: asNonNegativeNumber(body.teamSize, "teamSize"),
    certifications: asStringArray(body.certifications, "certifications") ?? [],
    technologyStack: asStringArray(body.technologyStack, "technologyStack") ?? [],
    interestedCategories: asStringArray(body.interestedCategories, "interestedCategories") ?? [],
    budgetRange:
      budgetMin === undefined && budgetMax === undefined ? undefined : { min: budgetMin, max: budgetMax },
    serviceArea: asString(body.serviceArea, "serviceArea"),
  };
}

interface SavedSearchInput {
  name?: string;
  filters?: Record<string, unknown>;
  alertsEnabled?: boolean;
}

function pathParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function validateSavedSearch(body: Record<string, unknown>, partial: boolean): SavedSearchInput {
  const out: SavedSearchInput = {};

  if (body.name !== undefined || !partial) {
    const name = asString(body.name, "name");
    if (!name) throw httpError(400, "name is required");
    out.name = name;
  }
  if (body.filters !== undefined) {
    if (typeof body.filters !== "object" || body.filters === null || Array.isArray(body.filters)) {
      throw httpError(400, "filters must be an object");
    }
    out.filters = body.filters as Record<string, unknown>;
  }
  if (body.alertsEnabled !== undefined) {
    if (typeof body.alertsEnabled !== "boolean") throw httpError(400, "alertsEnabled must be a boolean");
    out.alertsEnabled = body.alertsEnabled;
  }
  return out;
}

/* -------------------------------- handlers --------------------------------- */

/** Find the caller's profile, creating an empty one on first access (UC-2). */
async function loadOrCreateProfile(userId: string) {
  return VendorProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

/** GET /api/vendor/profile — the caller's business profile (FR-22). */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const profile = await loadOrCreateProfile(req.user!.id);
  res.status(200).json({ profile });
}

/** PUT /api/vendor/profile — replace the editable fields of the caller's profile. */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const next = validateProfileBody((req.body ?? {}) as Record<string, unknown>);

  const profile =
    (await VendorProfile.findOne({ userId: req.user!.id })) ??
    new VendorProfile({ userId: req.user!.id });

  Object.assign(profile, next);
  await profile.save();

  res.status(200).json({ profile });
}

/** GET /api/vendor/profile/saved-searches — the caller's saved searches (FR-28). */
export async function listSavedSearches(req: Request, res: Response): Promise<void> {
  const profile = await loadOrCreateProfile(req.user!.id);
  res.status(200).json({ savedSearches: profile.savedSearches });
}

/** POST /api/vendor/profile/saved-searches — add a saved search. */
export async function addSavedSearch(req: Request, res: Response): Promise<void> {
  const input = validateSavedSearch((req.body ?? {}) as Record<string, unknown>, false);

  const profile = await loadOrCreateProfile(req.user!.id);
  profile.savedSearches.push({
    name: input.name!,
    filters: input.filters ?? {},
    alertsEnabled: input.alertsEnabled ?? false,
  });
  await profile.save();

  res.status(201).json({ savedSearch: profile.savedSearches[profile.savedSearches.length - 1] });
}

/** PATCH /api/vendor/profile/saved-searches/:searchId — edit one saved search. */
export async function updateSavedSearch(req: Request, res: Response): Promise<void> {
  const input = validateSavedSearch((req.body ?? {}) as Record<string, unknown>, true);
  const searchId = pathParam(req.params.searchId);
  if (!searchId) throw httpError(400, "A saved search id is required");

  const profile = await loadOrCreateProfile(req.user!.id);
  const search = profile.savedSearches.id(searchId);
  if (!search) throw httpError(404, "Saved search not found");

  if (input.name !== undefined) search.name = input.name;
  if (input.filters !== undefined) search.filters = input.filters;
  if (input.alertsEnabled !== undefined) search.alertsEnabled = input.alertsEnabled;
  await profile.save();

  res.status(200).json({ savedSearch: search });
}

/** DELETE /api/vendor/profile/saved-searches/:searchId — remove one saved search. */
export async function deleteSavedSearch(req: Request, res: Response): Promise<void> {
  const searchId = pathParam(req.params.searchId);
  if (!searchId) throw httpError(400, "A saved search id is required");

  const profile = await loadOrCreateProfile(req.user!.id);
  const search = profile.savedSearches.id(searchId);
  if (!search) throw httpError(404, "Saved search not found");

  search.deleteOne();
  await profile.save();

  res.status(204).end();
}
