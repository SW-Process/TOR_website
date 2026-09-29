"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type IngestionRunStatus = "running" | "success" | "partial" | "failed";
export type IngestionPhase = "discovery" | "enrichment";

export interface IngestionRunStats {
  torsFound: number;
  torsCreated: number;
  torsUpdated: number;
  torsFailed: number;
  torsSkipped: number;
  torsUnchanged: number;
  enrichedOk: number;
  enrichedRejected: number;
  enrichedFailed: number;
}

export interface IngestionRun {
  _id: string;
  trigger: "manual" | "scheduled";
  phase: IngestionPhase;
  status: IngestionRunStatus;
  startedAt: string;
  completedAt: string | null;
  stats: IngestionRunStats;
  outcomeSummary?: string;
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60_000;

/** Real admin controls for the ingestion/enrichment pipeline (FR-35, FR-36). */
export function useIngestionRuns() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [ingestionPending, setIngestionPending] = useState(false);
  const [enrichmentPending, setEnrichmentPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch("/api/ingestion/runs?limit=20");
    if (res.status === 401 || res.status === 403) {
      setForbidden(true);
      return [] as IngestionRun[];
    }
    if (!res.ok) throw new Error("failed to load ingestion runs");
    const { runs: list } = (await res.json()) as { runs: IngestionRun[] };
    setRuns(list);
    return list;
  }, []);

  useEffect(() => {
    apiFetch("/api/ingestion/runs?limit=20")
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error("failed to load ingestion runs");
        const { runs: list } = (await res.json()) as { runs: IngestionRun[] };
        setRuns(list);
      })
      .catch(() => setError("โหลดประวัติการรันไม่สำเร็จ"))
      .finally(() => setReady(true));
  }, []);

  const pollUntilSettled = useCallback(
    (phase: IngestionPhase, setPending: (v: boolean) => void) => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      const startedAt = Date.now();
      const check = async () => {
        try {
          const list = await refresh();
          const stillRunning = list.some((r) => r.phase === phase && r.status === "running");
          if (!stillRunning || Date.now() - startedAt > POLL_TIMEOUT_MS) {
            setPending(false);
            if (pollTimer.current) clearInterval(pollTimer.current);
          }
        } catch {
          setPending(false);
          if (pollTimer.current) clearInterval(pollTimer.current);
        }
      };
      void check();
      pollTimer.current = setInterval(check, POLL_INTERVAL_MS);
    },
    [refresh]
  );

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const triggerIngestion = useCallback(
    async (params?: { searchText?: string; maxProjects?: number; lookbackDays?: number; announceAllTypes?: boolean }) => {
      setError(null);
      setIngestionPending(true);
      try {
        const res = await apiFetch("/api/ingestion/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params ?? {}),
        });
        if (res.status === 401 || res.status === 403) {
          setForbidden(true);
          setIngestionPending(false);
          return;
        }
        if (!res.ok && res.status !== 409) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { message?: string } | null)?.message || "failed to trigger ingestion");
        }
        pollUntilSettled("discovery", setIngestionPending);
      } catch (err) {
        setError(err instanceof Error ? err.message : "สั่งรัน ingestion ไม่สำเร็จ");
        setIngestionPending(false);
      }
    },
    [pollUntilSettled]
  );

  const triggerEnrichment = useCallback(async () => {
    setError(null);
    setEnrichmentPending(true);
    try {
      const res = await apiFetch("/api/ingestion/enrichment/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setEnrichmentPending(false);
        return;
      }
      if (!res.ok && res.status !== 409) {
        throw new Error("failed to trigger enrichment");
      }
      pollUntilSettled("enrichment", setEnrichmentPending);
    } catch {
      setError("สั่งรัน enrichment ไม่สำเร็จ");
      setEnrichmentPending(false);
    }
  }, [pollUntilSettled]);

  const lastRunFor = useCallback(
    (phase: IngestionPhase) => runs.find((r) => r.phase === phase) ?? null,
    [runs]
  );

  return {
    runs,
    ready,
    forbidden,
    error,
    ingestionPending,
    enrichmentPending,
    triggerIngestion,
    triggerEnrichment,
    lastRunFor,
  };
}
