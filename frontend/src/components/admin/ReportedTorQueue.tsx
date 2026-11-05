"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, EyeOff, Inbox, Loader2, Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/adminStats";

const PAGE_SIZE = 10;

interface QueueRow {
  tor: { id: string; title: string; projectCode: string | null; agency: string | null; isPublic: boolean } | null;
  openReportCount: number;
  latestReport: {
    id: string;
    description: string;
    createdAt: string;
    reporter: { displayName: string; companyName: string | null } | null;
    reporterEmail: string | null;
  };
}

interface QueuePage {
  data: QueueRow[];
  totalCount: number;
  hasNextPage: boolean;
}

/**
 * Admin queue of TORs with open error reports (FR-40/FR-41): one row per TOR, newest report
 * first, from GET /api/admin/tors/reported. "Review" opens the edit form with the reports.
 */
export default function ReportedTorQueue({
  reloadKey,
  onEdit,
}: {
  /** Bumped by the parent after a save so the queue refetches. */
  reloadKey: number;
  onEdit: (torId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ key: string; data?: QueuePage; error?: true } | null>(null);
  const key = `${page}#${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/admin/tors/reported?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as QueuePage;
        if (cancelled) return;
        // A save can empty the last page; step back instead of showing a blank one.
        if (data.data.length === 0 && page > 1) setPage(page - 1);
        else setResult({ key, data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [page, key]);

  const fresh = result?.key === key ? result : null;
  const data = fresh?.data ?? result?.data;
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE));

  if (!data) {
    return fresh?.error ? (
      <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
        โหลดรายการที่ถูกรายงานไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
      </div>
    ) : (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--color-text-muted)]">
        <Loader2 size={16} className="animate-spin" />
        กำลังโหลด...
      </div>
    );
  }

  if (data.data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-[var(--color-text-muted)]">
        <Inbox size={22} />
        ไม่มี TOR ที่รอการตรวจสอบจากรายงานของผู้ใช้
      </div>
    );
  }

  return (
    <>
      <ul className={`divide-y divide-[var(--color-border)] transition-opacity ${fresh ? "" : "opacity-60"}`}>
        {data.data.map((row) => {
          const { tor, latestReport: r } = row;
          const reporter = r.reporter
            ? (r.reporter.companyName ?? r.reporter.displayName)
            : (r.reporterEmail ?? "ผู้ใช้ทั่วไป");
          return (
            <li key={r.id} className="grid grid-cols-1 gap-3 px-6 py-4 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--color-text)]">
                    {tor?.title ?? "TOR นี้ไม่มีในระบบแล้ว"}
                  </p>
                  <span className="shrink-0 rounded-full bg-[var(--color-danger-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                    รายงาน {row.openReportCount} รายการ
                  </span>
                </div>
                {tor && (
                  <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                    {[tor.projectCode, tor.agency].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  “{r.description}”
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                  ล่าสุดจาก {reporter} · {timeAgo(r.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 lg:justify-end">
                {tor?.isPublic ? (
                  <button
                    type="button"
                    onClick={() => onEdit(tor.id)}
                    className="btn-pill btn-pill-primary px-4 py-2 text-xs"
                  >
                    <Pencil size={13} />
                    ตรวจสอบและแก้ไข
                  </button>
                ) : (
                  <>
                    {tor && (
                      <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                        <EyeOff size={12} />
                        ซ่อนจากหน้าเว็บแล้ว
                      </span>
                    )}
                    <Link
                      href="/admin/reports"
                      className="btn-pill border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text)]"
                    >
                      ดูรายงาน
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {data.totalCount > PAGE_SIZE && (
        <nav className="flex items-center justify-center gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="btn-pill border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            ก่อนหน้า
          </button>
          <span className="text-xs text-[var(--color-text-muted)]">
            หน้า {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data.hasNextPage}
            className="btn-pill border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-40"
          >
            ถัดไป
            <ChevronRight size={14} />
          </button>
        </nav>
      )}
    </>
  );
}
