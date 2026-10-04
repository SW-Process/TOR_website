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
/**
 * TORs hidden since this page loaded. Their cards show the undo notice; a TOR
 * hidden on an earlier visit simply isn't rendered (the API already drops it
 * from most lists), so a refresh makes hidden TORs disappear.
 */
const hiddenThisVisit = new Set<string>();
/**
 * The state each TOR is heading to while its write is in flight. A list reload
 * that lands mid-write would otherwise flip a just-hidden card back on screen.
 */
const pending = new Map<string, boolean>();
/** Per-TOR write queue, so a quick hide→unhide reaches the server in that order. */
const writes = new Map<string, Promise<void>>();
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

/** Server rows with the in-flight writes laid over them. */
function withPending(items: readonly HiddenTor[]): Pick<State, "items" | "ids"> {
  const ids = new Set(items.map((i) => i.tor.id));
  for (const [id, hidden] of pending) {
    if (hidden) ids.add(id);
    else ids.delete(id);
  }
  return { ids, items: items.filter((i) => ids.has(i.tor.id)) };
}

async function reload(userId: string): Promise<void> {
  try {
    const res = await apiFetch("/api/vendor/hidden-tors");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = ((await res.json()) as { data: ApiHiddenRow[] }).data;
    if (state.userId !== userId) return;
    setState({ ready: true, ...withPending(rows.map((r) => ({ tor: mapApiTor(r.tor), hiddenAt: r.hiddenAt }))) });
  } catch {
    if (state.userId !== userId) return;
    setState({ ready: true, error: "โหลดรายการ TOR ที่ซ่อนไม่สำเร็จ" });
  }
}

function ensureLoaded(userId: string | null) {
  if (state.userId === userId && (state.ready || inflight)) return;
  // A different user (or logout): nothing from the previous session carries over.
  hiddenThisVisit.clear();
  pending.clear();
  setState({ ...EMPTY, userId, ready: userId === null });
  if (!userId) return;
  inflight = reload(userId).finally(() => {
    inflight = null;
  });
}

function setHidden(torId: string, hidden: boolean): Promise<void> {
  const userId = state.userId;
  if (!userId || state.ids.has(torId) === hidden) return Promise.resolve();

  if (hidden) hiddenThisVisit.add(torId);
  pending.set(torId, hidden);
  setState({ ...withPending(state.items), error: null });

  const send = async () => {
    try {
      const res = await apiFetch(`/api/vendor/hidden-tors/${torId}`, { method: hidden ? "PUT" : "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      if (pending.get(torId) === hidden) pending.delete(torId);
      if (state.userId === userId) setState({ error: hidden ? "ซ่อน TOR ไม่สำเร็จ" : "เลิกซ่อน TOR ไม่สำเร็จ" });
      await reload(userId); // roll back to the server's truth
      return;
    }
    // Settle only if no newer toggle of this TOR is queued behind this one.
    if (pending.get(torId) === hidden) pending.delete(torId);
    if (hidden) await reload(userId); // pick up the TOR row for the settings list
  };

  const next = (writes.get(torId) ?? Promise.resolve()).then(send);
  writes.set(torId, next);
  void next.finally(() => {
    if (writes.get(torId) === next) writes.delete(torId);
  });
  return next;
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
  const wasHiddenThisVisit = useCallback((id: string) => hiddenThisVisit.has(id), []);

  return {
    ready,
    canHide: userId !== null,
    items: s.items,
    error: s.error,
    isHidden,
    wasHiddenThisVisit,
    hide: (id: string) => setHidden(id, true),
    unhide: (id: string) => setHidden(id, false),
  };
}
