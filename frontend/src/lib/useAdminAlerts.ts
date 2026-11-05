"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { NOTIFICATION_POLL_MS } from "@/lib/useNotifications";

/** Kept as a string so a type the backend adds later still shows (with a generic label). */
export type AdminAlertType = "pipeline_run_failed" | (string & {});

export interface AdminAlert {
  id: string;
  type: AdminAlertType;
  message: string;
  ingestionRunId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

interface State {
  items: AdminAlert[];
  unreadCount: number;
  status: "loading" | "ready" | "error";
}

/**
 * The signed-in admin's own pipeline alerts (FR-39), from GET /api/admin/notifications: the newest
 * 50 and the unread count. Polled on the same cadence as the vendor bell; requests from a hidden tab
 * are skipped. Pass `enabled: false` for anyone who isn't an admin.
 */
export function useAdminAlerts(enabled: boolean) {
  const [state, setState] = useState<State>({ items: [], unreadCount: 0, status: "loading" });
  // Read by markRead, which must know synchronously whether an item is still unread.
  const itemsRef = useRef(state.items);
  useEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/notifications");
      if (!res.ok) throw new Error("failed to load alerts");
      const body = (await res.json()) as { data: AdminAlert[]; unreadCount: number };
      setState({ items: body.data, unreadCount: body.unreadCount, status: "ready" });
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

  /** Marks one alert read, updating the badge at once and rolling back if the server refuses. */
  const markRead = useCallback(async (id: string) => {
    if (!itemsRef.current.some((n) => n.id === id && !n.read)) return;
    setState((prev) => ({
      ...prev,
      items: prev.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
    const res = await apiFetch(`/api/admin/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }).catch(
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
    alerts: enabled ? state.items : [],
    unreadCount: enabled ? state.unreadCount : 0,
    status: enabled ? state.status : ("ready" as const),
    refresh,
    markRead,
  };
}
