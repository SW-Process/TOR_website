"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

/** One signed-in device (GET /api/auth/sessions). */
export interface AccountSession {
  id: string;
  current: boolean;
  /** Used within the last day. */
  active: boolean;
  device: { type: "desktop" | "mobile" | "tablet"; browser: string | null; os: string | null };
  ip: string | null;
  method: "password" | "google";
  createdAt: string;
  lastSeenAt: string;
}

/** The caller's signed-in devices, with revoke and reload. */
export function useSessions() {
  const { user, refresh } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; sessions: AccountSession[]; error: string | null }>({
    userId: null,
    sessions: [],
    error: null,
  });

  // Bumped to reload the list (e.g. after "log out all other devices").
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiFetch("/api/auth/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as { data: AccountSession[] }).data;
      })
      .then(
        (sessions) => !cancelled && setState({ userId, sessions, error: null }),
        () => !cancelled && setState({ userId, sessions: [], error: "โหลดรายการอุปกรณ์ไม่สำเร็จ กรุณาลองใหม่" })
      );
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  /** Sign out one device. Revoking the current one is a logout, so the session refreshes. */
  const revoke = useCallback(
    async (session: AccountSession): Promise<boolean> => {
      const res = await apiFetch(`/api/auth/sessions/${session.id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok && res?.status !== 404) return false;
      if (session.current) await refresh();
      else setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== session.id) }));
      return true;
    },
    [refresh]
  );

  const ready = userId !== null && state.userId === userId;
  return { sessions: ready ? state.sessions : [], ready, error: ready ? state.error : null, revoke, reload };
}
