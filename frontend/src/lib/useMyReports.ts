"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

/** One of the signed-in user's own error reports (GET /api/auth/reports). */
export interface MyReport {
  id: string;
  description: string;
  status: "open" | "resolved";
  createdAt: string;
  /** Set once an admin resolved it; `note` is their reply, if they wrote one. */
  resolution: { note: string | null; resolvedAt: string | null } | null;
  /** null when the TOR is no longer public. */
  tor: { id: string; title: string; agency: string | null; projectCode: string | null; category: string | null } | null;
}

/** The caller's reports, loaded once per mount — the list only changes when an admin acts. */
export function useMyReports() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; reports: MyReport[]; error: string | null }>({
    userId: null,
    reports: [],
    error: null,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiFetch("/api/auth/reports")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as { data: MyReport[] }).data;
      })
      .then(
        (reports) => !cancelled && setState({ userId, reports, error: null }),
        () => !cancelled && setState({ userId, reports: [], error: "โหลดรายงานไม่สำเร็จ กรุณาลองใหม่" })
      );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Until this user's list arrives, report not-ready rather than another user's rows.
  const ready = userId !== null && state.userId === userId;
  return { reports: ready ? state.reports : [], ready, error: ready ? state.error : null };
}
