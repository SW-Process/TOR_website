"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { categories, daysUntil, torList, Category, TORStatus } from "@/lib/mockData";

const statuses: TORStatus[] = ["เปิดรับ", "ใกล้ปิดรับ", "ปิดรับแล้ว"];

export default function TORPreviewTable() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TORStatus | "ทุกสถานะ">("ทุกสถานะ");
  const [category, setCategory] = useState<Category | "ทุกหมวดหมู่">("ทุกหมวดหมู่");

  const filtered = useMemo(() => {
    return torList
      .filter((t) => {
        const matchesQuery =
          !query.trim() ||
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.agency.toLowerCase().includes(query.toLowerCase());
        const matchesStatus = status === "ทุกสถานะ" || t.status === status;
        const matchesCategory = category === "ทุกหมวดหมู่" || t.category === category;
        return matchesQuery && matchesStatus && matchesCategory;
      })
      .slice(0, 5);
  }, [query, status, category]);

  return (
    <div className="card p-5 sm:p-6 h-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-heading)] font-bold text-sm text-[var(--color-text)]">
          TOR ล่าสุด
        </h2>
        <div className="flex items-center gap-2 rounded-full bg-[var(--color-surface-alt)] px-3.5 py-1.5 min-w-0">
          <Search size={13} className="text-[var(--color-text-faint)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาโครงการ"
            className="w-full min-w-0 max-w-40 bg-transparent text-xs focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TORStatus | "ทุกสถานะ")}
          className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:outline-none"
        >
          <option value="ทุกสถานะ">ทุกสถานะ</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "ทุกหมวดหมู่")}
          className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] focus:outline-none min-w-0"
        >
          <option value="ทุกหมวดหมู่">ทุกหมวดหมู่</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-col">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
            ไม่พบ TOR ที่ตรงกับเงื่อนไข
          </p>
        ) : (
          filtered.map((tor) => {
            const days = daysUntil(tor.deadline);
            return (
              <Link
                key={tor.id}
                href="/admin/records"
                className="flex items-center gap-3 rounded-xl border-t border-[var(--color-border)] px-1 py-3 first:border-t-0 hover:bg-[var(--color-surface-alt)] transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                  <FileText size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{tor.title}</p>
                  <p className="truncate text-xs text-[var(--color-text-faint)] mt-0.5">{tor.agency}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={tor.status} />
                  <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                    {days >= 0 ? `ปิดรับใน ${days} วัน` : "ปิดรับแล้ว"}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
