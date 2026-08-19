"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const ALL_MONTHS = [
  { month: "ม.ค.", scraped: 41 },
  { month: "ก.พ.", scraped: 47 },
  { month: "มี.ค.", scraped: 52 },
  { month: "เม.ย.", scraped: 58 },
  { month: "พ.ค.", scraped: 63 },
  { month: "มิ.ย.", scraped: 69 },
  { month: "ก.ค.", scraped: 75 },
  { month: "ส.ค.", scraped: 82 },
];

const Y_MAX = 100;
const TICKS = [0, 20, 40, 60, 80, 100];

export default function TORStatsChart() {
  const [range, setRange] = useState<"5" | "8">("5");
  const [hovered, setHovered] = useState<number | null>(null);

  const data = ALL_MONTHS.slice(range === "5" ? -5 : -8);
  const total = data.reduce((sum, m) => sum + m.scraped, 0);

  return (
    <div className="card p-5 sm:p-6 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
            TOR ที่ดึงมารายเดือน
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            รวม <span className="font-semibold text-[var(--color-text)]">{total.toLocaleString()}</span> รายการในช่วงนี้
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
              {data.map((m, i) => {
                const pct = Math.max((m.scraped / Y_MAX) * 100, 2);
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
                      aria-label={`${m.month}: ${m.scraped} รายการ`}
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
            {data.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[10px] text-[var(--color-text-faint)]">
                {m.month}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
