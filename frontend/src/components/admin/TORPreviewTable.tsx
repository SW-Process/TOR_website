"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { categories, type Category, type TOR, type TORStatus } from "@/lib/mockData";
import { categoryToSlug, daysLeft, isUnknownDeadline, searchTors } from "@/lib/torApi";
import { STATUS_API, STATUSES as statuses } from "@/lib/torSearch";

const PREVIEW_SIZE = 5;
const SEARCH_DEBOUNCE_MS = 300;

function deadlineLabel(tor: TOR): string {
  if (isUnknownDeadline(tor.deadline)) return "ไม่ระบุวันปิดรับ";
  const days = daysLeft(tor.deadline);
  return days >= 0 ? `ปิดรับใน ${days} วัน` : "ปิดรับแล้ว";
}

/** Latest public TORs from GET /api/tors, newest announcement first. */
export default function TORPreviewTable() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TORStatus | "ทุกสถานะ">("ทุกสถานะ");
  const [category, setCategory] = useState<Category | "ทุกหมวดหมู่">("ทุกหมวดหมู่");
  const [rows, setRows] = useState<TOR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({
      page: "1",
      pageSize: String(PREVIEW_SIZE),
      sort: "announcementDate",
      order: "desc",
    });
    if (query.trim()) params.set("q", query.trim());
    if (status !== "ทุกสถานะ") params.set("status", STATUS_API[status]);
    if (category !== "ทุกหมวดหมู่") params.set("category", categoryToSlug(category));

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchTors(params, controller.signal)
        .then(({ tors }) => {
          setRows(tors);
          setError(false);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setError(true);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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
        {loading ? (
          <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">กำลังโหลด TOR...</p>
        ) : error ? (
          <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
            โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
            ไม่พบ TOR ที่ตรงกับเงื่อนไข
          </p>
        ) : (
          rows.map((tor) => {
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
                    {deadlineLabel(tor)}
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
