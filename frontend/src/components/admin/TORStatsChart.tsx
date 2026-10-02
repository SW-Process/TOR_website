"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchAdminStats } from "@/lib/adminStats";

const TICK_COUNT = 5;

/** Smallest "nice" axis max (1/2/5 × 10^n, at least 5) that fits `value`. */
function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value)!;
  return step * magnitude;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("th-TH", { month: "short" });
}

/** TORs ingested per month (by when the system first stored them), from GET /api/admin/stats. */
export default function TORStatsChart() {
  const [range, setRange] = useState<"5" | "8">("5");
  const [hovered, setHovered] = useState<number | null>(null);
  const [data, setData] = useState<{ month: string; label: string; scraped: number }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminStats(range === "8" ? 8 : 5)
      .then((s) => {
        if (cancelled) return;
        setData(s.monthly.map((m) => ({ month: m.month, label: monthLabel(m.month), scraped: m.count })));
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const rows = data ?? [];
  const total = rows.reduce((sum, m) => sum + m.scraped, 0);
  const Y_MAX = niceMax(Math.max(0, ...rows.map((m) => m.scraped)));
  const TICKS = Array.from({ length: TICK_COUNT + 1 }, (_, i) => Math.round((Y_MAX / TICK_COUNT) * i));

  return (
    <div className="card p-5 sm:p-6 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
            TOR ที่ดึงมารายเดือน
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {error ? (
              "โหลดข้อมูลไม่สำเร็จ"
            ) : data === null ? (
              "กำลังโหลด..."
            ) : (
              <>
                รวม <span className="font-semibold text-[var(--color-text)]">{total.toLocaleString()}</span>{" "}
                รายการในช่วงนี้ · นับตามวันที่ระบบดึงเข้ามา
              </>
            )}
          </p>
        </div>
        <div className="relative">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as "5" | "8")}
            className="appearance-none border border-[var(--color-border)] rounded-full py-1.5 pl-3.5 pr-8 text-xs font-medium text-[var(--color-text)] focus:outline-none cursor-pointer"
          >
            <option value="5">5 เดือนล่าสุด</option>
            <option value="8">8 เดือนล่าสุด</option>
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
        </div>
      </div>

      <div className="mt-8 flex flex-1 min-h-0 gap-3">
        <div className="flex flex-col shrink-0 text-right text-[10px] text-[var(--color-text-faint)]">
          <div className="flex flex-1 flex-col justify-between">
            {[...TICKS].reverse().map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <div className="h-6" aria-hidden />
        </div>

        <div className="flex flex-1 min-w-0 flex-col">
          <div className="relative flex-1">
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {[...TICKS].reverse().map((t) => (
                <span key={t} className="h-px w-full bg-[var(--color-border)]" />
              ))}
            </div>

            <div className="relative flex h-full items-end justify-between gap-4">
              {rows.map((m, i) => {
                const pct = m.scraped === 0 ? 0 : Math.max((m.scraped / Y_MAX) * 100, 2);
                return (
                  <div key={m.month} className="relative flex h-full flex-1 items-end justify-center">
                    {hovered === i && (
                      <div
                        className="absolute z-10 whitespace-nowrap rounded-lg bg-[var(--color-ink)] px-2.5 py-1 text-[11px] font-semibold text-white"
                        style={{ bottom: `calc(${pct}% + 10px)` }}
                      >
                        {m.scraped} รายการ
                      </div>
                    )}
                    <div
                      role="img"
                      aria-label={`${m.label}: ${m.scraped} รายการ`}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      className="w-full max-w-8 rounded-t-[3px] bg-[var(--color-rose-dark)] transition-opacity hover:opacity-75"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex h-6 items-start justify-between gap-4 pt-2">
            {rows.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[10px] text-[var(--color-text-faint)]">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
