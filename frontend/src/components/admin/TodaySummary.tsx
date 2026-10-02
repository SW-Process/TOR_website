"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Database, FileText } from "lucide-react";
import {
  fetchAdminStats,
  formatThaiDateTime,
  RUN_STATUS_LABELS,
  type AdminStats,
  type RunSummary,
} from "@/lib/adminStats";

function changeVsYesterday(today: number, yesterday: number): string {
  if (yesterday === 0) return today > 0 ? `เมื่อวานไม่มีรายการใหม่` : "ยังไม่มีรายการใหม่ทั้งวันนี้และเมื่อวาน";
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return `เท่ากับเมื่อวาน (${yesterday} รายการ)`;
  return `${pct > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(pct)}% จากเมื่อวาน (${yesterday} รายการ)`;
}

function runLine(label: string, run: RunSummary | null): string {
  if (!run) return `${label}: ยังไม่เคยรัน`;
  return `${label}: ${RUN_STATUS_LABELS[run.status]} · ${formatThaiDateTime(run.startedAt)}`;
}

/** Today's pipeline health, from GET /api/admin/stats. */
export default function TodaySummary() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchAdminStats()
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  const loading = !stats && !error;
  const pending = loading ? "…" : "–";

  const lastRunOk =
    stats?.lastDiscovery?.status === "success" &&
    (stats.lastEnrichment === null || stats.lastEnrichment.status === "success");
  const successRate =
    stats && stats.runs30d.finished > 0
      ? Math.round((stats.runs30d.succeeded / stats.runs30d.finished) * 100)
      : null;

  const items = [
    {
      icon: FileText,
      label: "TOR ที่ดึงมาวันนี้",
      value: stats ? `${stats.createdToday} รายการ` : pending,
      desc: stats ? changeVsYesterday(stats.createdToday, stats.createdYesterday) : "",
      good: !!stats && stats.lastDiscovery?.status !== "failed",
    },
    {
      icon: AlertTriangle,
      label: "ต้องตรวจสอบ",
      value: stats ? `${stats.flaggedCount} รายการ` : pending,
      desc: stats
        ? stats.flaggedCount > 0
          ? "สัญญาณจาก AI ที่ยังไม่ได้ตรวจ ควรตรวจสอบก่อนเผยแพร่ให้ผู้ใช้เห็น"
          : "ไม่มีรายการค้างตรวจ"
        : "",
      good: !!stats && stats.flaggedCount === 0,
    },
    {
      icon: Activity,
      label: "รอบล่าสุด",
      value: stats ? (stats.lastDiscovery ? RUN_STATUS_LABELS[stats.lastDiscovery.status] : "ยังไม่เคยรัน") : pending,
      desc: stats
        ? `${runLine("ดึงข้อมูล", stats.lastDiscovery)}\n${runLine("ประมวลผล AI", stats.lastEnrichment)}`
        : "",
      good: lastRunOk,
    },
    {
      icon: Database,
      label: "อัตราความสำเร็จ",
      value: successRate === null ? pending : `${successRate}%`,
      desc: stats
        ? stats.runs30d.finished > 0
          ? `สำเร็จ ${stats.runs30d.succeeded} จาก ${stats.runs30d.finished} รอบ ใน 30 วันที่ผ่านมา`
          : "ไม่มีรอบที่ทำงานเสร็จใน 30 วันที่ผ่านมา"
        : "",
      good: successRate !== null && successRate >= 80,
    },
  ];

  return (
    <div className="card p-5 sm:p-6 flex flex-col h-full">
      <h2 className="font-[family-name:var(--font-heading)] font-bold text-base text-[var(--color-text)]">
        สรุปวันนี้
      </h2>
      <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
        {error ? "โหลดข้อมูลไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ" : "ภาพรวมการทำงานของระบบวันนี้"}
      </p>

      <div className="mt-4 flex flex-1 flex-col">
        {items.map((s) => (
          <div
            key={s.label}
            className="group flex gap-3.5 rounded-2xl px-3 py-3.5 transition-colors hover:bg-[var(--color-rose-light)]"
          >
            <div className="relative shrink-0">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--color-ink-soft)] shadow-[var(--shadow-sm)] transition-colors group-hover:text-[var(--color-rose-dark)]">
                <s.icon size={22} />
              </span>
              {stats && (
                <span
                  className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${
                    s.good ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"
                  }`}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-bold text-[var(--color-text)]">{s.label}</span>
                <span className="text-sm font-extrabold text-[var(--color-text)]">{s.value}</span>
              </p>
              {s.desc && (
                <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                  {s.desc}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
