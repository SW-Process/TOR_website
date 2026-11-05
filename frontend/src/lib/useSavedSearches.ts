"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface SavedSearchItem {
  _id: string;
  name: string;
  /** The `/api/tors` fields this search replays; see `savedSearchToTorFilters`. */
  filters: Record<string, unknown>;
  /** In-app notifications and the email digest for new TORs matching this search (FR-29/FR-30). */
  alertsEnabled: boolean;
  createdAt: string;
}

const LOAD_ERROR = "โหลดการค้นหาที่บันทึกไว้ไม่สำเร็จ กรุณาลองใหม่";

/** Newest first: the API returns them in the order they were saved. */
async function fetchSavedSearches(): Promise<SavedSearchItem[]> {
  const res = await apiFetch("/api/vendor/profile/saved-searches");
  if (!res.ok) throw new Error("failed to load saved searches");
  const { savedSearches } = (await res.json()) as { savedSearches: SavedSearchItem[] };
  return [...savedSearches].reverse();
}

/**
 * The signed-in vendor's saved searches (FR-28), from /api/vendor/profile/saved-searches,
 * newest first. Toggling alerts updates the list at once and rolls back if the server
 * refuses; a failed delete reloads the list.
 */
export function useSavedSearches() {
  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchSavedSearches());
      setError(null);
    } catch {
      setError(LOAD_ERROR);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSavedSearches().then(
      (list) => {
        if (cancelled) return;
        setItems(list);
        setReady(true);
      },
      () => {
        if (cancelled) return;
        setError(LOAD_ERROR);
        setReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setAlerts = useCallback(async (id: string, alertsEnabled: boolean) => {
    setError(null);
    setItems((prev) => prev.map((s) => (s._id === id ? { ...s, alertsEnabled } : s)));
    const res = await apiFetch(`/api/vendor/profile/saved-searches/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertsEnabled }),
    }).catch(() => null);
    if (!res?.ok) {
      setItems((prev) => prev.map((s) => (s._id === id ? { ...s, alertsEnabled: !alertsEnabled } : s)));
      setError("เปลี่ยนการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่");
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      setItems((prev) => prev.filter((s) => s._id !== id));
      const res = await apiFetch(`/api/vendor/profile/saved-searches/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => null);
      // 404: already gone (deleted in another tab), which is what the vendor wanted.
      if (res?.ok || res?.status === 404) return;
      setError("ลบการค้นหาไม่สำเร็จ กรุณาลองใหม่");
      void load();
    },
    [load]
  );

  return { items, ready, error, setAlerts, remove, reload: load };
}
