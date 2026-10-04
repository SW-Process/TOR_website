"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { mapApiTor, type ApiTor } from "@/lib/torApi";
import { useAuth } from "@/lib/useAuth";
import type { TOR } from "@/lib/mockData";

/**
 * TORs the vendor chose to hide, persisted via /api/vendor/hidden-tors. The
 * backend already leaves them out of search and recommendations; this store lets
 * cards elsewhere (homepage, similar TORs) swap a hidden TOR for an undo
 * placeholder, and backs the "TOR ที่ซ่อนไว้" settings list. One module-level
 * store, like useBookmarks, so a page of cards makes a single list request.
 */

export interface HiddenTor {
  tor: TOR;
  hiddenAt: string;
}

interface ApiHiddenRow {
  torId: string;
  hiddenAt: string;
  tor: ApiTor;
}

interface State {
  userId: string | null;
  ready: boolean;
  /** Includes optimistic hides whose TOR row hasn't been fetched yet. */
  ids: ReadonlySet<string>;
  items: readonly HiddenTor[];
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
    const res = await apiFetch("/api/vendor/hidden-tors");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = ((await res.json()) as { data: ApiHiddenRow[] }).data;
    if (state.userId !== userId) return;
    const items = rows.map((r) => ({ tor: mapApiTor(r.tor), hiddenAt: r.hiddenAt }));
    setState({ ready: true, items, ids: new Set(items.map((i) => i.tor.id)) });
  } catch {
    if (state.userId !== userId) return;
    setState({ ready: true, error: "โหลดรายการ TOR ที่ซ่อนไม่สำเร็จ" });
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

async function setHidden(torId: string, hidden: boolean) {
  const userId = state.userId;
  if (!userId || state.ids.has(torId) === hidden) return;

  const ids = new Set(state.ids);
  if (hidden) ids.add(torId);
  else ids.delete(torId);
  setState({ ids, items: hidden ? state.items : state.items.filter((i) => i.tor.id !== torId), error: null });

  try {
    const res = await apiFetch(`/api/vendor/hidden-tors/${torId}`, { method: hidden ? "PUT" : "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (hidden) await reload(userId); // pick up the TOR row for the settings list
  } catch {
    setState({ error: hidden ? "ซ่อน TOR ไม่สำเร็จ" : "เลิกซ่อน TOR ไม่สำเร็จ" });
    await reload(userId); // roll back to the server's truth
  }
}

export function useHiddenTors() {
  const { user, ready: authReady } = useAuth();
  // Hiding is a vendor feature; the API 403s for other roles.
  const userId = authReady && user?.role === "vendor" ? user.id : null;

  useEffect(() => {
    if (authReady) ensureLoaded(userId);
  }, [authReady, userId]);

  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = authReady && s.userId === userId && s.ready;
  const isHidden = useCallback((id: string) => s.ids.has(id), [s.ids]);

  return {
    ready,
    canHide: userId !== null,
    items: s.items,
    error: s.error,
    isHidden,
    hide: (id: string) => setHidden(id, true),
    unhide: (id: string) => setHidden(id, false),
  };
}
