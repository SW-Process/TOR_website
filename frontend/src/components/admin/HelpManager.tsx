"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Megaphone,
  MessageCircleQuestion,
  Pencil,
  Pin,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import HelpBody from "@/components/help/HelpBody";
import { formatThaiDate } from "@/lib/mockData";
import { ANNOUNCEMENT_KIND_LABELS, type HelpAnnouncementKind, type HelpCategory } from "@/lib/helpApi";
import {
  adminHelp,
  fetchHelpCategories,
  type AdminAnnouncement,
  type AdminFaq,
  type AnnouncementInput,
  type FaqInput,
  type HelpStatus,
  type Result,
} from "@/lib/adminHelpApi";

type Tab = "announcements" | "faqs";

const inputClass =
  "w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-text)] focus:border-[var(--color-ink)]/40 focus:outline-none";

/* --------------------------------- shared --------------------------------- */

function StatusChip({ status }: { status: HelpStatus }) {
  return status === "published" ? (
    <span className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
      เผยแพร่แล้ว
    </span>
  ) : (
    <span className="badge bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-faint)]" />
      ฉบับร่าง
    </span>
  );
}

/** A select styled like the other inputs (Safari ignores padding on a native select). */
function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <span className="relative block">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} appearance-none pr-10`}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--color-text)]">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-[var(--color-text-muted)]">{hint}</span>}
    </label>
  );
}

const MARKUP_HINT = [
  ["บรรทัดว่าง", "ขึ้นย่อหน้าใหม่"],
  ["## หัวข้อ", "หัวข้อย่อย"],
  ["- รายการ", "รายการแบบจุด"],
  ["1. ขั้นตอน", "รายการแบบตัวเลข"],
  ["**ข้อความ**", "ตัวหนา"],
  ["[ข้อความ](/account/settings)", "ลิงก์ (ในเว็บ หรือ https://)"],
];

/** Body/answer editor with a write/preview toggle and the markup cheat sheet. */
function MarkupEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-text)]">{label}</span>
        <div className="flex rounded-full bg-[var(--color-surface-alt)] p-0.5 text-xs font-semibold">
          {[false, true].map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => setPreview(p)}
              className={`rounded-full px-3 py-1 ${preview === p ? "bg-white text-[var(--color-text)] shadow-[var(--shadow-sm)]" : "text-[var(--color-text-muted)]"}`}
            >
              {p ? "ดูตัวอย่าง" : "เขียน"}
            </button>
          ))}
        </div>
      </div>
      {preview ? (
        <div className="min-h-[16rem] rounded-2xl border border-[var(--color-border)] bg-white p-5">
          {value.trim() ? <HelpBody text={value} /> : <p className="text-sm text-[var(--color-text-faint)]">ยังไม่มีเนื้อหา</p>}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          maxLength={20000}
          className={`${inputClass} resize-y font-[inherit] leading-relaxed`}
        />
      )}
      <details className="text-[11px] text-[var(--color-text-muted)]">
        <summary className="cursor-pointer select-none font-semibold">รูปแบบข้อความที่ใช้ได้</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {MARKUP_HINT.map(([code, what]) => (
            <li key={code}>
              <code className="rounded bg-[var(--color-surface-alt)] px-1.5 py-0.5 text-[var(--color-text)]">{code}</code> — {what}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Full-screen-ish editor panel. */
function EditorModal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-3xl rounded-[1.75rem] bg-[var(--color-surface-alt)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-text)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-2 hover:bg-white">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-6">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}

function SaveFooter({ pending, error, onCancel, onSave }: { pending: boolean; error: string; onCancel: () => void; onSave: () => void }) {
  return (
    <>
      {error && (
        <p className="mr-auto flex items-center gap-1.5 text-xs text-[var(--color-rose-dark)]">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </p>
      )}
      <button type="button" onClick={onCancel} disabled={pending} className="btn-pill border border-[var(--color-border)] bg-white px-4 py-2 text-sm">
        ยกเลิก
      </button>
      <button type="button" onClick={onSave} disabled={pending} className="btn-pill btn-pill-primary px-5 py-2 text-sm disabled:opacity-60">
        {pending && <Loader2 size={14} className="animate-spin" />}
        บันทึก
      </button>
    </>
  );
}

function StatusPicker({ value, onChange }: { value: HelpStatus; onChange: (s: HelpStatus) => void }) {
  return (
    <Field label="สถานะ" hint="ฉบับร่างจะเห็นเฉพาะแอดมิน">
      <div className="flex gap-2">
        {(["draft", "published"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`btn-pill flex-1 px-4 py-2.5 text-sm ${
              value === s ? "btn-pill-primary" : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)]"
            }`}
          >
            {s === "published" ? <Eye size={14} /> : <EyeOff size={14} />}
            {s === "published" ? "เผยแพร่" : "ฉบับร่าง"}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** "Delete?" confirm in place of the row's buttons. */
function RowActions({
  status,
  onEdit,
  onToggle,
  onDelete,
}: {
  status: HelpStatus;
  onEdit: () => void;
  onToggle: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text)]">ลบถาวร?</span>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="btn-pill border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs">
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(onDelete)}
          className="btn-pill bg-[var(--color-rose-dark)] px-3 py-1.5 text-xs text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          ลบ
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={onEdit} className="btn-pill border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold">
        <Pencil size={12} />
        แก้ไข
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(onToggle)}
        className="btn-pill border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : status === "published" ? <EyeOff size={12} /> : <Eye size={12} />}
        {status === "published" ? "ซ่อน" : "เผยแพร่"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="ลบ"
        className="btn-pill border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-rose-dark)]"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

/* ------------------------------ announcements ----------------------------- */

const KINDS = Object.keys(ANNOUNCEMENT_KIND_LABELS) as HelpAnnouncementKind[];

/** ISO ↔ the browser-local value a datetime-local input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AnnouncementEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminAnnouncement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AnnouncementInput>({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    kind: initial?.kind ?? "news",
    pinned: initial?.pinned ?? false,
    status: initial?.status ?? "draft",
    endsAt: initial?.endsAt ?? null,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (form.title.trim().length < 3) return setError("หัวข้อต้องมีอย่างน้อย 3 ตัวอักษร");
    if (!form.body.trim()) return setError("กรุณาใส่เนื้อหา");
    setPending(true);
    setError("");
    const result: Result<unknown> = initial
      ? await adminHelp.updateAnnouncement(initial.id, form)
      : await adminHelp.createAnnouncement(form);
    setPending(false);
    if (!result.ok) return setError(result.error);
    onSaved();
  }

  return (
    <EditorModal
      title={initial ? "แก้ไขประกาศ" : "สร้างประกาศ"}
      onClose={onClose}
      footer={<SaveFooter pending={pending} error={error} onCancel={onClose} onSave={() => void save()} />}
    >
      <Field label="หัวข้อ">
        <input value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ประเภท">
          <Select value={form.kind} onChange={(v) => set("kind", v as HelpAnnouncementKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {ANNOUNCEMENT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="สิ้นสุดเมื่อ (ไม่บังคับ)" hint="หลังเวลานี้จะแสดงเป็น [สิ้นสุด] และย้ายไปท้ายรายการ">
          <input
            type="datetime-local"
            value={toLocalInput(form.endsAt)}
            onChange={(e) => set("endsAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-sm text-[var(--color-text)]">
        <input type="checkbox" checked={form.pinned} onChange={(e) => set("pinned", e.target.checked)} className="h-4 w-4 accent-[var(--color-rose-dark)]" />
        ปักหมุดไว้บนสุด
      </label>
      <MarkupEditor label="เนื้อหา" value={form.body} onChange={(v) => set("body", v)} />
      <StatusPicker value={form.status} onChange={(s) => set("status", s)} />
    </EditorModal>
  );
}

function AnnouncementsTab({ rows, reload }: { rows: AdminAnnouncement[]; reload: () => void }) {
  const [editing, setEditing] = useState<AdminAnnouncement | "new" | null>(null);
  const [error, setError] = useState("");
  // Read once on mount: "ended" only needs to be right to the page load, and render must stay pure.
  const [now] = useState(() => Date.now());

  const act = async (r: Promise<Result<unknown>>) => {
    const res = await r;
    setError(res.ok ? "" : res.error);
    reload();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-muted)]">ประกาศที่ปักหมุดอยู่บนสุด ส่วนประกาศที่สิ้นสุดแล้วอยู่ท้ายรายการในหน้าศูนย์ช่วยเหลือ</p>
        <button type="button" onClick={() => setEditing("new")} className="btn-pill btn-pill-primary px-4 py-2 text-sm">
          <Plus size={15} />
          สร้างประกาศ
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-[var(--color-rose-dark)]">{error}</p>}
      <div className="mt-4 flex flex-col gap-3">
        {rows.length === 0 && <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">ยังไม่มีประกาศ</div>}
        {rows.map((a) => {
          const ended = a.endsAt !== null && Date.parse(a.endsAt) <= now;
          return (
            <div key={a.id} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={a.status} />
                  <span className="badge bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">{ANNOUNCEMENT_KIND_LABELS[a.kind]}</span>
                  {a.pinned && (
                    <span className="badge bg-[var(--color-ink)] text-white">
                      <Pin size={11} />
                      ปักหมุด
                    </span>
                  )}
                  {ended && <span className="badge bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]">สิ้นสุดแล้ว</span>}
                </div>
                <p className="mt-2 font-bold text-[var(--color-text)]">{a.title}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {a.publishedAt ? `เผยแพร่ ${formatThaiDate(a.publishedAt)} · ` : ""}แก้ไขล่าสุด {formatThaiDate(a.updatedAt)}
                </p>
              </div>
              <RowActions
                status={a.status}
                onEdit={() => setEditing(a)}
                onToggle={() => act(adminHelp.updateAnnouncement(a.id, { status: a.status === "published" ? "draft" : "published" }))}
                onDelete={() => act(adminHelp.deleteAnnouncement(a.id))}
              />
            </div>
          );
        })}
      </div>
      {editing && (
        <AnnouncementEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------- FAQs ---------------------------------- */

function FaqEditor({
  initial,
  categories,
  onClose,
  onSaved,
}: {
  initial: AdminFaq | null;
  categories: HelpCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FaqInput>({
    question: initial?.question ?? "",
    answer: initial?.answer ?? "",
    category: initial?.category ?? categories[0]?.slug ?? "getting-started",
    featured: initial?.featured ?? false,
    order: initial?.order ?? 100,
    status: initial?.status ?? "draft",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof FaqInput>(k: K, v: FaqInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (form.question.trim().length < 3) return setError("คำถามต้องมีอย่างน้อย 3 ตัวอักษร");
    if (!form.answer.trim()) return setError("กรุณาใส่คำตอบ");
    setPending(true);
    setError("");
    const result: Result<unknown> = initial ? await adminHelp.updateFaq(initial.id, form) : await adminHelp.createFaq(form);
    setPending(false);
    if (!result.ok) return setError(result.error);
    onSaved();
  }

  return (
    <EditorModal
      title={initial ? "แก้ไขคำถาม" : "เพิ่มคำถามที่พบบ่อย"}
      onClose={onClose}
      footer={<SaveFooter pending={pending} error={error} onCancel={onClose} onSave={() => void save()} />}
    >
      <Field label="คำถาม">
        <input value={form.question} maxLength={300} onChange={(e) => set("question", e.target.value)} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="หมวดหมู่">
          <Select value={form.category} onChange={(v) => set("category", v)}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ลำดับ" hint="น้อยขึ้นก่อน">
          <input
            type="number"
            min={0}
            value={form.order}
            onChange={(e) => set("order", Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 text-sm text-[var(--color-text)]">
        <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-[var(--color-rose-dark)]" />
        แสดงในหน้าแรกของศูนย์ช่วยเหลือ (สูงสุด 8 ข้อ)
      </label>
      <MarkupEditor label="คำตอบ" value={form.answer} onChange={(v) => set("answer", v)} />
      <StatusPicker value={form.status} onChange={(s) => set("status", s)} />
    </EditorModal>
  );
}

function FaqsTab({ rows, categories, reload }: { rows: AdminFaq[]; categories: HelpCategory[]; reload: () => void }) {
  const [editing, setEditing] = useState<AdminFaq | "new" | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const featuredLive = rows.filter((f) => f.featured && f.status === "published").length;

  const groups = useMemo(
    () =>
      categories
        .filter((c) => filter === "all" || c.slug === filter)
        .map((c) => ({ category: c, faqs: rows.filter((f) => f.category === c.slug).sort((a, b) => a.order - b.order) }))
        .filter((g) => g.faqs.length > 0),
    [categories, rows, filter]
  );

  const act = async (r: Promise<Result<unknown>>) => {
    const res = await r;
    setError(res.ok ? "" : res.error);
    reload();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm">
          <option value="all">ทุกหมวด ({rows.length})</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label} ({rows.filter((f) => f.category === c.slug).length})
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${featuredLive > 8 ? "text-[var(--color-rose-dark)]" : "text-[var(--color-text-muted)]"}`}>
            แสดงหน้าแรก {featuredLive}/8
          </span>
          <button type="button" onClick={() => setEditing("new")} className="btn-pill btn-pill-primary px-4 py-2 text-sm">
            <Plus size={15} />
            เพิ่มคำถาม
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-[var(--color-rose-dark)]">{error}</p>}
      <div className="mt-4 flex flex-col gap-6">
        {groups.length === 0 && <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">ยังไม่มีคำถามที่พบบ่อย</div>}
        {groups.map(({ category, faqs }) => (
          <section key={category.slug}>
            <h3 className="mb-2 text-sm font-bold text-[var(--color-rose-dark)]">{category.label}</h3>
            <div className="flex flex-col gap-2">
              {faqs.map((f) => (
                <div key={f.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span className="hidden w-10 shrink-0 text-center text-xs text-[var(--color-text-faint)] sm:block">#{f.order}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={f.status} />
                      {f.featured && (
                        <span className="badge bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                          <Star size={11} />
                          หน้าแรก
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 font-semibold text-[var(--color-text)]">{f.question}</p>
                  </div>
                  <RowActions
                    status={f.status}
                    onEdit={() => setEditing(f)}
                    onToggle={() => act(adminHelp.updateFaq(f.id, { status: f.status === "published" ? "draft" : "published" }))}
                    onDelete={() => act(adminHelp.deleteFaq(f.id))}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {editing && (
        <FaqEditor
          initial={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------- page ---------------------------------- */

/** Admin page for the public help center: announcements and FAQs. */
export default function HelpManager() {
  const [tab, setTab] = useState<Tab>("announcements");
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[] | null>(null);
  const [faqs, setFaqs] = useState<AdminFaq[] | null>(null);
  const [categories, setCategories] = useState<HelpCategory[]>([]);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([adminHelp.listAnnouncements(), adminHelp.listFaqs(), fetchHelpCategories()]).then(([a, f, c]) => {
      if (cancelled) return;
      if (!a.ok || !f.ok) return setError(true);
      setError(false);
      setAnnouncements(a.data.data);
      setFaqs(f.data.data);
      setCategories(c);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const tabs: { id: Tab; label: string; icon: typeof Megaphone; count: number | null }[] = [
    { id: "announcements", label: "ประกาศ", icon: Megaphone, count: announcements?.length ?? null },
    { id: "faqs", label: "คำถามที่พบบ่อย", icon: MessageCircleQuestion, count: faqs?.length ?? null },
  ];

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Help Center"
        title="ศูนย์ช่วยเหลือ"
        description="เขียนประกาศถึงผู้ใช้และดูแลคำถามที่พบบ่อย เนื้อหาที่เผยแพร่จะแสดงในหน้าศูนย์ช่วยเหลือทันที ส่วนฉบับร่างเห็นเฉพาะแอดมิน"
        action={
          <a
            href="/help"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-pill border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold"
          >
            <ExternalLink size={14} />
            ดูหน้าศูนย์ช่วยเหลือ
          </a>
        }
      />

      <div className="mt-7 flex flex-wrap gap-2 px-5 sm:px-8">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`btn-pill px-4 py-2 text-xs font-semibold ${
              tab === t.id ? "btn-pill-primary" : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)]"
            }`}
          >
            <t.icon size={13} />
            {t.label}
            {t.count !== null && <span className={`rounded-full px-1.5 text-[10px] ${tab === t.id ? "bg-white/20" : "bg-[var(--color-surface-alt)]"}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6 px-5 sm:px-8">
        {error ? (
          <div className="card p-10 text-center text-sm text-[var(--color-text-muted)]">โหลดข้อมูลไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ</div>
        ) : !announcements || !faqs ? (
          <div className="card flex items-center justify-center gap-2 p-10 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            กำลังโหลด...
          </div>
        ) : tab === "announcements" ? (
          <AnnouncementsTab rows={announcements} reload={reload} />
        ) : (
          <FaqsTab rows={faqs} categories={categories} reload={reload} />
        )}
      </div>
    </div>
  );
}
