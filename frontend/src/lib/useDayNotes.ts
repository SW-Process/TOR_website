"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tor-insight:day-notes";

type DayNoteMap = Record<string, string>;

function readStorage(): DayNoteMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DayNoteMap) : {};
  } catch {
    return {};
  }
}

export function useDayNotes() {
  const [notes, setNotes] = useState<DayNoteMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setNotes(readStorage());
    setReady(true);
  }, []);

  const setDayNote = useCallback((dateKey: string, note: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (note.trim()) {
        next[dateKey] = note;
      } else {
        delete next[dateKey];
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const dayNoteOf = useCallback((dateKey: string) => notes[dateKey] ?? "", [notes]);

  return { notes, ready, setDayNote, dayNoteOf };
}
