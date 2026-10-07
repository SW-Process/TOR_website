"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tor-insight:day-notes";

type DayNoteMap = Record<string, string>;

const EMPTY: DayNoteMap = {};
const listeners = new Set<() => void>();
// Parsed copy of localStorage, so every read returns the same object until a write.
let cache: DayNoteMap | null = null;

const KEYS_FLAG = "tor-insight:day-notes-keys";

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

export function readStorage(): DayNoteMap {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    let notes: DayNoteMap = raw ? (JSON.parse(raw) as DayNoteMap) : {};
    try {
      if (window.localStorage.getItem(KEYS_FLAG) !== "local") {
        if (notes && typeof notes === "object") {
          notes = migrateDayNoteKeys(notes);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        }
        window.localStorage.setItem(KEYS_FLAG, "local");
      }
    } catch {
      // storage unavailable or full: leave the notes as read
    }
    return notes;
  } catch {
    return {};
  }
}

function getSnapshot(): DayNoteMap {
  if (cache === null) cache = readStorage();
  return cache;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the notes: drop the cache and re-read.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeNothing() {
  return () => {};
}

export function useDayNotes() {
  const notes = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  // False on the server and during hydration, true once mounted on the client.
  const ready = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );

  const setDayNote = useCallback((dateKey: string, note: string) => {
    const next = { ...getSnapshot() };
    if (note.trim()) {
      next[dateKey] = note;
    } else {
      delete next[dateKey];
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    cache = next;
    emit();
  }, []);

  const dayNoteOf = useCallback((dateKey: string) => notes[dateKey] ?? "", [notes]);

  return { notes, ready, setDayNote, dayNoteOf };
}
