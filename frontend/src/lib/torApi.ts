import { API_BASE } from "@/lib/api";
import type { AISummary, Category, TOR, TORStatus } from "@/lib/mockData";

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

function mapCategory(raw?: string): Category {
  if (!raw) return "อื่นๆ";
  return CATEGORY_MAP[raw] ?? "อื่นๆ";
}

const STATUS_MAP: Record<string, TORStatus> = {
  open: "เปิดรับ",
  closing_soon: "ใกล้ปิดรับ",
  closed: "ปิดรับแล้ว",
};

function mapStatus(raw?: string): TORStatus {
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
}

function mapSummary(raw: ApiAiSummary | null | undefined, fallbackDate: string): AISummary {
  return {
    keyPoints: raw?.keyPoints ?? [],
    qualifications: raw?.qualifications ?? [],
    evaluationCriteria: (raw?.evaluationCriteria ?? []).map((c) => ({
      label: c.label,
      weight: c.weight ?? 0,
    })),
    generatedAt: raw?.generatedAt ?? fallbackDate,
    confidence: (raw?.confidence && CONFIDENCE_MAP[raw.confidence]) || "ปานกลาง",
  };
}

/** Map a raw `/api/tors` (list or detail) row onto the frontend's TOR shape. */
export function mapApiTor(raw: ApiTor): TOR {
  const announceDate = raw.announcementDate ?? new Date().toISOString();
  return {
    id: raw._id,
    title: raw.title,
    agency: raw.agency ?? "ไม่ระบุหน่วยงาน",
    department: raw.department ?? "",
    category: mapCategory(raw.category),
    budget: raw.budget ?? raw.referencePrice ?? 0,
    announceDate,
    deadline: raw.submissionDeadline ?? UNKNOWN_DEADLINE,
    status: mapStatus(raw.status),
    projectCode: raw.projectCode ?? raw._id,
    location: raw.location ?? raw.agency ?? "",
    views: raw.viewCount ?? 0,
    documentUrl: raw.sourceDocumentUrl
      ? `${API_BASE}${raw.sourceDocumentUrl}`
      : raw.sourceListingUrl ?? "#",
    description: raw.aiSummary?.summary ?? "",
    summary: mapSummary(raw.aiSummary, announceDate),
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
