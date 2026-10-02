"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { apiFetch } from "@/lib/api";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Expanded row: full message, the run it belongs to, and its context fields. */
function LogDetail({ log }: { log: LogEntry }) {
  const ctx = log.context;
  // Long text fields (stack traces, raw responses) get their own block; the rest are chips.
  const fields = isRecord(ctx) ? Object.entries(ctx) : [];
  const isLong = (v: unknown) => typeof v === "string" && (v.length > 80 || v.includes("\n"));
  const short = fields.filter(([, v]) => !isLong(v) && !isRecord(v) && !Array.isArray(v));
  const shortKeys = new Set(short.map(([k]) => k));
  const long = fields.filter(([k]) => !shortKeys.has(k));

  return (
    <div className="flex flex-col gap-3 px-6 pb-5 pt-1 lg:pl-[calc(1.5rem+9rem+1rem)]">
      <div>
        <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">ข้อความเต็ม</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text)] whitespace-pre-wrap break-words">
          {log.message}
        </p>
      </div>

      {(log.ingestionRunId || short.length > 0) && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[11px] text-[var(--color-text-muted)]">
            แหล่ง: <span className="font-medium text-[var(--color-text)]">{SOURCE_LABELS[log.source]}</span>
          </span>
          {log.ingestionRunId && (
            <span className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[11px] text-[var(--color-text-muted)]">
              รอบดึงข้อมูล: <span className="font-mono text-[var(--color-text)]">{log.ingestionRunId}</span>
            </span>
          )}
          {short.map(([k, v]) => (
            <span
              key={k}
              className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[11px] text-[var(--color-text-muted)]"
            >
              {k}: <span className="font-mono text-[var(--color-text)]">{String(v)}</span>
            </span>
          ))}
        </div>
      )}

      {long.map(([k, v]) => (
        <div key={k}>
          <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">{k}</p>
          <pre className="mt-1 max-h-64 overflow-auto rounded-xl border border-[var(--color-border)] bg-white p-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-soft)] whitespace-pre-wrap break-words">
            {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
          </pre>
        </div>
      ))}

      {ctx !== undefined && !isRecord(ctx) && (
        <pre className="max-h-64 overflow-auto rounded-xl border border-[var(--color-border)] bg-white p-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-soft)] whitespace-pre-wrap break-words">
          {typeof ctx === "string" ? ctx : JSON.stringify(ctx, null, 2)}
        </pre>
      )}
    </div>
  );
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
  // Only typing is debounced; tabs, source and paging fetch immediately.
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (level !== "ทั้งหมด") params.set("severity", level);
    if (source) params.set("source", source);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());

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
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [debouncedQuery, level, source, page]);

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
          <div className="hidden lg:flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <span className="w-36 shrink-0">เวลา</span>
            <span className="w-20 shrink-0">ระดับ</span>
            <span className="w-48 shrink-0">Source</span>
            <span className="min-w-0 flex-1">ข้อความ</span>
            <span className="w-4 shrink-0" />
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
            <div className={`divide-y divide-[var(--color-border)] transition-opacity ${loading ? "opacity-60" : ""}`}>
              {rows.map((log) => {
                const open = expanded === log._id;
                return (
                  <div key={log._id} className={open ? "bg-[var(--color-surface-alt)]/60" : ""}>
                    {/* One line per log on desktop; message wraps under the meta on small screens. */}
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : log._id)}
                      aria-expanded={open}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-3 text-left transition-colors hover:bg-[var(--color-surface-alt)]/60 lg:flex-nowrap"
                    >
                      <span className="w-36 shrink-0 font-mono text-xs text-[var(--color-text-faint)]">
                        {formatLogTime(log.timestamp)}
                      </span>
                      <span className="w-20 shrink-0">
                        <span className={`badge ${levelStyles[log.severity]}`}>{log.severity}</span>
                      </span>
                      <span
                        title={SOURCE_LABELS[log.source]}
                        className="w-48 shrink-0 truncate font-mono text-xs text-[var(--color-ink-soft)]"
                      >
                        {log.component ?? log.source}
                      </span>
                      <span className="order-last basis-full truncate text-[13px] text-[var(--color-text)] lg:order-none lg:basis-auto lg:min-w-0 lg:flex-1">
                        {log.message}
                      </span>
                      <ChevronDown
                        size={15}
                        className={`ml-auto shrink-0 text-[var(--color-text-faint)] transition-transform lg:ml-0 ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && <LogDetail log={log} />}
                  </div>
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
