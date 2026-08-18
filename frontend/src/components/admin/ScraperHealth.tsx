"use client";

import { useState } from "react";
import { AlertCircle, Clock, RotateCw } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import RunStatusBadge from "./RunStatusBadge";
import {
  DataSource,
  dataSources as initialDataSources,
  formatDateTime,
  formatRelativeTime,
  scraperRuns,
} from "@/lib/adminMockData";

export default function ScraperHealth() {
  const [sources, setSources] = useState<DataSource[]>(initialDataSources);
  const [runningIds, setRunningIds] = useState<string[]>([]);

  function rerun(id: string) {
    setRunningIds((ids) => [...ids, id]);
    setSources((list) =>
      list.map((s) => (s.id === id ? { ...s, status: "running" } : s))
    );
    setTimeout(() => {
      setSources((list) =>
        list.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "success",
                lastRunAt: new Date().toISOString(),
                itemsScraped: Math.floor(Math.random() * 20) + 1,
              }
            : s
        )
      );
      setRunningIds((ids) => ids.filter((i) => i !== id));
    }, 1600);
  }

  const failedRuns = scraperRuns.filter((r) => r.status === "failed");

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Data Monitoring"
        title="สถานะสแครปเปอร์"
        description="ตรวจสอบสถานะการดึงข้อมูลจากแต่ละแหล่งข้อมูล และดู error ที่เกิดขึ้นระหว่างการรัน"
      />

      <div className="mt-7 px-5 sm:px-8 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {sources.map((source) => (
          <div key={source.id} className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)] truncate">
                  {source.name}
                </p>
                <p className="text-xs text-[var(--color-text-faint)] mt-0.5 truncate">{source.url}</p>
              </div>
              <RunStatusBadge status={source.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[var(--color-text-faint)]">รันล่าสุด</p>
                <p className="mt-0.5 font-medium text-[var(--color-text)]">
                  {formatRelativeTime(source.lastRunAt)}
                </p>
              </div>
              <div>
                <p className="text-[var(--color-text-faint)]">รันครั้งถัดไป</p>
                <p className="mt-0.5 font-medium text-[var(--color-text)]">
                  {formatDateTime(source.nextRunAt)}
                </p>
              </div>
              <div>
                <p className="text-[var(--color-text-faint)]">ดึงได้ล่าสุด</p>
                <p className="mt-0.5 font-medium text-[var(--color-text)]">{source.itemsScraped} รายการ</p>
              </div>
              <div>
                <p className="text-[var(--color-text-faint)]">ระยะเวลา</p>
                <p className="mt-0.5 font-medium text-[var(--color-text)]">{source.durationSec} วิ</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => rerun(source.id)}
              disabled={runningIds.includes(source.id)}
              className="btn-pill mt-4 w-full border border-[var(--color-border)] py-2 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-ink)]/30 transition-colors disabled:opacity-60"
            >
              <RotateCw size={13} className={runningIds.includes(source.id) ? "animate-spin" : ""} />
              {runningIds.includes(source.id) ? "กำลังรัน..." : "รันใหม่ตอนนี้"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 px-5 sm:px-8">
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
            <AlertCircle size={16} className="text-[var(--color-danger)]" />
            <h2 className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
              Error Log ({failedRuns.length})
            </h2>
          </div>
          {failedRuns.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">ไม่มี error ในรอบล่าสุด</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {failedRuns.map((run) => (
                <div key={run.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{run.sourceName}</p>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                      <Clock size={12} />
                      {formatDateTime(run.startedAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--color-danger)] leading-relaxed">{run.errorMessage}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
