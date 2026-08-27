"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, GripVertical, Inbox } from "lucide-react";
import { daysUntil, formatThaiDate, type TOR } from "@/lib/mockData";
import { useTracking, trackingStatuses, type TrackingStatus } from "@/lib/useTracking";

const columnTone: Record<TrackingStatus, { border: string; text: string; bg: string; dot: string }> = {
  สนใจ: {
    border: "border-t-[var(--color-text-faint)]",
    text: "text-[var(--color-text-muted)]",
    bg: "bg-[var(--color-surface-alt)]",
    dot: "bg-[var(--color-text-faint)]",
  },
  กำลังเตรียมเอกสาร: {
    border: "border-t-[var(--color-warning)]",
    text: "text-[var(--color-warning)]",
    bg: "bg-[var(--color-warning-bg)]",
    dot: "bg-[var(--color-warning)]",
  },
  ยื่นแล้ว: {
    border: "border-t-[var(--color-success)]",
    text: "text-[var(--color-success)]",
    bg: "bg-[var(--color-success-bg)]",
    dot: "bg-[var(--color-success)]",
  },
  พลาด: {
    border: "border-t-[var(--color-rose-dark)]",
    text: "text-[var(--color-rose-dark)]",
    bg: "bg-[var(--color-rose-light)]",
    dot: "bg-[var(--color-rose-dark)]",
  },
};

export default function TrackingBoard({ saved }: { saved: TOR[] }) {
  const { statusOf, setStatus, ready } = useTracking();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TrackingStatus | null>(null);

  if (!ready) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {trackingStatuses.map((status) => {
        const items = saved.filter((t) => statusOf(t.id) === status);
        const tone = columnTone[status];
        const isDragOver = dragOverStatus === status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragId) setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={() => {
              if (dragId) setStatus(dragId, status);
              setDragId(null);
              setDragOverStatus(null);
            }}
            className={`flex flex-col rounded-2xl border-t-[3px] bg-[var(--color-surface-alt)] p-3 min-h-[13rem] transition-colors ${tone.border} ${
              isDragOver ? "bg-[var(--color-blush-soft)] ring-2 ring-inset ring-[var(--color-rose)]/40" : ""
            }`}
          >
            <div className="flex items-center justify-between px-1 pb-3">
              <span className={`flex items-center gap-1.5 text-[13px] font-bold ${tone.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {status}
              </span>
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${tone.bg} ${tone.text}`}
              >
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border-strong)] py-8 text-center">
                <Inbox size={18} className="text-[var(--color-text-faint)]" />
                <span className="text-[11px] text-[var(--color-text-faint)]">ยังไม่มี TOR ในสถานะนี้</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {items.map((tor) => {
                  const remaining = daysUntil(tor.deadline);
                  return (
                    <div
                      key={tor.id}
                      draggable
                      onDragStart={() => setDragId(tor.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverStatus(null);
                      }}
                      className="card group cursor-grab active:cursor-grabbing p-3.5 flex flex-col gap-2 bg-white shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/tor/${tor.id}`}
                          className="text-[13px] font-semibold leading-snug text-[var(--color-text)] line-clamp-2 hover:text-[var(--color-rose-dark)] transition-colors"
                        >
                          {tor.title}
                        </Link>
                        <GripVertical
                          size={14}
                          className="mt-0.5 shrink-0 text-[var(--color-text-faint)] opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </div>
                      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                        <Building2 size={11} />
                        {tor.agency}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          remaining <= 3 && remaining >= 0
                            ? "text-[var(--color-warning)]"
                            : "text-[var(--color-text-faint)]"
                        }`}
                      >
                        {remaining < 0 ? `ปิดรับเมื่อ ${formatThaiDate(tor.deadline)}` : `เหลือ ${remaining} วัน`}
                      </span>

                      <select
                        value={status}
                        onChange={(e) => setStatus(tor.id, e.target.value as TrackingStatus)}
                        className="mt-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-rose)]/30"
                      >
                        {trackingStatuses.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
