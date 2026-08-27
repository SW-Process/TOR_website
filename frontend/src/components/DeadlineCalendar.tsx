"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, X } from "lucide-react";
import { daysUntil, formatThaiDate, TODAY_ISO, type TOR } from "@/lib/mockData";
import { useDayNotes } from "@/lib/useDayNotes";

const weekdayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const monthLabels = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const CELL_HEIGHT = 96; // px — fixed for every day cell, every month, no exceptions

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthIndex(d: Date) {
  return d.getFullYear() * 12 + d.getMonth();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function DayNoteModal({
  date,
  initialValue,
  onSave,
  onClose,
}: {
  date: Date;
  initialValue: string;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm p-5 flex flex-col gap-3 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold leading-snug text-[var(--color-text)]">
            โน้ตวันที่ {formatThaiDate(dateKey(date))}
          </h3>
          <button
            aria-label="ปิด"
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            <X size={14} />
          </button>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="จะทำอะไรในวันนี้..."
          rows={4}
          className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-success)]/30"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-lg bg-[var(--color-success)] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
          >
            บันทึกโน้ต
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarTable({
  saved,
  dayNoteOf,
  onOpenDayNote,
}: {
  saved: TOR[];
  dayNoteOf: (dateKey: string) => string;
  onOpenDayNote: (date: Date) => void;
}) {
  const today = new Date(TODAY_ISO);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const byDate = useMemo(() => {
    const map = new Map<string, TOR[]>();
    for (const tor of saved) {
      const key = tor.deadline.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), tor]);
    }
    return map;
  }, [saved]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const hasDeadlineThisMonth = saved.some((t) => monthIndex(new Date(t.deadline)) === monthIndex(cursor));

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const flatCells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // Every month always renders exactly 6 weeks (42 cells) — a table with
  // table-layout: fixed and an explicit per-cell height then makes every
  // month's grid pixel-identical, regardless of how many real days or
  // saved TOR items it contains.
  while (flatCells.length < 42) flatCells.push(null);
  const weeks = chunk(flatCells, 7);

  return (
    <div className="card w-full overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)]">
          {monthLabels[month]} {year + 543}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            aria-label="เดือนก่อนหน้า"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="เดือนถัดไป"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {!hasDeadlineThisMonth && (
        <div className="px-5 py-2.5 text-center text-xs text-[var(--color-text-faint)] sm:px-6">
          ไม่มี TOR ปิดรับในเดือนนี้
        </div>
      )}

      <p className="px-5 pb-2 text-[11px] text-[var(--color-text-faint)] sm:px-6">
        คลิกที่วันเพื่อเพิ่มโน้ตของคุณเอง
      </p>

      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr className="border-y border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            {weekdayLabels.map((w, i) => (
              <th
                key={w}
                className={`w-[14.2857%] py-2 text-center text-[11px] font-semibold ${
                  i === 0 || i === 6 ? "text-[var(--color-rose-dark)]" : "text-[var(--color-text-faint)]"
                }`}
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                const isWeekend = di === 0 || di === 6;
                const items = date ? byDate.get(dateKey(date)) ?? [] : [];
                const isToday = date ? dateKey(date) === TODAY_ISO : false;
                const note = date ? dayNoteOf(dateKey(date)) : "";
                return (
                  <td
                    key={di}
                    className={`border border-[var(--color-border)] p-0 align-top ${
                      isWeekend ? "bg-[var(--color-surface-alt)]/50" : ""
                    }`}
                    style={{ height: CELL_HEIGHT }}
                  >
                    {date && (
                      <div
                        onClick={() => onOpenDayNote(date)}
                        className="flex cursor-pointer flex-col gap-1 overflow-hidden p-1.5 transition-colors hover:bg-[var(--color-blush-soft)]/50"
                        style={{ height: CELL_HEIGHT }}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            isToday ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-text-faint)]"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
                          {note && (
                            <button
                              type="button"
                              title={note}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDayNote(date);
                              }}
                              className="truncate rounded-md bg-[var(--color-success-bg)] px-1.5 py-0.5 text-left text-[10px] font-medium text-[var(--color-success)] transition-colors hover:opacity-80"
                            >
                              {note}
                            </button>
                          )}
                          {items.slice(0, note ? 1 : 2).map((tor) => (
                            <Link
                              key={tor.id}
                              href={`/tor/${tor.id}`}
                              title={tor.title}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate rounded-md bg-[var(--color-rose-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-rose-dark)] transition-colors hover:bg-[var(--color-blush)]"
                            >
                              {tor.title}
                            </Link>
                          ))}
                          {items.length > (note ? 1 : 2) && (
                            <span className="px-1.5 text-[10px] text-[var(--color-text-faint)]">
                              +{items.length - (note ? 1 : 2)} รายการ
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DeadlineCalendar({ saved }: { saved: TOR[] }) {
  const { dayNoteOf, setDayNote, ready } = useDayNotes();
  const [activeDay, setActiveDay] = useState<Date | null>(null);

  const upcoming = saved
    .filter((t) => {
      const remaining = daysUntil(t.deadline);
      return remaining >= 0 && remaining <= 3;
    })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));

  return (
    <div className="flex flex-col gap-5">
      {upcoming.length > 0 && (
        <div className="card p-5 border-none bg-[var(--color-warning-bg)] flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-[var(--color-warning)]">
            <BellRing size={16} />
            <span className="text-sm font-bold">ใกล้ปิดรับใน 3 วันนี้</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {upcoming.map((tor) => {
              const remaining = daysUntil(tor.deadline);
              return (
                <Link
                  key={tor.id}
                  href={`/tor/${tor.id}`}
                  className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-text)] transition-colors"
                >
                  <span className="font-semibold">
                    {remaining === 0 ? "ปิดรับวันนี้" : `เหลือ ${remaining} วัน`}
                  </span>{" "}
                  — {tor.title}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <CalendarTable saved={saved} dayNoteOf={dayNoteOf} onOpenDayNote={setActiveDay} />

      {ready && activeDay && (
        <DayNoteModal
          date={activeDay}
          initialValue={dayNoteOf(dateKey(activeDay))}
          onSave={(note) => setDayNote(dateKey(activeDay), note)}
          onClose={() => setActiveDay(null)}
        />
      )}
    </div>
  );
}
