import { categories, type Category, type TORStatus } from "@/lib/mockData";
import { categoryToSlug } from "@/lib/torApi";

/**
 * FR-7 (SRS §6.1): every search filter lives in one object, is serialized to
 * the page URL (so refresh / share / back keep it), and is turned into a single
 * `/api/tors` query. Category stays as the Thai label in the page URL so
 * existing links (`/tor?category=<label>` from CategoryGrid) keep working; it
 * is mapped to the backend slug only for the API call.
 */

export type SortKey = "newest" | "deadline" | "budgetDesc" | "budgetAsc";

export const SORT_KEYS: readonly SortKey[] = ["newest", "deadline", "budgetDesc", "budgetAsc"];
export const STATUSES: readonly TORStatus[] = ["เปิดรับ", "ใกล้ปิดรับ", "ปิดรับแล้ว"];

/** FR-6 project types. Keys mirror backend/src/config/projectTypes.ts. */
export const PROJECT_TYPE_LABELS = {
  "new-development": "พัฒนาระบบใหม่",
  enhancement: "ปรับปรุงระบบเดิม",
  maintenance: "บำรุงรักษาระบบ",
  "license-purchase": "จัดซื้อลิขสิทธิ์",
  "hardware-purchase": "จัดซื้อครุภัณฑ์",
  consulting: "จ้างที่ปรึกษา",
} as const;

export type ProjectType = keyof typeof PROJECT_TYPE_LABELS;
export const PROJECT_TYPES = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

/** Backend caps `tech` at 20 values per query. */
export const MAX_TECH_FILTERS = 20;

export interface TorFilters {
  q: string;
  categories: Category[];
  agencies: string[];
  /** Technology-stack values; matched whole-value, case-insensitively. */
  tech: string[];
  projectTypes: ProjectType[];
  statuses: TORStatus[];
  /** Whole baht, as typed; "" = no bound. */
  budgetMin: string;
  budgetMax: string;
  /** Announcement date range, `YYYY-MM-DD`; "" = no bound. */
  publishedFrom: string;
  publishedTo: string;
  sort: SortKey;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function all(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

function first(v: string | string[] | undefined): string {
  return all(v)[0] ?? "";
}

function budget(v: string | string[] | undefined): string {
  const s = first(v);
  return /^\d+$/.test(s) ? s : "";
}

function day(v: string | string[] | undefined): string {
  const s = first(v);
  return ISO_DAY.test(s) && !Number.isNaN(Date.parse(s)) ? s : "";
}

/** Keep the first spelling of each value, ignoring case ("Linux" vs "linux"). */
export function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const k = v.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Parse page search params, silently dropping values that aren't valid. */
export function parseTorFilters(params: RawSearchParams): TorFilters {
  const sort = first(params.sort) as SortKey;
  return {
    q: first(params.q),
    categories: all(params.category).filter((c): c is Category => categories.includes(c as Category)),
    agencies: [...new Set(all(params.agency))],
    tech: dedupeCaseInsensitive(all(params.tech)).slice(0, MAX_TECH_FILTERS),
    projectTypes: all(params.projectType).filter((t): t is ProjectType => PROJECT_TYPES.includes(t as ProjectType)),
    statuses: all(params.status).filter((s): s is TORStatus => STATUSES.includes(s as TORStatus)),
    budgetMin: budget(params.budgetMin),
    budgetMax: budget(params.budgetMax),
    publishedFrom: day(params.publishedFrom),
    publishedTo: day(params.publishedTo),
    sort: SORT_KEYS.includes(sort) ? sort : "newest",
  };
}

/** Filters → page URL search params. Defaults/empties are omitted to keep URLs short. */
export function toUrlParams(f: TorFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  f.categories.forEach((c) => p.append("category", c));
  f.agencies.forEach((a) => p.append("agency", a));
  f.tech.forEach((t) => p.append("tech", t));
  f.projectTypes.forEach((t) => p.append("projectType", t));
  f.statuses.forEach((s) => p.append("status", s));
  if (f.budgetMin) p.set("budgetMin", f.budgetMin);
  if (f.budgetMax) p.set("budgetMax", f.budgetMax);
  if (f.publishedFrom) p.set("publishedFrom", f.publishedFrom);
  if (f.publishedTo) p.set("publishedTo", f.publishedTo);
  if (f.sort !== "newest") p.set("sort", f.sort);
  return p;
}

/**
 * Filters → one `/api/tors` query. Status and sort are not backend params:
 * status is derived from the deadline on the client (see mapStatus in torApi),
 * so both are applied to the returned rows instead.
 */
export function toApiParams(f: TorFilters): URLSearchParams {
  const p = new URLSearchParams({ pageSize: "100" });
  if (f.q.trim()) p.set("q", f.q.trim());
  f.categories.forEach((c) => p.append("category", categoryToSlug(c)));
  f.agencies.forEach((a) => p.append("agency", a));
  f.tech.forEach((t) => p.append("tech", t));
  f.projectTypes.forEach((t) => p.append("projectType", t));
  if (f.budgetMin) p.set("budgetMin", f.budgetMin);
  if (f.budgetMax) p.set("budgetMax", f.budgetMax);
  // Dates are Bangkok calendar days; make "to" inclusive of that whole day.
  if (f.publishedFrom) p.set("publishedFrom", `${f.publishedFrom}T00:00:00+07:00`);
  if (f.publishedTo) p.set("publishedTo", `${f.publishedTo}T23:59:59.999+07:00`);
  return p;
}

export function activeFilterCount(f: TorFilters): number {
  return (
    f.categories.length +
    f.agencies.length +
    f.tech.length +
    f.projectTypes.length +
    f.statuses.length +
    (f.budgetMin ? 1 : 0) +
    (f.budgetMax ? 1 : 0) +
    (f.publishedFrom ? 1 : 0) +
    (f.publishedTo ? 1 : 0)
  );
}
