import { apiFetch } from "@/lib/api";

/** Longest saved-search name the backend accepts. */
export const MAX_SAVED_SEARCH_NAME = 200;

export interface SavedSearch {
  _id: string;
  name: string;
  filters: Record<string, string | string[]>;
  alertsEnabled: boolean;
  createdAt: string;
}

export type SaveSearchResult = { ok: true; savedSearch: SavedSearch } | { ok: false; message: string };

/** POST /api/vendor/profile/saved-searches (FR-28). Errors come back as a Thai message for the form. */
export async function createSavedSearch(input: {
  name: string;
  filters: Record<string, string | string[]>;
  alertsEnabled: boolean;
}): Promise<SaveSearchResult> {
  let res: Response;
  try {
    res = await apiFetch("/api/vendor/profile/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
  if (res.ok) {
    const body = (await res.json()) as { savedSearch: SavedSearch };
    return { ok: true, savedSearch: body.savedSearch };
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401) return { ok: false, message: "กรุณาเข้าสู่ระบบอีกครั้งก่อนบันทึกการค้นหา" };
  if (res.status === 403) return { ok: false, message: "บันทึกการค้นหาได้เฉพาะบัญชีผู้ประกอบการ" };
  if (body.message?.includes("saved searches")) {
    return { ok: false, message: "บันทึกการค้นหาได้สูงสุด 50 รายการ ลบรายการเก่าก่อนแล้วลองใหม่" };
  }
  return { ok: false, message: "บันทึกการค้นหาไม่สำเร็จ กรุณาตรวจสอบตัวกรองแล้วลองใหม่" };
}
