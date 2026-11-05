"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowUpRight, Bell, BellOff, SearchCheck, Trash2 } from "lucide-react";
import { formatBudget, formatThaiDate } from "@/lib/mockData";
import { useSavedSearches, type SavedSearchItem } from "@/lib/useSavedSearches";
import { PROJECT_TYPE_LABELS, savedSearchToTorFilters, toUrlParams, type TorFilters } from "@/lib/torSearch";

const SORT_LABELS: Record<TorFilters["sort"], string> = {
  newest: "ประกาศล่าสุด",
  deadline: "ใกล้ปิดรับก่อน",
  hearing: "ใกล้สิ้นสุดรับฟังคำวิจารณ์ก่อน",
  budgetDesc: "งบประมาณ: มาก-น้อย",
  budgetAsc: "งบประมาณ: น้อย-มาก",
};

function range(from: string, to: string, fmt: (v: string) => string): string | null {
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `ตั้งแต่ ${fmt(from)}`;
  if (to) return `ถึง ${fmt(to)}`;
  return null;
}

/** One readable chip per condition, in the order the search page's filter panel lists them. */
function describe(f: TorFilters): string[] {
  const chips: string[] = [];
  if (f.q.trim()) chips.push(`“${f.q.trim()}”`);
  chips.push(...f.statuses, ...f.categories, ...f.agencies, ...f.tech);
  chips.push(...f.projectTypes.map((t) => PROJECT_TYPE_LABELS[t]));
  const budget = range(f.budgetMin, f.budgetMax, (v) => formatBudget(Number(v)));
  if (budget) chips.push(`งบ ${budget}`);
  const published = range(f.publishedFrom, f.publishedTo, formatThaiDate);
  if (published) chips.push(`ประกาศ ${published}`);
  const deadline = range(f.deadlineFrom, f.deadlineTo, formatThaiDate);
  if (deadline) chips.push(`ปิดรับ ${deadline}`);
  return chips;
}

function SavedSearchCard({
  search,
  onToggleAlerts,
  onDelete,
}: {
  search: SavedSearchItem;
  onToggleAlerts: (on: boolean) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const filters = savedSearchToTorFilters(search.filters);
  const chips = describe(filters);
  const query = toUrlParams(filters).toString();
  const switchId = `alerts-${search._id}`;

  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[15px] font-bold text-[var(--color-text)]">{search.name}</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            บันทึกเมื่อ {formatThaiDate(search.createdAt)} · เรียงตาม{SORT_LABELS[filters.sort]}
          </p>
        </div>
        <Link
          href={`/tor${query ? `?${query}` : ""}`}
          className="btn-pill shrink-0 border border-[var(--color-border-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-text)] hover:border-[var(--color-ink)]"
        >
          ใช้การค้นหานี้
          <ArrowUpRight size={14} />
        </Link>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="เงื่อนไขการค้นหา">
        {chips.length > 0 ? (
          chips.map((c, i) => (
            <li
              key={`${c}-${i}`}
              className="max-w-full truncate rounded-full bg-[var(--color-surface-alt)] px-2.5 py-1 text-xs text-[var(--color-text)]"
            >
              {c}
            </li>
          ))
        ) : (
          <li className="text-xs text-[var(--color-text-muted)]">ไม่มีเงื่อนไข (TOR ทั้งหมด)</li>
        )}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
        <label htmlFor={switchId} className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text)]">
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={search.alertsEnabled}
            onClick={() => onToggleAlerts(!search.alertsEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ${
              search.alertsEnabled ? "bg-[var(--color-rose-dark)]" : "bg-[var(--color-border-strong)]"
            }`}
          >
            <span
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                search.alertsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="flex items-center gap-1.5">
            {search.alertsEnabled ? <Bell size={14} /> : <BellOff size={14} className="text-[var(--color-text-muted)]" />}
            แจ้งเตือนเมื่อมี TOR ใหม่ตรงเงื่อนไข
          </span>
        </label>

        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-text-muted)]">ลบการค้นหานี้?</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full px-3 py-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full bg-[var(--color-rose-dark)] px-3 py-1.5 font-medium text-white hover:opacity-90"
            >
              ลบ
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-[var(--color-rose-dark)] hover:bg-[var(--color-blush-soft)]"
          >
            <Trash2 size={14} />
            ลบ
          </button>
        )}
      </div>
    </li>
  );
}

/** Settings → การค้นหาที่บันทึกไว้ (FR-28): the vendor's saved searches, with alerts and delete. */
export default function SavedSearchesSection() {
  const { items, ready, error, setAlerts, remove, reload } = useSavedSearches();
  const alertsOn = items.filter((s) => s.alertsEnabled).length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
        การค้นหาที่เปิดแจ้งเตือนไว้ จะแจ้งในเว็บไซต์และส่งอีเมลสรุปเมื่อมี TOR ใหม่ตรงเงื่อนไข บันทึกการค้นหาใหม่ได้จากปุ่ม
        “บันทึกการค้นหา” ในหน้าค้นหา TOR
        {ready && items.length > 0 && (
          <span className="font-semibold text-[var(--color-text)]">
            {" "}
            · {items.length} รายการ เปิดแจ้งเตือน {alertsOn} รายการ
          </span>
        )}
      </p>

      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-rose-dark)]">
          <AlertTriangle size={14} />
          {error}
          {items.length === 0 && (
            <button type="button" onClick={() => void reload()} className="font-medium underline">
              ลองอีกครั้ง
            </button>
          )}
        </p>
      )}

      {!ready ? null : items.length === 0 ? (
        !error && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--color-ink)] text-[var(--color-ink)]">
              <SearchCheck size={34} strokeWidth={1.6} />
            </span>
            <p className="mt-2 text-lg font-bold text-[var(--color-text)]">ยังไม่มีการค้นหาที่บันทึกไว้</p>
            <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
              ค้นหา TOR แล้วกด “บันทึกการค้นหา” เพื่อเก็บเงื่อนไขไว้ใช้ซ้ำและรับแจ้งเตือนเมื่อมีประกาศใหม่
            </p>
            <Link href="/tor" className="btn-pill btn-pill-primary mt-2 px-4 py-2.5 text-sm">
              ไปหน้าค้นหา TOR
            </Link>
          </div>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((s) => (
            <SavedSearchCard
              key={s._id}
              search={s}
              onToggleAlerts={(on) => void setAlerts(s._id, on)}
              onDelete={() => void remove(s._id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
