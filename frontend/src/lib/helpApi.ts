import { resolveApiBase } from "@/lib/torApi";

/** Help center ("ศูนย์ช่วยเหลือ") read API — published content only (backend helpController). */

export type HelpAnnouncementKind = "news" | "update" | "maintenance";

export interface HelpCategory {
  slug: string;
  label: string;
  count: number;
}

export interface HelpAnnouncementSummary {
  id: string;
  title: string;
  kind: HelpAnnouncementKind;
  pinned: boolean;
  /** Past its end date: shown with "[สิ้นสุด]" and listed last. */
  ended: boolean;
  publishedAt: string | null;
}

export interface HelpAnnouncement extends HelpAnnouncementSummary {
  body: string;
  endsAt: string | null;
  updatedAt: string;
}

export interface HelpFaqSummary {
  id: string;
  question: string;
  category: string;
}

export interface HelpFaq extends HelpFaqSummary {
  answer: string;
  updatedAt: string;
}

export interface HelpHome {
  categories: HelpCategory[];
  announcements: HelpAnnouncementSummary[];
  announcementCount: number;
  faqs: HelpFaqSummary[];
}

export const ANNOUNCEMENT_KIND_LABELS: Record<HelpAnnouncementKind, string> = {
  news: "ข่าวสาร",
  update: "อัปเดต",
  maintenance: "ปิดปรับปรุง",
};

/** GET a help endpoint; null on 404 or any failure, so pages can show "not found" / an empty state. */
async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${resolveApiBase()}/api/help${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchHelpHome(): Promise<HelpHome | null> {
  return getJson<HelpHome>("");
}

export async function fetchAnnouncements(): Promise<HelpAnnouncementSummary[]> {
  return (await getJson<{ data: HelpAnnouncementSummary[] }>("/announcements"))?.data ?? [];
}

export async function fetchAnnouncement(id: string): Promise<HelpAnnouncement | null> {
  return (await getJson<{ announcement: HelpAnnouncement }>(`/announcements/${encodeURIComponent(id)}`))?.announcement ?? null;
}

export async function fetchFaqs(filter: { category?: string; q?: string }): Promise<HelpFaqSummary[]> {
  const params = new URLSearchParams();
  if (filter.category) params.set("category", filter.category);
  if (filter.q) params.set("q", filter.q);
  const qs = params.toString();
  return (await getJson<{ data: HelpFaqSummary[] }>(`/faqs${qs ? `?${qs}` : ""}`))?.data ?? [];
}

export async function fetchFaq(id: string): Promise<{ faq: HelpFaq; related: HelpFaqSummary[] } | null> {
  return getJson<{ faq: HelpFaq; related: HelpFaqSummary[] }>(`/faqs/${encodeURIComponent(id)}`);
}
