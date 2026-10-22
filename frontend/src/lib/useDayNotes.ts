"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "./api";
import { useAuth } from "./useAuth";

/**
 * Calendar day notes, kept on the server (`/api/vendor/day-notes`) so nothing about the
 * account stays in the browser after logout (ASVS 14.3.1). Notes written by older versions
 * of the app live in localStorage under these keys: they are uploaded once, then removed.
 */
const LEGACY_STORAGE_KEY = "tor-insight:day-notes";
const LEGACY_KEYS_FLAG = "tor-insight:day-notes-keys";

type DayNoteMap = Record<string, string>;

const EMPTY: DayNoteMap = {};

interface Store {
  /** Whose notes these are; null when signed out. */
  userId: string | null;
  notes: DayNoteMap;
  loaded: boolean;
}

let store: Store = { userId: null, notes: EMPTY, loaded: false };
let loadingFor: string | null = null;
const listeners = new Set<() => void>();

function setStore(next: Store) {
  store = next;
  for (const listener of listeners) listener();
}

function localDayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Old notes were keyed by `d.toISOString().slice(0, 10)` of a LOCAL-midnight cell date (UTC, so one
 * day early east of Greenwich). Find the cell date whose old key is `key` and return its local key.
 */
function oldKeyToLocalKey(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (const delta of [-1, 0, 1]) {
    const cell = new Date(y, mo - 1, d + delta);
    if (Number.isNaN(cell.getTime())) return key;
    if (cell.toISOString().slice(0, 10) === key) return localDayKey(cell);
  }
  return key;
}

/** One-time move of stored notes from the old UTC-shifted keys to local-day keys. */
export function migrateDayNoteKeys(notes: DayNoteMap): DayNoteMap {
  const out: DayNoteMap = {};
  for (const key of Object.keys(notes).sort()) {
    const next = oldKeyToLocalKey(key);
    const note = notes[key];
    out[next] = next in out && typeof note === "string" ? `${out[next]}
${note}` : note;
  }
  return out;
}

/** Notes an older version of the app left in localStorage (keys migrated), or {}. */
function readLegacyNotes(): DayNoteMap {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const notes = JSON.parse(raw) as DayNoteMap;
    if (!notes || typeof notes !== "object") return {};
    return window.localStorage.getItem(LEGACY_KEYS_FLAG) === "local" ? notes : migrateDayNoteKeys(notes);
  } catch {
    return {};
  }
}

function clearLegacyNotes() {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_KEYS_FLAG);
  } catch {
    // storage unavailable: nothing to clear
  }
}

function saveNote(dateKey: string, note: string): Promise<boolean> {
  return apiFetch(`/api/vendor/day-notes/${encodeURIComponent(dateKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  })
    .then((res) => res.ok)
    .catch(() => false);
}

/** Load `userId`'s notes, first moving any old browser-stored ones to the server. */
async function load(userId: string) {
  if (loadingFor === userId) return;
  loadingFor = userId;
  try {
    const res = await apiFetch("/api/vendor/day-notes");
    if (!res.ok) throw new Error(String(res.status));
    const { notes } = (await res.json()) as { notes: DayNoteMap };

    const legacy = readLegacyNotes();
    const toUpload = Object.entries(legacy).filter(([key, note]) => typeof note === "string" && note.trim() && !(key in notes));
    const results = await Promise.all(toUpload.map(([key, note]) => saveNote(key, note)));
    toUpload.forEach(([key, note], i) => {
      if (results[i]) notes[key] = note;
    });
    // Only forget the browser copy once every old note made it to the server.
    if (results.every(Boolean)) clearLegacyNotes();

    if (loadingFor === userId) setStore({ userId, notes, loaded: true });
  } catch {
    if (loadingFor === userId) setStore({ userId, notes: EMPTY, loaded: true });
  } finally {
    if (loadingFor === userId) loadingFor = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => store;

export function useDayNotes() {
  const { user, ready: authReady } = useAuth();
  const userId = user?.id ?? null;
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      // Signed out: drop the previous account's notes from memory too.
      if (store.userId !== null || store.notes !== EMPTY) setStore({ userId: null, notes: EMPTY, loaded: true });
      return;
    }
    if (store.userId !== userId || !store.loaded) void load(userId);
  }, [authReady, userId]);

  const mine = current.userId === userId;
  const notes = mine ? current.notes : EMPTY;
  const ready = authReady && mine && current.loaded;

  const setDayNote = useCallback(
    (dateKey: string, note: string) => {
      if (!userId || store.userId !== userId) return;
      const before = store.notes;
      const next = { ...before };
      if (note.trim()) next[dateKey] = note;
      else delete next[dateKey];
      setStore({ ...store, notes: next });
      void saveNote(dateKey, note.trim() ? note : "").then((ok) => {
        // The server refused it: put back what it still has.
        if (!ok && store.userId === userId) setStore({ ...store, notes: before });
      });
    },
    [userId]
  );

  const dayNoteOf = useCallback((dateKey: string) => notes[dateKey] ?? "", [notes]);

  return { notes, ready, setDayNote, dayNoteOf };
}
