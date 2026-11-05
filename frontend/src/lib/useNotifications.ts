"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type NotificationType = "profile_match" | "saved_search_match" | "deadline_reminder";

export interface VendorNotification {
  id: string;
  type: NotificationType;
  message: string | null;
  savedSearchId: string | null;
  read: boolean;
  createdAt: string;
  tor: {
    id: string;
    title: string;
    agency: string | null;
    projectCode: string | null;
    category: string | null;
    /** False once the TOR is hidden or no longer enriched: there is no page to open. */
    isPublic: boolean;
  } | null;
}

interface NotificationPage {
  data: VendorNotification[];
  page: number;
  unreadCount: number;
  hasNextPage: boolean;
}

/** How often the bell re-checks for new notifications. Requests from an idle tab are sent as background. */
export const NOTIFICATION_POLL_MS = 60_000;
const PAGE_SIZE = 10;

async function fetchPage(page: number): Promise<NotificationPage> {
  const res = await apiFetch(`/api/vendor/notifications?page=${page}&pageSize=${PAGE_SIZE}`);
  if (!res.ok) throw new Error("failed to load notifications");
  return (await res.json()) as NotificationPage;
}

interface State {
  items: VendorNotification[];
  unreadCount: number;
  /** Last page loaded into `items`. */
  page: number;
  hasNextPage: boolean;
  status: "loading" | "ready" | "error";
}

const INITIAL: State = { items: [], unreadCount: 0, page: 0, hasNextPage: false, status: "loading" };

/**
 * The signed-in vendor's in-app notifications (FR-30), from GET /api/vendor/notifications.
 * Polls the first page so the unread badge stays current; `loadMore` appends older pages.
 * Pass `enabled: false` for anyone who isn't a vendor.
 */
export function useNotifications(enabled: boolean) {
  const [state, setState] = useState<State>(INITIAL);
  // Read by markRead, which must know synchronously whether an item is still unread.
  const itemsRef = useRef(state.items);
  useEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);

  const refresh = useCallback(async () => {
    try {
      const first = await fetchPage(1);
      setState((prev) => {
        if (prev.page <= 1) {
          return { items: first.data, unreadCount: first.unreadCount, page: 1, hasNextPage: first.hasNextPage, status: "ready" };
        }
        // Older pages are already loaded: swap in the fresh first page and keep the rest.
        const fresh = new Set(first.data.map((n) => n.id));
        const older = prev.items.slice(PAGE_SIZE).filter((n) => !fresh.has(n.id));
        return { ...prev, items: [...first.data, ...older], unreadCount: first.unreadCount, status: "ready" };
      });
    } catch {
      setState((prev) => ({ ...prev, status: prev.status === "ready" ? "ready" : "error" }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled && document.visibilityState === "visible") void refresh();
    };
    tick();
    const timer = setInterval(tick, NOTIFICATION_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, refresh]);

  const loadMore = useCallback(async () => {
    const next = state.page + 1;
    try {
      const more = await fetchPage(next);
      setState((prev) => {
        const seen = new Set(prev.items.map((n) => n.id));
        return {
          ...prev,
          items: [...prev.items, ...more.data.filter((n) => !seen.has(n.id))],
          unreadCount: more.unreadCount,
          page: next,
          hasNextPage: more.hasNextPage,
        };
      });
    } catch {
      // Leave the list as it is; the button stays so the vendor can try again.
    }
  }, [state.page]);

  /** Marks one notification read, updating the badge at once and rolling back if the server refuses. */
  const markRead = useCallback(async (id: string) => {
    if (!itemsRef.current.some((n) => n.id === id && !n.read)) return;
    setState((prev) => ({
      ...prev,
      items: prev.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
    const res = await apiFetch(`/api/vendor/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }).catch(
      () => null
    );
    if (!res?.ok) {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((n) => (n.id === id ? { ...n, read: false } : n)),
        unreadCount: prev.unreadCount + 1,
      }));
    }
  }, []);

  return {
    notifications: enabled ? state.items : [],
    unreadCount: enabled ? state.unreadCount : 0,
    hasNextPage: enabled && state.hasNextPage,
    status: enabled ? state.status : ("ready" as const),
    refresh,
    loadMore,
    markRead,
  };
}

/** "เมื่อสักครู่", "5 นาทีที่แล้ว", "3 ชั่วโมงที่แล้ว", "2 วันที่แล้ว", then a Thai date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
