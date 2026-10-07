"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatThaiDate, type TOR } from "@/lib/mockData";
import {
  bangkokToday,
  bidDaysLeft,
  bidDeadlineDay,
  bidDeadlineMonth,
  isBiddable,
} from "@/lib/torStatus";
import { useDayNotes } from "@/lib/useDayNotes";

const weekdayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const monthLabels = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const CELL_HEIGHT = 96; // px — fixed for every day cell, every month, no exceptions

const weekdayNames = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/** YYYY-MM-DD from the LOCAL calendar parts of a cell date (never toISOString, which is UTC). */
function localDayKey(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
            โน้ตวันที่ {formatThaiDate(localDayKey(date))}
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
  const todayKey = bangkokToday();
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const weekday = weekdayNames[new Date(Date.UTC(ty, tm - 1, td)).getUTCDay()];
  const [cursor, setCursor] = useState(() => new Date(ty, tm - 1, 1));

  const byDate = useMemo(() => {
    const map = new Map<string, TOR[]>();
    for (const tor of saved) {
      const key = bidDeadlineDay(tor);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), tor]);
    }
    return map;
  }, [saved]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthOnly = saved.filter((t) => {
    const m = bidDeadlineMonth(t);
    return m !== null && m.year === year && m.month === month;
  });
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const hasDeadlineThisMonth =
    monthOnly.length > 0 || [...byDate.keys()].some((k) => k.startsWith(monthPrefix));

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const flatCells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // Pad only to complete the final week — a month needs 4-6 rows depending
  // on its start day and length; forcing a 6th blank row on a short month
  // wastes a whole row of empty space.
  while (flatCells.length % 7 !== 0) flatCells.push(null);
  const weeks = chunk(flatCells, 7);

  return (
    <div className="card w-full overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)]">
          {monthLabels[month]} {year + 543}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCursor(new Date(ty, tm - 1, 1))}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
          >
            วันนี้
          </button>
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

      <p className="px-5 pb-1 text-xs font-semibold text-[var(--color-text)] sm:px-6">
        วันนี้ วัน{weekday}ที่ {td} {monthLabels[tm - 1]} {ty + 543}
      </p>
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
                const key = date ? localDayKey(date) : "";
                const items = date ? byDate.get(key) ?? [] : [];
                const isToday = date ? key === todayKey : false;
                const note = date ? dayNoteOf(key) : "";
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
                              title={`${tor.title} — ปิดรับ ${formatThaiDate(key)}`}
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

      {monthOnly.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[var(--color-border)] px-5 py-3 sm:px-6">
          <span className="text-xs font-bold text-[var(--color-text)]">ภายในเดือนนี้ (ไม่ระบุวัน)</span>
          {monthOnly.map((tor) => (
            <Link
              key={tor.id}
              href={`/tor/${tor.id}`}
              className="truncate text-xs text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-text)]"
            >
              {tor.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeadlineCalendar({ saved }: { saved: TOR[] }) {
  const { dayNoteOf, setDayNote, ready } = useDayNotes();
  const [activeDay, setActiveDay] = useState<Date | null>(null);

  const upcoming = saved
    .filter((t) => {
      const d = bidDaysLeft(t);
      return isBiddable(t.status) && d !== null && d >= 0 && d <= 3;
    })
    .sort((a, b) => (bidDaysLeft(a) ?? 0) - (bidDaysLeft(b) ?? 0));

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
              const remaining = bidDaysLeft(tor) ?? 0;
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
          initialValue={dayNoteOf(localDayKey(activeDay))}
          onSave={(note) => setDayNote(localDayKey(activeDay), note)}
          onClose={() => setActiveDay(null)}
        />
      )}
    </div>
  );
}
