"use client";

import { API_BASE, apiFetch } from "@/lib/api";
import type { HelpAnnouncementKind, HelpCategory } from "@/lib/helpApi";

/** Admin side of the help center (backend adminHelpController). Drafts included. */

export type HelpStatus = "draft" | "published";

export interface AdminAnnouncement {
  id: string;
  slug: string | null;
  title: string;
  body: string;
  kind: HelpAnnouncementKind;
  pinned: boolean;
  status: HelpStatus;
  publishedAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}

export interface AdminFaq {
  id: string;
  slug: string | null;
  question: string;
  answer: string;
  category: string;
  featured: boolean;
  order: number;
  status: HelpStatus;
  updatedAt: string;
}

export type AnnouncementInput = Pick<AdminAnnouncement, "title" | "body" | "kind" | "pinned" | "status" | "endsAt">;
export type FaqInput = Pick<AdminFaq, "question" | "answer" | "category" | "featured" | "order" | "status">;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function send<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  let res: Response;
  try {
    res = await apiFetch(`/api/admin/help${path}`, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่" };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  const body = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) return { ok: false, error: body.message ? `บันทึกไม่สำเร็จ: ${body.message}` : `บันทึกไม่สำเร็จ (HTTP ${res.status})` };
  return { ok: true, data: body };
}

export const adminHelp = {
  listAnnouncements: () => send<{ data: AdminAnnouncement[] }>("/announcements"),
  createAnnouncement: (input: Partial<AnnouncementInput>) =>
    send<{ announcement: AdminAnnouncement }>("/announcements", { method: "POST", body: JSON.stringify(input) }),
  updateAnnouncement: (id: string, input: Partial<AnnouncementInput>) =>
    send<{ announcement: AdminAnnouncement }>(`/announcements/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteAnnouncement: (id: string) => send<void>(`/announcements/${id}`, { method: "DELETE" }),

  listFaqs: () => send<{ data: AdminFaq[] }>("/faqs"),
  createFaq: (input: Partial<FaqInput>) => send<{ faq: AdminFaq }>("/faqs", { method: "POST", body: JSON.stringify(input) }),
  updateFaq: (id: string, input: Partial<FaqInput>) =>
    send<{ faq: AdminFaq }>(`/faqs/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteFaq: (id: string) => send<void>(`/faqs/${id}`, { method: "DELETE" }),
};

/** FAQ categories with labels, from the public help API (single source: backend config). */
export async function fetchHelpCategories(): Promise<HelpCategory[]> {
  try {
    const res = await fetch(`${API_BASE}/api/help`);
    if (!res.ok) return [];
    return ((await res.json()) as { categories: HelpCategory[] }).categories;
  } catch {
    return [];
  }
}
