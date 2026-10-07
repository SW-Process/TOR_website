"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { mapApiTor, type ApiTor } from "@/lib/torApi";
import { useAuth } from "@/lib/useAuth";
import type { TOR } from "@/lib/mockData";

/**
 * Vendor bookmarks + application status, persisted via /api/vendor/bookmarks
 * (FR-27, FR-31, FR-32). One module-level store shared by every component, so
 * a page full of BookmarkButtons makes a single list request, and a status
 * change on the Kanban board shows up everywhere at once.
 */

export type ApplicationStatus = "interested" | "preparing" | "submitted" | "missed";

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "interested",
  "preparing",
  "submitted",
  "missed",
];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  interested: "สนใจ",
  preparing: "กำลังเตรียมเอกสาร",
  submitted: "ยื่นแล้ว",
  missed: "พลาด",
};

export interface SavedBookmark {
  tor: TOR;
  applicationStatus: ApplicationStatus;
  bookmarkedAt: string;
}

interface ApiBookmarkRow {
  torId: string;
  applicationStatus: ApplicationStatus;
  bookmarkedAt: string;
  tor: ApiTor;
}

interface State {
  /** Whose bookmarks these are; a different user (or logout) resets the store. */
  userId: string | null;
  ready: boolean;
  /** Includes optimistic adds whose TOR row hasn't been fetched yet. */
  ids: ReadonlySet<string>;
  items: readonly SavedBookmark[];
  /** Last failed write, shown to the user; cleared by the next successful one. */
  error: string | null;
}

const EMPTY: State = { userId: null, ready: false, ids: new Set(), items: [], error: null };

let state: State = EMPTY;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

async function reload(userId: string): Promise<void> {
  try {
    const res = await apiFetch("/api/vendor/bookmarks");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = ((await res.json()) as { data: ApiBookmarkRow[] }).data;
    if (state.userId !== userId) return; // user changed mid-request
    const items = rows.map((r) => ({
      tor: mapApiTor(r.tor),
      applicationStatus: r.applicationStatus,
      bookmarkedAt: r.bookmarkedAt,
    }));
    setState({ ready: true, items, ids: new Set(items.map((i) => i.tor.id)) });
  } catch {
    if (state.userId !== userId) return;
    setState({ ready: true, error: "โหลดรายการที่บันทึกไม่สำเร็จ" });
  }
}

function ensureLoaded(userId: string | null) {
  if (state.userId === userId && (state.ready || inflight)) return;
  setState({ ...EMPTY, userId, ready: userId === null });
  if (!userId) return;
  inflight = reload(userId).finally(() => {
    inflight = null;
  });
}

async function write(path: string, init: RequestInit, failure: string): Promise<boolean> {
  try {
    const res = await apiFetch(path, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (state.error) setState({ error: null });
    return true;
  } catch {
    setState({ error: failure });
    return false;
  }
}

async function toggleBookmark(torId: string) {
  const userId = state.userId;
  if (!userId) return;
  const wasSaved = state.ids.has(torId);
  const ids = new Set(state.ids);

  if (wasSaved) {
    ids.delete(torId);
    setState({ ids, items: state.items.filter((i) => i.tor.id !== torId) });
    const ok = await write(`/api/vendor/bookmarks/${torId}`, { method: "DELETE" }, "ยกเลิกบันทึกไม่สำเร็จ");
    if (!ok) await reload(userId);
    return;
  }

  ids.add(torId);
  setState({ ids });
  await write(`/api/vendor/bookmarks/${torId}`, { method: "PUT" }, "บันทึก TOR ไม่สำเร็จ");
  // Refetch either way: on success to get the TOR row, on failure to roll back.
  await reload(userId);
}

async function setApplicationStatus(torId: string, applicationStatus: ApplicationStatus) {
  const userId = state.userId;
  const current = state.items.find((i) => i.tor.id === torId);
  if (!userId || !current || current.applicationStatus === applicationStatus) return;

  setState({
    items: state.items.map((i) => (i.tor.id === torId ? { ...i, applicationStatus } : i)),
  });
  const ok = await write(
    `/api/vendor/bookmarks/${torId}`,
    { method: "PATCH", body: JSON.stringify({ applicationStatus }) },
    "อัปเดตสถานะไม่สำเร็จ"
  );
  if (!ok) await reload(userId);
}

export function useBookmarks() {
  const { user, ready: authReady } = useAuth();
  // Bookmarks are a vendor/admin feature; the API 403s for other roles.
  const userId = authReady && (user?.role === "vendor" || user?.role === "admin") ? user.id : null;

  useEffect(() => {
    if (authReady) ensureLoaded(userId);
  }, [authReady, userId]);

  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Until the store has caught up with the current user, report not-ready.
  const ready = authReady && s.userId === userId && s.ready;

  const isBookmarked = useCallback((id: string) => s.ids.has(id), [s.ids]);

  return {
    ready,
    canBookmark: userId !== null,
    ids: [...s.ids],
    items: s.items,
    error: s.error,
    isBookmarked,
    toggle: toggleBookmark,
    setStatus: setApplicationStatus,
  };
}
