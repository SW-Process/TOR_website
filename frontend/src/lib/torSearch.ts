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
export const STATUSES: readonly TORStatus[] = [
  "เปิดรับ",
  "ใกล้ปิดรับ",
  "ร่าง TOR",
  "ปิดรับแล้ว",
  "ประกาศผู้ชนะแล้ว",
  "ยกเลิก",
];

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

/** Results per page (a multiple of the 2- and 3-column grid). */
export const PAGE_SIZE = 24;

/** UI sort option → backend `sort` / `order` (FR-2). */
const SORT_API: Record<SortKey, { sort: string; order: "asc" | "desc" }> = {
  newest: { sort: "announcementDate", order: "desc" },
  deadline: { sort: "bidDeadline", order: "asc" },
  budgetDesc: { sort: "budget", order: "desc" },
  budgetAsc: { sort: "budget", order: "asc" },
};

export const STATUS_API: Record<TORStatus, string> = {
  เปิดรับ: "open",
  ใกล้ปิดรับ: "closing_soon",
  ปิดรับแล้ว: "closed",
  "ร่าง TOR": "draft",
  ประกาศผู้ชนะแล้ว: "awarded",
  ยกเลิก: "cancelled",
};

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
  /** Submission-deadline range, `YYYY-MM-DD`; "" = no bound. */
  deadlineFrom: string;
  deadlineTo: string;
  sort: SortKey;
  /** 1-based results page. Any other filter change resets it to 1. */
  page: number;
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

function pageNumber(v: string | string[] | undefined): number {
  const s = first(v);
  return /^\d+$/.test(s) && Number(s) >= 1 ? Number(s) : 1;
}

/** Parse page search params, silently dropping values that aren't valid. */
/** URLSearchParams (e.g. from useSearchParams) → the record shape parseTorFilters takes; repeated keys become arrays. */
export function searchParamsToRaw(params: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length > 1 ? values : values[0];
  }
  return raw;
}

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
    deadlineFrom: day(params.deadlineFrom),
    deadlineTo: day(params.deadlineTo),
    sort: SORT_KEYS.includes(sort) ? sort : "newest",
    page: pageNumber(params.page),
  };
}

/**
 * The "ใกล้ปิดรับ" shortcut (header, homepage, 404): the search page with the
 * ใกล้ปิดรับ status filter ticked, soonest deadline first.
 */
export const CLOSING_SOON_HREF = `/tor?${new URLSearchParams([
  ["status", "ใกล้ปิดรับ"],
  ["sort", "deadline"],
]).toString()}`;

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
  if (f.deadlineFrom) p.set("deadlineFrom", f.deadlineFrom);
  if (f.deadlineTo) p.set("deadlineTo", f.deadlineTo);
  if (f.sort !== "newest") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

/** True when both budget bounds are set and min > max (the backend 400s on this). */
export function isBudgetRangeInverted(f: Pick<TorFilters, "budgetMin" | "budgetMax">): boolean {
  return f.budgetMin !== "" && f.budgetMax !== "" && Number(f.budgetMin) > Number(f.budgetMax);
}

/** True when both `YYYY-MM-DD` bounds are set and from > to. */
export function isDateRangeInverted(from: string, to: string): boolean {
  return from !== "" && to !== "" && from > to;
}

const startOfDay = (d: string) => `${d}T00:00:00+07:00`;
const endOfDay = (d: string) => `${d}T23:59:59.999+07:00`;

/** Filters → one server-filtered, server-sorted, server-paginated `/api/tors` query. */
export function toApiParams(f: TorFilters): URLSearchParams {
  const p = new URLSearchParams({
    page: String(f.page),
    pageSize: String(PAGE_SIZE),
    ...SORT_API[f.sort],
  });
  f.statuses.forEach((s) => p.append("status", STATUS_API[s]));
  if (f.q.trim()) p.set("q", f.q.trim());
  f.categories.forEach((c) => p.append("category", categoryToSlug(c)));
  f.agencies.forEach((a) => p.append("agency", a));
  f.tech.forEach((t) => p.append("tech", t));
  f.projectTypes.forEach((t) => p.append("projectType", t));
  // An inverted range is flagged in the UI instead; don't send it (the backend
  // would 400) — leave budget unfiltered until the user fixes it.
  if (!isBudgetRangeInverted(f)) {
    if (f.budgetMin) p.set("budgetMin", f.budgetMin);
    if (f.budgetMax) p.set("budgetMax", f.budgetMax);
  }
  // Dates are Bangkok calendar days; make "to" inclusive of that whole day.
  // Inverted ranges are flagged in the UI and not sent (the backend would 400).
  if (!isDateRangeInverted(f.publishedFrom, f.publishedTo)) {
    if (f.publishedFrom) p.set("publishedFrom", startOfDay(f.publishedFrom));
    if (f.publishedTo) p.set("publishedTo", endOfDay(f.publishedTo));
  }
  if (!isDateRangeInverted(f.deadlineFrom, f.deadlineTo)) {
    if (f.deadlineFrom) p.set("deadlineFrom", startOfDay(f.deadlineFrom));
    if (f.deadlineTo) p.set("deadlineTo", endOfDay(f.deadlineTo));
  }
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
    (f.publishedTo ? 1 : 0) +
    (f.deadlineFrom ? 1 : 0) +
    (f.deadlineTo ? 1 : 0)
  );
}
