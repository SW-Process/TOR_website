"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import StatusBadge from "@/components/StatusBadge";
import {
  agencies,
  categories,
  formatBudget,
  formatThaiDate,
  torList as initialTorList,
  TOR,
  TORStatus,
} from "@/lib/mockData";
import { torFlags, FlaggedField } from "@/lib/adminMockData";

const statusTabs: { label: string; value: TORStatus | "ทั้งหมด" | "ต้องตรวจสอบ" }[] = [
  { label: "ทั้งหมด", value: "ทั้งหมด" },
  { label: "ต้องตรวจสอบ", value: "ต้องตรวจสอบ" },
  { label: "เปิดรับ", value: "เปิดรับ" },
  { label: "ใกล้ปิดรับ", value: "ใกล้ปิดรับ" },
  { label: "ปิดรับแล้ว", value: "ปิดรับแล้ว" },
];

const fieldLabels: Record<FlaggedField, string> = {
  budget: "งบประมาณ",
  deadline: "วันปิดรับ",
  category: "หมวดหมู่",
  agency: "หน่วยงาน",
  title: "ชื่อโครงการ",
};

export default function TORRecords({ initialQuery = "" }: { initialQuery?: string }) {
  const [torItems, setTorItems] = useState<TOR[]>(initialTorList);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<TORStatus | "ทั้งหมด" | "ต้องตรวจสอบ">("ทั้งหมด");
  const [draft, setDraft] = useState<TOR | null>(null);

  function flagsFor(id: string) {
    if (resolvedIds.includes(id)) return [];
    return torFlags[id] ?? [];
  }

  const filtered = useMemo(() => {
    return torItems.filter((t) => {
      const matchesQuery =
        !query.trim() ||
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.agency.toLowerCase().includes(query.toLowerCase()) ||
        t.projectCode.toLowerCase().includes(query.toLowerCase());
      const matchesFilter =
        filter === "ทั้งหมด"
          ? true
          : filter === "ต้องตรวจสอบ"
            ? flagsFor(t.id).length > 0
            : t.status === filter;
      return matchesQuery && matchesFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torItems, query, filter, resolvedIds]);

  function handleDelete(id: string) {
    setTorItems((items) => items.filter((t) => t.id !== id));
  }

  function openEdit(tor: TOR) {
    setDraft({ ...tor });
  }

  function saveDraft() {
    if (!draft) return;
    setTorItems((items) => items.map((t) => (t.id === draft.id ? draft : t)));
    setResolvedIds((ids) => (ids.includes(draft.id) ? ids : [...ids, draft.id]));
    setDraft(null);
  }

  const totalFlagged = torItems.filter((t) => flagsFor(t.id).length > 0).length;

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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อโครงการ, หน่วยงาน หรือเลขที่โครงการ"
            className="w-full py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
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

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
              ไม่พบประกาศที่ตรงกับเงื่อนไข
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {filtered.map((tor) => {
                const flags = flagsFor(tor.id);
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
                          {flags.map((f) => fieldLabels[f.field]).join(", ")}: {flags[0].reason}
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
                      {formatThaiDate(tor.deadline)}
                    </p>
                    <div>
                      <StatusBadge status={tor.status} />
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
                        aria-label="ลบ"
                        onClick={() => handleDelete(tor.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          แสดง {filtered.length} จาก {torItems.length} รายการ — การแก้ไข/ลบในหน้านี้เป็นการจำลอง (mock)
          ยังไม่เชื่อมต่อฐานข้อมูลจริง
        </p>
      </div>

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

            {flagsFor(draft.id).length > 0 && (
              <div className="mt-4 rounded-2xl bg-[var(--color-danger-bg)] p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-danger)]">
                  <AlertTriangle size={13} />
                  ระบบตั้งค่าสถานะให้ตรวจสอบ
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {flagsFor(draft.id).map((f, i) => (
                    <li key={i} className="text-xs text-[var(--color-danger)] leading-relaxed">
                      <span className="font-semibold">{fieldLabels[f.field]}:</span> {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveDraft();
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
                  {agencies.map((a) => (
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
                    value={draft.budget}
                    onChange={(e) => setDraft({ ...draft, budget: Number(e.target.value) })}
                    className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text)]">วันปิดรับ</span>
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
                    className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-text)]">สถานะ</span>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as TORStatus })}
                  className="rounded-full border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--color-ink)]"
                >
                  <option value="เปิดรับ">เปิดรับ</option>
                  <option value="ใกล้ปิดรับ">ใกล้ปิดรับ</option>
                  <option value="ปิดรับแล้ว">ปิดรับแล้ว</option>
                </select>
              </label>

              <div className="mt-2 flex items-center gap-3">
                <button
                  type="submit"
                  className="btn-pill btn-pill-primary flex-1 py-3 text-sm"
                >
                  <Save size={15} />
                  บันทึกและทำเครื่องหมายว่าตรวจสอบแล้ว
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="btn-pill border border-[var(--color-border)] px-5 py-3 text-sm text-[var(--color-text)]"
                >
                  ยกเลิก
                </button>
              </div>

              {resolvedIds.includes(draft.id) && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
                  <CheckCircle2 size={13} />
                  รายการนี้ถูกตรวจสอบแล้ว
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
