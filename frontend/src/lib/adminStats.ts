import { apiFetch } from "@/lib/api";

export type RunStatus = "running" | "success" | "partial" | "failed";

export interface RunSummary {
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
}

/** GET /api/admin/stats — live numbers for the admin overview. */
export interface AdminStats {
  createdToday: number;
  createdYesterday: number;
  flaggedCount: number;
  lastDiscovery: RunSummary | null;
  lastEnrichment: RunSummary | null;
  runs30d: { finished: number; succeeded: number };
  /** Oldest first; `month` is `YYYY-MM` (Bangkok time). */
  monthly: { month: string; count: number }[];
}

export async function fetchAdminStats(months: 5 | 8 = 5): Promise<AdminStats> {
  const res = await apiFetch(`/api/admin/stats?months=${months}`);
  if (!res.ok) throw new Error(`admin stats: HTTP ${res.status}`);
  return (await res.json()) as AdminStats;
}

const STATS_REFRESH_EVENT = "admin-stats-refresh";

/** Ask mounted admin status widgets (e.g. the sidebar) to refetch now instead of on their timer. */
export function requestAdminStatsRefresh(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STATS_REFRESH_EVENT));
}

/** Subscribe to {@link requestAdminStatsRefresh}; returns the unsubscribe function. */
export function onAdminStatsRefresh(listener: () => void): () => void {
  window.addEventListener(STATS_REFRESH_EVENT, listener);
  return () => window.removeEventListener(STATS_REFRESH_EVENT, listener);
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: "กำลังทำงาน",
  success: "สำเร็จ",
  partial: "สำเร็จบางส่วน",
  failed: "ล้มเหลว",
};

export function formatThaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

const relative = new Intl.RelativeTimeFormat("th", { numeric: "auto" });

/** "3 ชั่วโมงที่แล้ว"-style relative time. */
export function timeAgo(iso: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "เมื่อสักครู่";
}

const SEVERITY: Record<RunStatus, number> = { success: 0, partial: 1, running: 2, failed: 3 };

/** The more serious of the latest discovery and enrichment run statuses. */
export function overallRunStatus(stats: Pick<AdminStats, "lastDiscovery" | "lastEnrichment">): RunStatus | null {
  const statuses = [stats.lastDiscovery?.status, stats.lastEnrichment?.status].filter(
    (s): s is RunStatus => s !== undefined
  );
  if (statuses.length === 0) return null;
  return statuses.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst));
}
