"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { apiFetch } from "@/lib/api";

type LogLevel = "info" | "warning" | "error";
type LogSource = "ingestion" | "ai-pipeline" | "application";

interface LogEntry {
  _id: string;
  source: LogSource;
  component?: string;
  severity: LogLevel;
  message: string;
  context?: unknown;
  ingestionRunId: string | null;
  timestamp: string;
}

interface LogPage {
  data: LogEntry[];
  totalCount: number;
  counts: Record<LogLevel, number>;
  hasNextPage: boolean;
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const levelTabs: { label: string; value: LogLevel | "ทั้งหมด" }[] = [
  { label: "ทั้งหมด", value: "ทั้งหมด" },
  { label: "Info", value: "info" },
  { label: "Warning", value: "warning" },
  { label: "Error", value: "error" },
];

const levelStyles: Record<LogLevel, string> = {
  info: "bg-[var(--color-surface-alt)] text-[var(--color-ink-soft)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  error: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
};

const SOURCE_LABELS: Record<LogSource, string> = {
  ingestion: "ดึงข้อมูล",
  "ai-pipeline": "AI pipeline",
  application: "แอปพลิเคชัน",
};

function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Admin view of backend SystemLog rows (FR-37, FR-38), via GET /api/admin/logs. */
export default function SystemLogs() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LogLevel | "ทั้งหมด">("ทั้งหมด");
  const [source, setSource] = useState<LogSource | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (level !== "ทั้งหมด") params.set("severity", level);
    if (source) params.set("source", source);
    if (query.trim()) params.set("q", query.trim());

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      apiFetch(`/api/admin/logs?${params}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as LogPage;
          if (cancelled) return;
          setResult(body);
          setError(false);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setError(true);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, level, source, page]);

  const counts = result?.counts;
  const countFor = (v: LogLevel | "ทั้งหมด") =>
    !counts ? null : v === "ทั้งหมด" ? counts.info + counts.warning + counts.error : counts[v];
  const rows = result?.data ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)) : 1;

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Observability"
        title="System Logs"
        description="ค้นหาและกรองบันทึกการทำงานของระบบและข้อผิดพลาดที่เกิดขึ้น กดที่แถวเพื่อดูรายละเอียดเพิ่มเติม"
      />

      <div className="mt-7 px-5 sm:px-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-1 shadow-[var(--shadow-sm)] sm:w-80">
            <Search size={16} className="text-[var(--color-text-faint)] shrink-0" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="ค้นหา component หรือข้อความ"
              className="w-full py-2.5 text-sm focus:outline-none"
            />
          </div>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as LogSource | "");
              setPage(1);
            }}
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)] focus:outline-none"
          >
            <option value="">ทุกแหล่ง</option>
            {(Object.keys(SOURCE_LABELS) as LogSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {levelTabs.map((tab) => {
            const active = level === tab.value;
            const n = countFor(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setLevel(tab.value);
                  setPage(1);
                }}
                className={`btn-pill px-4 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "btn-pill-primary"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-ink)]/30"
                }`}
              >
                {tab.label}
                {n !== null && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                      active
                        ? "bg-white/20"
                        : tab.value === "error" && n > 0
                          ? "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
                          : "bg-[var(--color-surface-alt)]"
                    }`}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 px-5 sm:px-8">
        <div className="card overflow-hidden p-0">
          <div className="hidden lg:grid grid-cols-[150px_100px_200px_1fr_20px] gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <span>เวลา</span>
            <span>ระดับ</span>
            <span>Source</span>
            <span>ข้อความ</span>
            <span />
          </div>

          {loading && !result ? (
            <div className="p-10 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              กำลังโหลด log...
            </div>
          ) : error ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
              โหลด log ไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">ไม่พบ log ที่ตรงกับเงื่อนไข</div>
          ) : (
            <div className={`divide-y divide-[var(--color-border)] font-mono transition-opacity ${loading ? "opacity-60" : ""}`}>
              {rows.map((log) => {
                const open = expanded === log._id;
                const hasDetail = log.context !== undefined || log.ingestionRunId;
                return (
                  <Fragment key={log._id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : log._id)}
                      aria-expanded={open}
                      disabled={!hasDetail}
                      className={`grid w-full grid-cols-1 lg:grid-cols-[150px_100px_200px_1fr_20px] gap-1.5 lg:gap-4 px-6 py-3.5 text-left items-start lg:items-center transition-colors ${
                        hasDetail ? "cursor-pointer hover:bg-[var(--color-surface-alt)]/60" : "cursor-default"
                      } ${open ? "bg-[var(--color-surface-alt)]/60" : ""}`}
                    >
                      <span className="text-xs text-[var(--color-text-faint)]">{formatLogTime(log.timestamp)}</span>
                      <span>
                        <span className={`badge ${levelStyles[log.severity]} font-sans`}>{log.severity}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-[var(--color-ink-soft)]">{log.component ?? log.source}</span>
                        <span className="block font-sans text-[10px] text-[var(--color-text-faint)]">
                          {SOURCE_LABELS[log.source]}
                        </span>
                      </span>
                      <span
                        className={`text-xs text-[var(--color-text)] leading-relaxed font-sans break-words ${open ? "" : "line-clamp-2"}`}
                      >
                        {log.message}
                      </span>
                      <span className="hidden lg:flex justify-end text-[var(--color-text-faint)]">
                        {hasDetail && <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />}
                      </span>
                    </button>
                    {open && (
                      <div className="bg-[var(--color-surface-alt)]/60 px-6 pb-4">
                        {log.ingestionRunId && (
                          <p className="mb-2 font-sans text-[11px] text-[var(--color-text-muted)]">
                            รอบดึงข้อมูล: <span className="font-mono">{log.ingestionRunId}</span>
                          </p>
                        )}
                        {log.context !== undefined && (
                          <pre className="max-h-80 overflow-auto rounded-xl bg-[var(--color-ink)] p-4 text-[11px] leading-relaxed text-white/90 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        {result && totalPages > 1 && (
          <nav aria-label="เปลี่ยนหน้า" className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="btn-pill border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              ก่อนหน้า
            </button>
            <span className="text-xs text-[var(--color-text-muted)]">
              หน้า {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!result.hasNextPage}
              className="btn-pill border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-40"
            >
              ถัดไป
              <ChevronRight size={14} />
            </button>
          </nav>
        )}

        {result && (
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            แสดง {rows.length} จาก {result.totalCount} รายการ
          </p>
        )}
      </div>
    </div>
  );
}
