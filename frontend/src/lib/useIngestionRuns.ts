"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { requestAdminStatsRefresh } from "@/lib/adminStats";

export type IngestionRunStatus = "running" | "success" | "partial" | "failed";
export type IngestionPhase = "discovery" | "enrichment" | "lifecycle" | "capture";

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
  /** Enrichment runs: jobs this run set out to process (progress denominator). */
  enrichmentPlanned: number;
  /** Enrichment runs: jobs that errored transiently and were re-queued. */
  enrichmentRetried: number;
}

/** What the next enrichment run would do (GET /api/ingestion/enrichment/pending). */
export interface EnrichmentQueueInfo {
  runnable: number;
  maxCalls: number;
  willProcess: number;
}

/** What the next lifecycle refresh would do (GET /api/ingestion/lifecycle/pending). */
export interface LifecycleQueueInfo {
  candidates: number;
  maxTors: number;
  willCheck: number;
  maxDeadlineExtractions: number;
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
// Enrichment makes up to MAX_AI_CALLS_PER_RUN Gemini calls, so it needs far longer than
// discovery. The backend sweeps a run stuck "running" after 35 min, so stop a bit past that.
const POLL_TIMEOUT_MS: Record<IngestionPhase, number> = {
  discovery: 3 * 60_000,
  enrichment: 40 * 60_000,
  lifecycle: 40 * 60_000,
  capture: 3 * 60_000,
};

/** Real admin controls for the ingestion/enrichment pipeline (FR-35, FR-36). */
export function useIngestionRuns() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [ingestionPending, setIngestionPending] = useState(false);
  const [enrichmentPending, setEnrichmentPending] = useState(false);
  const [enrichmentQueue, setEnrichmentQueue] = useState<EnrichmentQueueInfo | null>(null);
  const [lifecyclePending, setLifecyclePending] = useState(false);
  const [lifecycleQueue, setLifecycleQueue] = useState<LifecycleQueueInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimers = useRef<Partial<Record<IngestionPhase, ReturnType<typeof setInterval>>>>({});

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

  const refreshEnrichmentQueue = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ingestion/enrichment/pending");
      if (!res.ok) return;
      setEnrichmentQueue((await res.json()) as EnrichmentQueueInfo);
    } catch {
      // The count is advisory; the trigger button still works without it.
    }
  }, []);

  // The "only open TORs" checkbox: the queue count must follow the same filter the run would use.
  const lifecycleOnlyOpenRef = useRef(false);
  const refreshLifecycleQueue = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/ingestion/lifecycle/pending${lifecycleOnlyOpenRef.current ? "?onlyOpen=1" : ""}`
      );
      if (!res.ok) return;
      setLifecycleQueue((await res.json()) as LifecycleQueueInfo);
    } catch {
      // The count is advisory; the trigger button still works without it.
    }
  }, []);

  const pollUntilSettled = useCallback(
    (phase: IngestionPhase, setPending: (v: boolean) => void) => {
      const stop = () => {
        const timer = pollTimers.current[phase];
        if (timer) clearInterval(timer);
        delete pollTimers.current[phase];
      };
      stop();
      const startedAt = Date.now();
      const check = async () => {
        try {
          const list = await refresh();
          const stillRunning = list.some((r) => r.phase === phase && r.status === "running");
          if (!stillRunning || Date.now() - startedAt > POLL_TIMEOUT_MS[phase]) {
            setPending(false);
            stop();
            requestAdminStatsRefresh();
            if (phase === "enrichment") void refreshEnrichmentQueue();
            if (phase === "lifecycle") void refreshLifecycleQueue();
          }
        } catch {
          setPending(false);
          stop();
        }
      };
      void check();
      pollTimers.current[phase] = setInterval(check, POLL_INTERVAL_MS);
    },
    [refresh, refreshEnrichmentQueue, refreshLifecycleQueue]
  );

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
        // A run started before this page load (or by the scheduler) — pick up its progress.
        if (list.some((r) => r.phase === "enrichment" && r.status === "running")) {
          setEnrichmentPending(true);
          pollUntilSettled("enrichment", setEnrichmentPending);
        }
        if (list.some((r) => r.phase === "discovery" && r.status === "running")) {
          setIngestionPending(true);
          pollUntilSettled("discovery", setIngestionPending);
        }
        if (list.some((r) => r.phase === "lifecycle" && r.status === "running")) {
          setLifecyclePending(true);
          pollUntilSettled("lifecycle", setLifecyclePending);
        }
      })
      .catch(() => setError("โหลดประวัติการรันไม่สำเร็จ"))
      .finally(() => setReady(true));
    apiFetch("/api/ingestion/enrichment/pending")
      .then(async (res) => {
        if (res.ok) setEnrichmentQueue((await res.json()) as EnrichmentQueueInfo);
      })
      .catch(() => undefined); // advisory count only
    apiFetch("/api/ingestion/lifecycle/pending")
      .then(async (res) => {
        if (res.ok) setLifecycleQueue((await res.json()) as LifecycleQueueInfo);
      })
      .catch(() => undefined); // advisory count only
  }, [pollUntilSettled]);

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearInterval(timer);
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
        requestAdminStatsRefresh();
        pollUntilSettled("discovery", setIngestionPending);
      } catch (err) {
        setError(err instanceof Error ? err.message : "สั่งรัน ingestion ไม่สำเร็จ");
        setIngestionPending(false);
      }
    },
    [pollUntilSettled]
  );

  const triggerEnrichment = useCallback(async (params?: { maxCalls?: number }) => {
    setError(null);
    setEnrichmentPending(true);
    try {
      const res = await apiFetch("/api/ingestion/enrichment/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setEnrichmentPending(false);
        return;
      }
      if (!res.ok && res.status !== 409) {
        throw new Error("failed to trigger enrichment");
      }
      requestAdminStatsRefresh();
      pollUntilSettled("enrichment", setEnrichmentPending);
    } catch {
      setError("สั่งรัน enrichment ไม่สำเร็จ");
      setEnrichmentPending(false);
    }
  }, [pollUntilSettled]);

  const setLifecycleOnlyOpen = useCallback(
    (onlyOpen: boolean) => {
      lifecycleOnlyOpenRef.current = onlyOpen;
      void refreshLifecycleQueue();
    },
    [refreshLifecycleQueue]
  );

  const triggerLifecycle = useCallback(async (params?: { maxTors?: number; maxDeadlineExtractions?: number; onlyOpen?: boolean }) => {
    setError(null);
    setLifecyclePending(true);
    try {
      const res = await apiFetch("/api/ingestion/lifecycle/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setLifecyclePending(false);
        return;
      }
      if (!res.ok && res.status !== 409) {
        throw new Error("failed to trigger lifecycle refresh");
      }
      requestAdminStatsRefresh();
      pollUntilSettled("lifecycle", setLifecyclePending);
    } catch {
      setError("สั่งตรวจสถานะการจัดซื้อไม่สำเร็จ");
      setLifecyclePending(false);
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
    enrichmentQueue,
    lifecyclePending,
    lifecycleQueue,
    triggerIngestion,
    triggerEnrichment,
    triggerLifecycle,
    setLifecycleOnlyOpen,
    lastRunFor,
  };
}
