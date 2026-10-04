import { API_BASE } from "@/lib/api";
import { type AISummary, type Category, type FairnessField, type FairnessFlag, type TOR, type TorProcurementView } from "@/lib/mockData";
import { STATUS_FROM_API } from "@/lib/torStatus";

/**
 * API_BASE (NEXT_PUBLIC_API_BASE_URL) is the browser-facing address — in
 * Docker it's http://localhost:8000, which only resolves from the host
 * machine. fetchTorList/fetchTorById also run server-side (the homepage and
 * TOR detail page are Server Components), where "localhost:8000" is the
 * Next.js container's own loopback, not the backend container, so the fetch
 * fails and the detail page 404s. Use INTERNAL_API_BASE_URL (the Docker
 * service DNS name) there instead; outside Docker, server and browser share
 * a host, so API_BASE already resolves correctly and this is unset.
 */
function resolveApiBase(): string {
  if (typeof window !== "undefined") return API_BASE;
  return process.env.INTERNAL_API_BASE_URL || API_BASE;
}

/**
 * Real ingested TORs frequently have no submissionDeadline yet (most rows in
 * the current e-GP import). Rather than fabricate a plausible-looking date,
 * fall back to this far-future sentinel so downstream "days left" math never
 * shows an urgent/expired state for a deadline we don't actually know.
 */
export const UNKNOWN_DEADLINE = "2099-12-31";

export function isUnknownDeadline(iso: string): boolean {
  return iso === UNKNOWN_DEADLINE;
}

// Backend taxonomy (backend/src/config/taxonomy.ts, 20 slugs) — 1:1 onto the
// frontend's 20 display categories (frontend/src/lib/mockData.ts). Keep both
// lists and src/components/picture/<slug>.jpg in sync when either changes.
const CATEGORY_MAP: Record<string, Category> = {
  "software-development": "พัฒนาระบบซอฟต์แวร์",
  "information-system": "ระบบสารสนเทศ",
  "erp-back-office": "ระบบ ERP และงานหลังบ้าน",
  "hospital-information-system": "ระบบสารสนเทศโรงพยาบาล",
  "web-application": "พัฒนาเว็บไซต์และแอปพลิเคชัน",
  "mobile-application": "แอปพลิเคชันมือถือ",
  "e-learning": "ระบบ e-Learning",
  "chatbot-line-oa": "แชทบอทและ Line OA",
  "cloud-infrastructure": "โครงสร้างพื้นฐานและคลาวด์",
  "network-datacenter": "เครือข่ายและดาต้าเซ็นเตอร์",
  "iot-sensor": "IoT และเซนเซอร์",
  "cctv-its": "กล้องวงจรปิดและจราจรอัจฉริยะ",
  cybersecurity: "ความมั่นคงปลอดภัยไซเบอร์",
  "data-platform-analytics": "ข้อมูลและระบบวิเคราะห์",
  gis: "ระบบภูมิสารสนเทศ (GIS)",
  "system-maintenance": "บำรุงรักษาระบบ",
  "software-license": "จัดซื้อลิขสิทธิ์ซอฟต์แวร์",
  "hardware-with-software": "จัดซื้อครุภัณฑ์ไอที",
  "it-consulting-sa": "ที่ปรึกษาด้านดิจิทัล",
  other: "อื่นๆ",
};

const CATEGORY_SLUG = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([slug, label]) => [label, slug]),
) as Record<Category, string>;

/** Thai display category → backend taxonomy slug (what TORs are stored with). */
export function categoryToSlug(label: Category): string {
  return CATEGORY_SLUG[label];
}

function mapCategory(raw?: string): Category {
  if (!raw) return "อื่นๆ";
  return CATEGORY_MAP[raw] ?? "อื่นๆ";
}

/**
 * Backend slug → Thai display category. Profiles saved before slugs were sent
 * still hold the Thai label itself, so accept that too; drop anything else.
 */
export function slugToCategory(raw: string): Category | null {
  if (raw in CATEGORY_MAP) return CATEGORY_MAP[raw];
  return raw in CATEGORY_SLUG ? (raw as Category) : null;
}

/** A TOR whose submission deadline is at most this many days away is "ใกล้ปิดรับ". */
export const CLOSING_SOON_DAYS = 7;

const CONFIDENCE_MAP: Record<string, AISummary["confidence"]> = {
  high: "สูง",
  medium: "ปานกลาง",
  low: "ต่ำ",
};

interface ApiEvaluationCriterion {
  label: string;
  weight?: number;
}

interface ApiAiSummary {
  summary?: string | null;
  keyPoints?: string[];
  qualifications?: string[];
  evaluationCriteria?: ApiEvaluationCriterion[];
  confidence?: string;
  generatedAt?: string;
}

interface ApiFairnessFlag {
  field?: string;
  severity?: string;
  message: string;
  detectedAt?: string;
}

interface ApiAnnouncement {
  announcementId: string;
  typeName?: string;
  kind?: string;
  publishedAt?: string;
  hasFile?: boolean;
}

interface ApiProcurement {
  stage?: string;
  contractStatus?: string;
  bidDeadline?: { date?: string } | null;
  lastCheckedAt?: string;
  /** Detail responses only. */
  announcements?: ApiAnnouncement[];
}

const PROCUREMENT_STAGES = ["draft", "inviting", "awarded", "cancelled"] as const;

function mapProcurement(raw: ApiProcurement | null | undefined): TorProcurementView | null {
  if (!raw?.stage) return null;
  return {
    stage: PROCUREMENT_STAGES.find((s) => s === raw.stage) ?? "draft",
    contractStatus: raw.contractStatus ?? null,
    bidDeadline: raw.bidDeadline?.date ?? null,
    lastCheckedAt: raw.lastCheckedAt ?? null,
    announcements: (raw.announcements ?? []).map((a) => ({
      id: a.announcementId,
      kind: a.kind ?? "unknown",
      typeName: a.typeName ?? null,
      publishedAt: a.publishedAt ?? null,
      hasFile: a.hasFile ?? false,
    })),
  };
}

export interface ApiTor {
  _id: string;
  title: string;
  agency?: string;
  department?: string;
  category?: string;
  budget?: number;
  referencePrice?: number;
  announcementDate?: string;
  submissionDeadline?: string;
  status?: string;
  /** Server-computed effective status (draft | open | closing_soon | closed | awarded | cancelled). */
  displayStatus?: string;
  procurement?: ApiProcurement | null;
  projectCode?: string;
  location?: string;
  viewCount?: number;
  sourceDocumentUrl?: string;
  sourceListingUrl?: string;
  aiSummary?: ApiAiSummary | null;
  fairnessFlags?: ApiFairnessFlag[];
}

const FAIRNESS_FIELDS: readonly FairnessField[] = [
  "budget",
  "deadline",
  "category",
  "agency",
  "title",
  "qualificationRequirements",
  "other",
];

function mapFairnessField(raw: string | undefined): FairnessField {
  return (FAIRNESS_FIELDS as readonly string[]).includes(raw ?? "") ? (raw as FairnessField) : "other";
}

function mapFairnessFlags(raw: ApiFairnessFlag[] | undefined, fallbackDate: string): FairnessFlag[] {
  return (raw ?? []).map((f) => ({
    field: mapFairnessField(f.field),
    severity: f.severity === "high" || f.severity === "low" ? f.severity : "medium",
    message: f.message,
    detectedAt: f.detectedAt ?? fallbackDate,
  }));
}

function mapSummary(raw: ApiAiSummary | null | undefined, fallbackDate: string): AISummary {
  return {
    keyPoints: raw?.keyPoints ?? [],
    qualifications: raw?.qualifications ?? [],
    evaluationCriteria: (raw?.evaluationCriteria ?? []).map((c) => ({
      label: c.label,
      weight: c.weight,
    })),
    generatedAt: raw?.generatedAt ?? fallbackDate,
    confidence: (raw?.confidence && CONFIDENCE_MAP[raw.confidence]) || "ปานกลาง",
  };
}

/** Map a raw `/api/tors` (list or detail) row onto the frontend's TOR shape. */
export function mapApiTor(raw: ApiTor): TOR {
  // Empty string = unknown. Don't substitute today's date: the page would then
  // claim the TOR was announced today.
  const announceDate = raw.announcementDate ?? "";
  const fallbackDate = announceDate || new Date().toISOString();
  const deadline = raw.submissionDeadline ?? UNKNOWN_DEADLINE;
  return {
    id: raw._id,
    title: raw.title,
    agency: raw.agency ?? "ไม่ระบุหน่วยงาน",
    department: raw.department ?? "",
    category: mapCategory(raw.category),
    budget: raw.budget ?? raw.referencePrice ?? 0,
    announceDate,
    deadline,
    // The server computes the status from the procurement stage; a missing value (an old
    // response) falls back to the pre-lifecycle default.
    status: STATUS_FROM_API[raw.displayStatus ?? ""] ?? "เปิดรับ",
    procurement: mapProcurement(raw.procurement),
    manualClosed: raw.status === "closed",
    projectCode: raw.projectCode ?? raw._id,
    location: raw.location ?? raw.agency ?? "",
    views: raw.viewCount ?? 0,
    // sourceDocumentUrl is only set when a PDF was actually fetched & stored during
    // ingestion (backend/src/ingestion/fetchAndStoreTorPdf.ts) — either an absolute
    // GCS URL or our own relative /api/tors/:id/document streaming path.
    documentUrl: raw.sourceDocumentUrl
      ? raw.sourceDocumentUrl.startsWith("http")
        ? raw.sourceDocumentUrl
        : `${API_BASE}${raw.sourceDocumentUrl}`
      : null,
    // Always the original e-GP announcement page, regardless of whether we have a PDF.
    sourceListingUrl: raw.sourceListingUrl ?? null,
    description: raw.aiSummary?.summary ?? "",
    summary: mapSummary(raw.aiSummary, fallbackDate),
    fairnessFlags: mapFairnessFlags(raw.fairnessFlags, fallbackDate),
  };
}

/**
 * GET /api/tors — fetches the (currently small) enriched TOR set and maps it.
 * The API leaves out TORs a signed-in vendor hid: in the browser the session
 * cookie goes along by itself; server components pass the request's `cookie`.
 */
export async function fetchTorList(cookie?: string): Promise<TOR[]> {
  try {
    const res = await fetch(`${resolveApiBase()}/api/tors?pageSize=100`, {
      credentials: "include",
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: ApiTor[] };
    return body.data.map(mapApiTor);
  } catch {
    return [];
  }
}

export interface TorSearchResult {
  tors: TOR[];
  page: number;
  totalCount: number;
  /** Sum of budgets over every matching TOR, not just this page. */
  totalBudget: number;
  hasNextPage: boolean;
}

/**
 * GET /api/tors?<query> — one combined, server-side filtered search (FR-7).
 * Throws on network/HTTP failure so the caller can tell "no matches" from "broken".
 */
export async function searchTors(query: URLSearchParams, signal?: AbortSignal): Promise<TorSearchResult> {
  // credentials: a signed-in vendor's session cookie lets the API leave out the TORs they hid.
  const res = await fetch(`${resolveApiBase()}/api/tors?${query.toString()}`, { signal, credentials: "include" });
  if (!res.ok) throw new Error(`TOR search failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    data: ApiTor[];
    page: number;
    totalCount: number;
    totalBudget: number;
    hasNextPage: boolean;
  };
  return {
    tors: body.data.map(mapApiTor),
    page: body.page,
    totalCount: body.totalCount,
    totalBudget: body.totalBudget,
    hasNextPage: body.hasNextPage,
  };
}

/** Whole days until `iso` on the real clock (negative = passed). */
export function daysLeft(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

/**
 * Count of public TORs per API status (draft / open / closing_soon / closed / awarded / cancelled), from the
 * same effective-status filter the search page uses. One cheap request each.
 */
export async function fetchStatusCounts(statuses: readonly string[]): Promise<Record<string, number>> {
  const counts = await Promise.all(
    statuses.map(async (s) => {
      const { totalCount } = await searchTors(new URLSearchParams({ status: s, pageSize: "1" }));
      return [s, totalCount] as const;
    })
  );
  return Object.fromEntries(counts);
}

export interface OpenTorStats {
  /** Public TORs still taking bids (open + closing_soon), across the whole collection. */
  count: number;
  budget: number;
}

/** Collection-wide count and budget of biddable TORs; zeros if the backend is unreachable. */
export async function fetchOpenTorStats(): Promise<OpenTorStats> {
  try {
    const query = new URLSearchParams([["status", "open"], ["status", "closing_soon"], ["pageSize", "1"]]);
    const { totalCount, totalBudget } = await searchTors(query);
    return { count: totalCount, budget: totalBudget };
  } catch {
    return { count: 0, budget: 0 };
  }
}

export interface AgencyOptions {
  agencies: string[];
  /** Every public TOR, regardless of filters. */
  totalCount: number;
}

/** GET /api/tors/agencies — agency filter options across the whole collection (FR-5). */
export async function fetchAgencies(): Promise<AgencyOptions> {
  try {
    const res = await fetch(`${resolveApiBase()}/api/tors/agencies`);
    if (!res.ok) return { agencies: [], totalCount: 0 };
    const body = (await res.json()) as { data: string[]; totalCount: number };
    return { agencies: body.data, totalCount: body.totalCount };
  } catch {
    return { agencies: [], totalCount: 0 };
  }
}

export interface TechOption {
  name: string;
  count: number;
}

/** GET /api/tors/technologies — tech-stack suggestions, most used first (FR-6). */
export async function fetchTechnologies(): Promise<TechOption[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tors/technologies`);
    if (!res.ok) return [];
    return ((await res.json()) as { data: TechOption[] }).data;
  } catch {
    return [];
  }
}

/** GET /api/tors/:id — fetches one TOR, or null if missing/not enriched. */
export async function fetchTorById(id: string): Promise<TOR | null> {
  try {
    const res = await fetch(`${resolveApiBase()}/api/tors/${id}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { tor: ApiTor };
    return mapApiTor(body.tor);
  } catch {
    return null;
  }
}
