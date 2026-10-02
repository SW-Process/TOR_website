"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FilePen,
  Hash,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  UserRound,
} from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { apiFetch, API_BASE } from "@/lib/api";
import { formatThaiDateTime } from "@/lib/adminStats";

type ReportStatus = "open" | "resolved";
type Tab = ReportStatus | "all";

interface Person {
  id: string;
  email: string;
  displayName: string;
  companyName: string | null;
  role: "vendor" | "admin";
  avatarUrl: string | null;
}

interface Report {
  id: string;
  description: string;
  status: ReportStatus;
  createdAt: string;
  reporter: Person | null;
  reporterEmail: string | null;
  tor: { id: string; title: string; projectCode: string | null; agency: string | null; isPublic: boolean } | null;
  resolution: { note: string | null; resolvedAt: string; resolvedBy: Person | null } | null;
}

interface ReportPage {
  data: Report[];
  totalCount: number;
  counts: { open: number; resolved: number };
  hasNextPage: boolean;
}

const PAGE_SIZE = 10;

const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "รอดำเนินการ" },
  { value: "resolved", label: "แก้ไขแล้ว" },
  { value: "all", label: "ทั้งหมด" },
];

const ROLE_LABELS: Record<Person["role"], string> = {
  vendor: "ผู้ประกอบการ",
  admin: "ผู้ดูแลระบบ",
};

const relative = new Intl.RelativeTimeFormat("th", { numeric: "auto" });

function timeAgo(iso: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "เมื่อสักครู่";
}

function Avatar({ person, size = 44 }: { person: Person | null; size?: number }) {
  const style = { width: size, height: size };
  if (person?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${API_BASE}${person.avatarUrl}`}
        alt=""
        style={style}
        className="shrink-0 rounded-full object-cover ring-2 ring-white shadow-[var(--shadow-sm)]"
      />
    );
  }
  if (!person) {
    return (
      <span
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-faint)] ring-2 ring-white"
      >
        <UserRound size={size * 0.45} />
      </span>
    );
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-bold text-white ring-2 ring-white shadow-[var(--shadow-sm)]"
    >
      {person.displayName.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function ReportCard({ report, onChanged }: { report: Report; onChanged: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reporter, tor, resolution } = report;
  const resolved = report.status === "resolved";

  async function setStatus(status: ReportStatus) {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/admin/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(status === "resolved" ? { status, resolutionNote: note.trim() || undefined } : { status }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    setResolving(false);
    setNote("");
    onChanged();
  }

  return (
    <article
      className={`card relative overflow-hidden p-5 sm:p-6 transition-shadow hover:shadow-[var(--shadow-md)] ${
        resolved ? "" : "border-l-[3px] border-l-[var(--color-rose-dark)]"
      }`}
    >
      {/* Reporter */}
      <header className="flex items-start gap-3.5">
        <Avatar person={reporter} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-[family-name:var(--font-heading)] text-[15px] font-bold text-[var(--color-text)]">
              {reporter ? reporter.displayName : "ผู้ใช้ทั่วไป"}
            </p>
            <span
              className={`badge text-[11px] ${
                reporter
                  ? "bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]"
                  : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]"
              }`}
            >
              {reporter ? ROLE_LABELS[reporter.role] : "ไม่ได้เข้าสู่ระบบ"}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--color-text-muted)]">
            <Mail size={12} className="shrink-0" />
            {reporter?.email ?? report.reporterEmail ?? "ไม่ได้ระบุอีเมลติดต่อ"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`badge text-[11px] ${
              resolved
                ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                : "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${resolved ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`} />
            {resolved ? "แก้ไขแล้ว" : "รอดำเนินการ"}
          </span>
          <span title={formatThaiDateTime(report.createdAt)} className="flex items-center gap-1 text-[11px] text-[var(--color-text-faint)]">
            <Clock size={11} />
            {timeAgo(report.createdAt)}
          </span>
        </div>
      </header>

      {/* Message */}
      <blockquote className="relative mt-4 rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3.5 pl-9 text-sm leading-relaxed text-[var(--color-text)] whitespace-pre-wrap break-words">
        <span aria-hidden className="absolute left-3.5 top-2 font-serif text-3xl leading-none text-[var(--color-rose-dark)]/40">
          “
        </span>
        {report.description}
      </blockquote>

      {/* TOR */}
      {tor ? (
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">TOR ที่ถูกแจ้ง</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--color-text)]">{tor.title}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
              {tor.projectCode && (
                <span className="flex items-center gap-1">
                  <Hash size={11} />
                  {tor.projectCode}
                </span>
              )}
              {tor.agency && (
                <span className="flex items-center gap-1">
                  <Building2 size={11} />
                  {tor.agency}
                </span>
              )}
              {!tor.isPublic && <span className="text-[var(--color-danger)]">ซ่อนจากหน้าเว็บแล้ว</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {tor.isPublic && (
              <Link
                href={`/tor/${tor.id}`}
                target="_blank"
                className="btn-pill border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-ink)]/40"
              >
                <ExternalLink size={13} />
                เปิดดู
              </Link>
            )}
            <Link
              href={`/admin/records?q=${encodeURIComponent(tor.projectCode ?? tor.title)}`}
              className="btn-pill border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-ink)]/40"
            >
              <FilePen size={13} />
              แก้ไขข้อมูล
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--color-text-faint)]">TOR นี้ไม่มีในระบบแล้ว</p>
      )}

      {/* Resolution */}
      {resolution && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-[var(--color-success-bg)] px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--color-success)]" />
          <div className="min-w-0 text-xs leading-relaxed text-[var(--color-text)]">
            <p className="font-semibold text-[var(--color-success)]">
              แก้ไขแล้ว{resolution.resolvedBy ? ` โดย ${resolution.resolvedBy.displayName}` : ""} ·{" "}
              {formatThaiDateTime(resolution.resolvedAt)}
            </p>
            {resolution.note && <p className="mt-0.5 whitespace-pre-wrap">{resolution.note}</p>}
          </div>
        </div>
      )}

      {/* Actions */}
      <footer className="mt-4 flex flex-col gap-3">
        {resolving && (
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="บันทึกสิ่งที่แก้ไข (ไม่บังคับ) เช่น แก้วันปิดรับให้ตรงกับเอกสารแล้ว"
            className="w-full rounded-2xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
          />
        )}
        {error && (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {resolved ? (
            <button
              type="button"
              onClick={() => void setStatus("open")}
              disabled={busy}
              className="btn-pill border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-ink)]/40 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              เปิดเรื่องอีกครั้ง
            </button>
          ) : resolving ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setResolving(false);
                  setNote("");
                }}
                disabled={busy}
                className="btn-pill border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void setStatus("resolved")}
                disabled={busy}
                className="btn-pill btn-pill-primary px-4 py-2 text-xs disabled:opacity-60"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                ยืนยันว่าแก้ไขแล้ว
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setResolving(true)}
              className="btn-pill btn-pill-primary px-4 py-2 text-xs"
            >
              <CheckCircle2 size={13} />
              ทำเครื่องหมายว่าแก้ไขแล้ว
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

/** Admin inbox for user-submitted TOR error reports (FR-41). */
export default function ErrorReports() {
  const [tab, setTab] = useState<Tab>("open");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReportPage | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ status: tab, page: String(page), pageSize: String(PAGE_SIZE) });
    apiFetch(`/api/admin/reports?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ReportPage;
        if (cancelled) return;
        setResult(body);
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [tab, page, reloadKey]);

  const counts = result?.counts;
  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)) : 1;
  const countFor = (t: Tab) => (!counts ? null : t === "all" ? counts.open + counts.resolved : counts[t]);

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="User Reports"
        title="รายงานจากผู้ใช้"
        description="เรื่องที่ผู้ใช้แจ้งว่าข้อมูล TOR ไม่ตรงกับเอกสารต้นฉบับ ตรวจสอบแล้วแก้ไขข้อมูลในหน้าตรวจสอบ TOR จากนั้นทำเครื่องหมายว่าแก้ไขแล้ว"
      />

      <div className="mt-7 px-5 sm:px-8 flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const active = tab === t.value;
          const n = countFor(t.value);
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setTab(t.value);
                setPage(1);
              }}
              className={`btn-pill px-4 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "btn-pill-primary"
                  : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-ink)]/30"
              }`}
            >
              {t.label}
              {n !== null && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                    active ? "bg-white/20" : t.value === "open" && n > 0 ? "bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]" : "bg-[var(--color-surface-alt)]"
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6 px-5 sm:px-8">
        {error ? (
          <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">
            โหลดรายงานไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
          </div>
        ) : !result ? (
          <div className="card p-10 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            กำลังโหลดรายงาน...
          </div>
        ) : result.data.length === 0 ? (
          <div className="card p-12 flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
              <Inbox size={24} />
            </span>
            <p className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
              {tab === "open" ? "ไม่มีเรื่องค้างตรวจสอบ" : "ยังไม่มีรายงาน"}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-[var(--color-text-muted)]">
              เมื่อผู้ใช้กด “แจ้งข้อมูลคลาดเคลื่อน” ในหน้ารายละเอียด TOR เรื่องที่แจ้งจะแสดงที่นี่
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {result.data.map((r) => (
              <ReportCard key={r.id} report={r} onChanged={reload} />
            ))}
          </div>
        )}

        {result && totalPages > 1 && (
          <nav aria-label="เปลี่ยนหน้า" className="mt-6 flex items-center justify-center gap-3">
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
              disabled={!result.hasNextPage}
              className="btn-pill border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-40"
            >
              ถัดไป
              <ChevronRight size={14} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
