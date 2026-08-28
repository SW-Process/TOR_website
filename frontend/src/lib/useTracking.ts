"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tor-insight:tracking";

export type TrackingStatus = "สนใจ" | "กำลังเตรียมเอกสาร" | "ยื่นแล้ว" | "พลาด";

export const trackingStatuses: TrackingStatus[] = [
  "สนใจ",
  "กำลังเตรียมเอกสาร",
  "ยื่นแล้ว",
  "พลาด",
];

type StatusMap = Record<string, TrackingStatus>;

function readStorage(): StatusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StatusMap) : {};
  } catch {
    return {};
  }
}

export function useTracking() {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStatuses(readStorage());
    setReady(true);
  }, []);

  const setStatus = useCallback((id: string, status: TrackingStatus) => {
    setStatuses((prev) => {
      const next = { ...prev, [id]: status };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearStatus = useCallback((id: string) => {
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const statusOf = useCallback(
    (id: string) => statuses[id] ?? "สนใจ",
    [statuses]
  );

  return { statuses, ready, setStatus, clearStatus, statusOf };
}
