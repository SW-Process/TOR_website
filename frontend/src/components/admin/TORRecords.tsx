"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import HideTorDialog from "./HideTorDialog";
import StatusBadge from "@/components/StatusBadge";
import { categories, formatBudget, formatThaiDate, formatThaiMonthYear, type TOR, type TORStatus } from "@/lib/mockData";
import { apiFetch } from "@/lib/api";
import { categoryToSlug, fetchAgencies, isUnknownDeadline, mapApiTor, type ApiTor } from "@/lib/torApi";
import { STATUS_API, STATUSES } from "@/lib/torSearch";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type TabValue = TORStatus | "ทั้งหมด" | "ต้องตรวจสอบ";

const statusTabs: { label: string; value: TabValue }[] = [
  { label: "ทั้งหมด", value: "ทั้งหมด" },
  { label: "ต้องตรวจสอบ", value: "ต้องตรวจสอบ" },
  ...STATUSES.map((s) => ({ label: s, value: s as TabValue })),
];

type FlagField = "budget" | "deadline" | "category" | "agency" | "title" | "qualificationRequirements" | "other";

const fieldLabels: Record<FlagField, string> = {
  budget: "งบประมาณ",
  deadline: "วันปิดรับ",
  category: "หมวดหมู่",
  agency: "หน่วยงาน",
  title: "ชื่อโครงการ",
  qualificationRequirements: "คุณสมบัติผู้เสนอราคา",
  other: "อื่นๆ",
};

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

interface Snapshot {
  rows: AdminTor[];
  totalCount: number;
  totalFlagged: number;
  hasNextPage: boolean;
}

/**
 * Last result per query, kept for the browser session so coming back to this
 * page (or a tab already visited) renders instantly while it refreshes.
 */
const snapshotCache = new Map<string, Snapshot>();

interface ApiAdminTor extends ApiTor {
  fairnessFlags?: { field: FlagField; message: string; status: "open" | "acknowledged" | "dismissed" }[];
}

/** A public TOR plus the AI fairness signals still waiting for review. */
interface AdminTor extends TOR {
  openFlags: { field: FlagField; message: string }[];
}

interface Draft {
  id: string;
  projectCode: string;
  title: string;
  agency: string;
  category: TOR["category"];
  /** Whole baht as typed; "" = unknown. */
  budget: string;
  /** `YYYY-MM-DD`; "" = unknown. */
  deadline: string;
  /** Close the TOR by hand: it then shows as ปิดรับแล้ว whatever its real stage is. */
  manualClosed: boolean;
  /** Only for `inviting` TORs. `YYYY-MM-DD` (Bangkok day); "" = unknown. */
  bidDeadline: string;
  /** Value loaded from the API, so an untouched field is never sent back (it would turn an AI value into an admin one). */
  originalBidDeadline: string;
  /** The field is shown only while the TOR is in the invitation stage. */
  canSetBidDeadline: boolean;
  /** Month-only deadline read from the PDF (e.g. "ตุลาคม 2569"); the date input stays empty. */
  bidDeadlineMonthHint: string;
  openFlags: AdminTor["openFlags"];
}

function toAdminTor(raw: ApiAdminTor): AdminTor {
  return {
    ...mapApiTor(raw),
    openFlags: (raw.fairnessFlags ?? []).filter((f) => f.status === "open"),
  };
}

/** The Bangkok calendar day of an ISO instant, as `YYYY-MM-DD`; "" when absent. */
function bangkokDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(d);
}

function toDraft(tor: AdminTor): Draft {
  const monthOnly = tor.procurement?.bidDeadlinePrecision === "month";
  return {
    id: tor.id,
    projectCode: tor.projectCode,
    title: tor.title,
    agency: tor.agency,
    category: tor.category,
    budget: tor.budget ? String(tor.budget) : "",
    deadline: isUnknownDeadline(tor.deadline) ? "" : tor.deadline.slice(0, 10),
    manualClosed: tor.manualClosed ?? false,
    // An end-of-month placeholder must not be shown (or re-sent) as if it were a real day.
    bidDeadline: monthOnly ? "" : bangkokDay(tor.procurement?.bidDeadline),
    originalBidDeadline: monthOnly ? "" : bangkokDay(tor.procurement?.bidDeadline),
    bidDeadlineMonthHint:
      monthOnly && tor.procurement?.bidDeadline ? formatThaiMonthYear(tor.procurement.bidDeadline) : "",
    canSetBidDeadline: tor.procurement?.stage === "inviting",
    openFlags: tor.openFlags,
  };
}

/** Admin review of public TORs (UC-5), backed by /api/admin/tors. */
export default function TORRecords({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<TabValue>("ทั้งหมด");
  const [page, setPage] = useState(1);
  // Only typing is debounced; tabs, paging and the first load fetch immediately.
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  // The latest response, tagged with the query (+ reload) it answers.
  const [result, setResult] = useState<{ key: string; snap?: Snapshot; error?: true } | null>(null);
  // Bumped after a save/hide so the current page reloads.
  const [reloadKey, setReloadKey] = useState(0);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const [hideTarget, setHideTarget] = useState<AdminTor | null>(null);
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const closeHideDialog = useCallback(() => {
    setHideTarget(null);
    setHideError(null);
  }, []);

  const [agencyOptions, setAgencyOptions] = useState<string[]>([]);
  useEffect(() => {
    fetchAgencies().then((a) => setAgencyOptions(a.agencies));
  }, []);

  const apiQuery = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQuery.trim()) p.set("q", debouncedQuery.trim());
    if (filter === "ต้องตรวจสอบ") p.set("flagged", "true");
    else if (filter !== "ทั้งหมด") p.set("status", STATUS_API[filter]);
    return p.toString();
  }, [debouncedQuery, filter, page]);

  const requestKey = `${apiQuery}#${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/admin/tors?${apiQuery}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          data: ApiAdminTor[];
          totalCount: number;
          flaggedCount: number;
          hasNextPage: boolean;
        };
        const next: Snapshot = {
          rows: body.data.map(toAdminTor),
          totalCount: body.totalCount,
          totalFlagged: body.flaggedCount,
          hasNextPage: body.hasNextPage,
        };
        snapshotCache.set(apiQuery, next);
        if (!cancelled) setResult({ key: requestKey, snap: next });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [apiQuery, requestKey]);

  const fresh = result?.key === requestKey ? result : null;
  const loading = !fresh;
  const loadError = !!fresh?.error;
  // While a request is in flight, show this query's cached result (instant when
  // revisiting), else the previous one dimmed — never a blank "loading" table.
  const snapshot = fresh?.snap ?? snapshotCache.get(apiQuery) ?? result?.snap ?? null;
  const rows = snapshot?.rows ?? [];
  const totalCount = snapshot?.totalCount ?? 0;
  const totalFlagged = snapshot?.totalFlagged ?? 0;
  const hasNextPage = snapshot?.hasNextPage ?? false;

  // After a save/hide every cached page may be stale.
  function reloadAfterChange() {
    snapshotCache.clear();
    setReloadKey((k) => k + 1);
  }

  function changeQuery(q: string) {
    setQuery(q);
    setPage(1);
  }

  function changeFilter(f: TabValue) {
    setFilter(f);
    setPage(1);
  }

  async function confirmHide() {
    if (!hideTarget) return;
    setHiding(true);
    setHideError(null);
    const res = await apiFetch(`/api/admin/tors/${hideTarget.id}`, { method: "DELETE" }).catch(() => null);
    setHiding(false);
    if (!res?.ok) {
      setHideError("ซ่อน TOR ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    setHideTarget(null);
    reloadAfterChange();
  }

  function openEdit(tor: AdminTor) {
    setActionError(null);
    setSavedId(null);
    setDraft(toDraft(tor));
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setActionError(null);
    const res = await apiFetch(`/api/admin/tors/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        agency: draft.agency,
        category: categoryToSlug(draft.category),
        budget: draft.budget === "" ? null : Number(draft.budget),
        submissionDeadline: draft.deadline || null,
        // Only "closed" has an effect (manual close); any other stored value means "no override".
        status: draft.manualClosed ? "closed" : "open",
        // Sent only when the admin changed it; "" clears the deadline.
        ...(draft.canSetBidDeadline && draft.bidDeadline !== draft.originalBidDeadline
          ? { bidDeadline: draft.bidDeadline || null }
          : {}),
        resolveFlags: true,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : {};
      setActionError(`บันทึกไม่สำเร็จ${body.message ? `: ${body.message}` : ""}`);
      return;
    }
    setSavedId(draft.id);
    setDraft(null);
    reloadAfterChange();
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const draftAgencies = draft ? [...new Set([draft.agency, ...agencyOptions])] : agencyOptions;

  return (
    <div className="pb-12 relative">
      <AdminPageHeader
        eyebrow="Data Quality"
        title="ตรวจสอบ TOR ที่ดึงมา"
        description="ตรวจสอบและแก้ไขข้อมูลที่ระบบสแครปและแยกฟิลด์อัตโนมัติ อาจดึงมาผิดพลาด เช่น งบประมาณหรือวันปิดรับ"
      />

      <div className="mt-7 px-5 sm:px-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-1 shadow-[var(--shadow-sm)] sm:max-w-sm">
          <input
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="ค้นหาชื่อโครงการ, หน่วยงาน หรือเลขที่โครงการ"
            className="w-full py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => changeFilter(tab.value)}
              className={`btn-pill px-4 py-2 text-xs font-semibold transition-colors ${
                filter === tab.value
                  ? "btn-pill-primary"
                  : tab.value === "ต้องตรวจสอบ" && totalFlagged > 0
                    ? "border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-ink)]/30"
              }`}
            >
              {tab.label}
              {tab.value === "ต้องตรวจสอบ" && ` (${totalFlagged})`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 px-5 sm:px-8">
        <div className="card overflow-hidden p-0">
          <div className="hidden lg:grid grid-cols-[1fr_130px_120px_110px_100px_100px] gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <span>โครงการ</span>
            <span>หน่วยงาน</span>
            <span>งบประมาณ</span>
            <span>ปิดรับ</span>
            <span>สถานะ</span>
            <span className="text-right">จัดการ</span>
          </div>

          {!snapshot && loading ? (
            <div className="p-10 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Loader2 size={16} className="animate-spin" />
              กำลังโหลด TOR...
            </div>
          ) : loadError && !snapshot ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
              โหลดข้อมูลไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
              ไม่พบประกาศที่ตรงกับเงื่อนไข
            </div>
          ) : (
            <div className={`divide-y divide-[var(--color-border)] transition-opacity ${loading ? "opacity-60" : ""}`}>
              {rows.map((tor) => {
                const flags = tor.openFlags;
                const flaggedFields = flags.map((f) => f.field);
                return (
                  <div
                    key={tor.id}
                    className="grid grid-cols-1 lg:grid-cols-[1fr_130px_120px_110px_100px_100px] gap-2 lg:gap-4 px-6 py-4 items-center hover:bg-[var(--color-surface-alt)]/60 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-start gap-1.5">
                        {flags.length > 0 && (
                          <AlertTriangle
                            size={14}
                            className="mt-0.5 shrink-0 text-[var(--color-danger)]"
                          />
                        )}
                        <p className="font-semibold text-sm text-[var(--color-text)] leading-snug line-clamp-2">
                          {tor.title}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-text-faint)]">{tor.projectCode}</p>
                      {flags.length > 0 && (
                        <p className="mt-1 text-[11px] text-[var(--color-danger)] leading-relaxed">
                          {[...new Set(flags.map((f) => fieldLabels[f.field]))].join(", ")}: {flags[0].message}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-ink-soft)] truncate">{tor.agency}</p>
                    <p
                      className={`text-sm font-semibold ${
                        flaggedFields.includes("budget")
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-rose-dark)]"
                      }`}
                    >
                      {formatBudget(tor.budget)}
                    </p>
                    <p
                      className={`text-sm ${
                        flaggedFields.includes("deadline")
                          ? "font-semibold text-[var(--color-danger)]"
                          : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      {isUnknownDeadline(tor.deadline) ? "ไม่ระบุ" : formatThaiDate(tor.deadline)}
                    </p>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={tor.status} />
                      {savedId === tor.id && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--color-success)]">
                          <CheckCircle2 size={11} />
                          บันทึกแล้ว
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 lg:justify-end">
                      <button
                        type="button"
                        aria-label="แก้ไข"
                        onClick={() => openEdit(tor)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="ซ่อนจากหน้าเว็บ"
                        title="ซ่อนจากหน้าเว็บ"
                        onClick={() => setHideTarget(tor)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                      >
                        <EyeOff size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {actionError && !draft && (
          <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
            {actionError}
          </p>
        )}

        {snapshot && totalPages > 1 && (
          <nav aria-label="เปลี่ยนหน้า" className="mt-4 flex items-center justify-center gap-3">
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
              disabled={!hasNextPage}
              className="btn-pill border border-[var(--color-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--color-text)] disabled:opacity-40"
            >
              ถัดไป
              <ChevronRight size={14} />
            </button>
          </nav>
        )}

        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          แสดง {rows.length} จาก {totalCount} รายการ — การซ่อนจะไม่ลบข้อมูลออกจากฐานข้อมูล
          และการแก้ไขอาจถูกเขียนทับหากประกาศต้นฉบับบน e-GP เปลี่ยนแปลงและระบบประมวลผลใหม่
        </p>
      </div>

      {hideTarget && (
        <HideTorDialog
          title={hideTarget.title}
          agency={hideTarget.agency}
          projectCode={hideTarget.projectCode}
          busy={hiding}
          error={hideError}
          onCancel={closeHideDialog}
          onConfirm={() => void confirmHide()}
        />
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDraft(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white p-6 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-text)]">
                แก้ไขข้อมูล TOR
              </h2>
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setDraft(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">{draft.projectCode}</p>

            {draft.openFlags.length > 0 && (
              <div className="mt-4 rounded-2xl bg-[var(--color-danger-bg)] p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-danger)]">
                  <AlertTriangle size={13} />
                  สัญญาณที่ควรตรวจสอบ (สร้างโดย AI)
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {draft.openFlags.map((f, i) => (
                    <li key={i} className="text-xs text-[var(--color-danger)] leading-relaxed">
                      <span className="font-semibold">{fieldLabels[f.field]}:</span> {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveDraft();
              }}
              className="mt-6 flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-text)]">ชื่อโครงการ</span>
                <textarea
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  rows={3}
                  className="rounded-2xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-text)]">หน่วยงาน</span>
                <select
                  value={draft.agency}
                  onChange={(e) => setDraft({ ...draft, agency: e.target.value })}
                  className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                >
                  {draftAgencies.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-text)]">หมวดหมู่</span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as TOR["category"] })}
                  className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">งบประมาณ (บาท)</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.budget}
                    placeholder="ไม่ระบุ"
                    onChange={(e) => setDraft({ ...draft, budget: e.target.value.replace(/\D/g, "") })}
                    className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">วันที่ระบุในเอกสาร TOR</span>
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
                    className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
              </div>

              {draft.canSetBidDeadline && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">กำหนดยื่นข้อเสนอ</span>
                  <input
                    type="date"
                    value={draft.bidDeadline}
                    onChange={(e) => setDraft({ ...draft, bidDeadline: e.target.value })}
                    className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                  />
                  {draft.bidDeadlineMonthHint && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      ระบบทราบเฉพาะเดือน {draft.bidDeadlineMonthHint}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    ระบบอ่านจากประกาศเชิญชวนให้อัตโนมัติ — ค่าที่กรอกเองจะใช้แทนและไม่ถูกเขียนทับ
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-surface-alt)] px-3.5 py-3 text-sm text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={draft.manualClosed}
                  onChange={(e) => setDraft({ ...draft, manualClosed: e.target.checked })}
                  className="mt-0.5 accent-[var(--color-rose-dark)]"
                />
                <span>
                  ปิดรับด้วยตนเอง
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    แสดงเป็น “ปิดรับแล้ว” ไม่ว่าสถานะการจัดซื้อจริงจะเป็นอย่างไร
                  </span>
                </span>
              </label>

              <div className="mt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || !draft.title.trim()}
                  className="btn-pill btn-pill-primary flex-1 py-3 text-sm disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? "กำลังบันทึก..." : "บันทึกและทำเครื่องหมายว่าตรวจสอบแล้ว"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="btn-pill border border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-text)]"
                >
                  ยกเลิก
                </button>
              </div>

              {actionError && (
                <p role="alert" className="text-xs text-[var(--color-danger)]">
                  {actionError}
                </p>
              )}
              {draft.deadline === "" && (
                <p className="text-xs text-[var(--color-text-muted)]">เว้นว่างไว้หากเอกสารไม่ได้ระบุ (ไม่กระทบสถานะการรับข้อเสนอ)</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
