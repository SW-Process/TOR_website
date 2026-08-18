"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { formatDateTime, LogLevel, systemLogs } from "@/lib/adminMockData";

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

export default function SystemLogs() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LogLevel | "ทั้งหมด">("ทั้งหมด");

  const filtered = useMemo(() => {
    return systemLogs.filter((log) => {
      const matchesLevel = level === "ทั้งหมด" || log.level === level;
      const matchesQuery =
        !query.trim() ||
        log.message.toLowerCase().includes(query.toLowerCase()) ||
        log.source.toLowerCase().includes(query.toLowerCase());
      return matchesLevel && matchesQuery;
    });
  }, [query, level]);

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Observability"
        title="System Logs"
        description="ค้นหาและกรองบันทึกการทำงานของระบบและข้อผิดพลาดที่เกิดขึ้น"
      />

      <div className="mt-7 px-5 sm:px-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-1 shadow-[var(--shadow-sm)] sm:max-w-sm">
          <Search size={16} className="text-[var(--color-text-faint)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา source หรือข้อความ"
            className="w-full py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {levelTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setLevel(tab.value)}
              className={`btn-pill px-4 py-2 text-xs font-semibold transition-colors ${
                level === tab.value
                  ? "btn-pill-primary"
                  : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-ink)]/30"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 px-5 sm:px-8">
        <div className="card overflow-hidden p-0">
          <div className="hidden lg:grid grid-cols-[140px_120px_180px_1fr] gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <span>เวลา</span>
            <span>ระดับ</span>
            <span>Source</span>
            <span>ข้อความ</span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
              ไม่พบ log ที่ตรงกับเงื่อนไข
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)] font-mono">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-1 lg:grid-cols-[140px_120px_180px_1fr] gap-1.5 lg:gap-4 px-6 py-3.5 items-start lg:items-center hover:bg-[var(--color-surface-alt)]/60 transition-colors"
                >
                  <span className="text-xs text-[var(--color-text-faint)]">{formatDateTime(log.timestamp)}</span>
                  <span>
                    <span className={`badge ${levelStyles[log.level]} font-sans`}>{log.level}</span>
                  </span>
                  <span className="text-xs text-[var(--color-ink-soft)]">{log.source}</span>
                  <span className="text-xs text-[var(--color-text)] leading-relaxed font-sans">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          แสดง {filtered.length} จาก {systemLogs.length} รายการ
        </p>
      </div>
    </div>
  );
}
