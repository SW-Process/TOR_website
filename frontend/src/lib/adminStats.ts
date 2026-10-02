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

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: "กำลังทำงาน",
  success: "สำเร็จ",
  partial: "สำเร็จบางส่วน",
  failed: "ล้มเหลว",
};

export function formatThaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}
