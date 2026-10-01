import { API_BASE } from "@/lib/api";
import { daysUntil, type AISummary, type Category, type FairnessField, type FairnessFlag, type TOR, type TORStatus } from "@/lib/mockData";

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

const CATEGORY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([slug, label]) => [label, slug])
);

/** Thai display category → backend taxonomy slug (for `/api/tors?category=`). */
export function categorySlug(category: Category): string {
  return CATEGORY_SLUG[category] ?? "other";
}

function mapCategory(raw?: string): Category {
  if (!raw) return "อื่นๆ";
  return CATEGORY_MAP[raw] ?? "อื่นๆ";
}

const STATUS_MAP: Record<string, TORStatus> = {
  open: "เปิดรับ",
  closing_soon: "ใกล้ปิดรับ",
  closed: "ปิดรับแล้ว",
};

// The backend's denormalized `status` defaults to "open" and is never
// recomputed, so a TOR whose deadline has already passed would still read
// "เปิดรับ". Trust a known deadline over the stored status.
function mapStatus(raw: string | undefined, deadline: string): TORStatus {
  if (!isUnknownDeadline(deadline) && daysUntil(deadline) < 0) return "ปิดรับแล้ว";
  return (raw && STATUS_MAP[raw]) || "เปิดรับ";
}

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
    status: mapStatus(raw.status, deadline),
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

/** GET /api/tors — fetches the (currently small) enriched TOR set and maps it. */
export async function fetchTorList(): Promise<TOR[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tors?pageSize=100`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data: ApiTor[] };
    return body.data.map(mapApiTor);
  } catch {
    return [];
  }
}

export interface TorSearchResult {
  tors: TOR[];
  totalCount: number;
}

/**
 * GET /api/tors?<query> — one combined, server-side filtered search (FR-7).
 * Throws on network/HTTP failure so the caller can tell "no matches" from "broken".
 */
export async function searchTors(query: URLSearchParams, signal?: AbortSignal): Promise<TorSearchResult> {
  const res = await fetch(`${API_BASE}/api/tors?${query.toString()}`, { signal });
  if (!res.ok) throw new Error(`TOR search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data: ApiTor[]; totalCount: number };
  return { tors: body.data.map(mapApiTor), totalCount: body.totalCount };
}

/** GET /api/tors/:id — fetches one TOR, or null if missing/not enriched. */
export async function fetchTorById(id: string): Promise<TOR | null> {
  try {
    const res = await fetch(`${API_BASE}/api/tors/${id}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { tor: ApiTor };
    return mapApiTor(body.tor);
  } catch {
    return null;
  }
}
