"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tor-insight:day-notes";

type DayNoteMap = Record<string, string>;

const EMPTY: DayNoteMap = {};
const listeners = new Set<() => void>();
// Parsed copy of localStorage, so every read returns the same object until a write.
let cache: DayNoteMap | null = null;

function readStorage(): DayNoteMap {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DayNoteMap) : {};
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
