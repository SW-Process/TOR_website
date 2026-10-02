"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TORStatus } from "@/lib/mockData";
import { fetchStatusCounts } from "@/lib/torApi";
import { STATUS_API, STATUSES } from "@/lib/torSearch";

const STATUS_COLORS: Record<TORStatus, string> = {
  เปิดรับ: "var(--color-success)",
  ใกล้ปิดรับ: "var(--color-warning)",
  ปิดรับแล้ว: "var(--color-text-faint)",
};

function buildConicGradient(segments: { color: string; value: number }[]) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return "var(--color-surface-alt)";
  const gapDeg = 3;
  let acc = 0;
  const stops: string[] = [];
  segments.forEach((seg) => {
    if (seg.value === 0) return;
    const deg = (seg.value / total) * (360 - gapDeg * segments.length);
    stops.push(`${seg.color} ${acc}deg ${acc + deg}deg`);
    acc += deg;
    stops.push(`transparent ${acc}deg ${acc + gapDeg}deg`);
    acc += gapDeg;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

type Counts = Record<TORStatus, number>;

export default function StatusDonut() {
  // null = loading, "error" = request failed.
  const [counts, setCounts] = useState<Counts | null | "error">(null);

  useEffect(() => {
    fetchStatusCounts(STATUSES.map((s) => STATUS_API[s]))
      .then((byApi) =>
        setCounts(Object.fromEntries(STATUSES.map((s) => [s, byApi[STATUS_API[s]] ?? 0])) as Counts)
      )
      .catch(() => setCounts("error"));
  }, []);

  const rows = STATUSES.map((status) => ({
    status,
    value: counts && counts !== "error" ? counts[status] : 0,
  }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const gradient = buildConicGradient(rows.map((r) => ({ color: STATUS_COLORS[r.status], value: r.value })));
  const placeholder = counts === null ? "…" : counts === "error" ? "–" : null;

  return (
    <div className="card p-5 sm:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
          TOR ทั้งหมดตามสถานะ
        </h2>
        <Link href="/admin/records" className="text-xs font-semibold text-[var(--color-rose-dark)] hover:underline">
          ดูทั้งหมด
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center py-4">
        <div className="relative flex h-40 w-40 items-center justify-center">
          <div className="absolute inset-0 rounded-full" style={{ background: gradient }} role="img" aria-label="สัดส่วน TOR ตามสถานะ" />
          <div className="absolute inset-[16px] rounded-full bg-[var(--color-surface)]" />
          <div className="relative flex flex-col items-center">
            <span className="font-[family-name:var(--font-heading)] text-3xl font-extrabold text-[var(--color-text)]">
              {placeholder ?? total}
            </span>
            <span className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {counts === "error" ? "โหลดข้อมูลไม่สำเร็จ" : "TOR ทั้งหมด"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.status} className="flex items-center gap-2.5 border-t border-[var(--color-border)] pt-2.5 text-xs first:border-t-0 first:pt-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[r.status] }} />
            <span className="flex-1 text-[var(--color-text-muted)]">{r.status}</span>
            <span className="font-semibold text-[var(--color-text)]">{placeholder ?? r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
