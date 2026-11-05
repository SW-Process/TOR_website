"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

type Severity = "low" | "medium" | "high";

interface Thresholds {
  budgetDeviationPercent: number;
  minBidWindowDays: number;
  minSeverity: Severity;
}

interface SettingsView {
  settings: Thresholds;
  defaults: Thresholds;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The form keeps the number fields as typed text so a half-typed value can be shown and checked. */
interface Draft {
  budgetDeviationPercent: string;
  minBidWindowDays: string;
  minSeverity: Severity;
}

const ENDPOINT = "/api/admin/settings/fairness-prefilter";

/** Same wording as the severity badges on the TOR page. */
const SEVERITY_OPTIONS: { value: Severity; label: string; hint: string }[] = [
  { value: "low", label: "ควรสังเกตเล็กน้อย", hint: "แสดงทุกระดับ" },
  { value: "medium", label: "ควรพิจารณาเพิ่มเติม", hint: "ซ่อนระดับเล็กน้อย" },
  { value: "high", label: "ควรตรวจสอบเพิ่มเติม", hint: "แสดงเฉพาะระดับนี้" },
];

const toDraft = (t: Thresholds): Draft => ({
  budgetDeviationPercent: String(t.budgetDeviationPercent),
  minBidWindowDays: String(t.minBidWindowDays),
  minSeverity: t.minSeverity,
});

/** The same limits as the backend's fairnessPrefilterSchema, checked before saving. */
function validate(d: Draft): { values: Thresholds | null; errors: Partial<Record<keyof Draft, string>> } {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const budget = Number(d.budgetDeviationPercent);
  if (d.budgetDeviationPercent.trim() === "" || !Number.isFinite(budget) || budget < 1 || budget > 500) {
    errors.budgetDeviationPercent = "ใส่ตัวเลขระหว่าง 1 ถึง 500";
  }
  const days = Number(d.minBidWindowDays);
  if (d.minBidWindowDays.trim() === "" || !Number.isInteger(days) || days < 1 || days > 90) {
    errors.minBidWindowDays = "ใส่จำนวนวันเต็มระหว่าง 1 ถึง 90";
  }
  if (Object.keys(errors).length > 0) return { values: null, errors };
  return { values: { budgetDeviationPercent: budget, minBidWindowDays: days, minSeverity: d.minSeverity }, errors };
}

function sameThresholds(a: Thresholds, b: Thresholds): boolean {
  return (
    a.budgetDeviationPercent === b.budgetDeviationPercent &&
    a.minBidWindowDays === b.minBidWindowDays &&
    a.minSeverity === b.minSeverity
  );
}

async function fetchSettings(): Promise<SettingsView> {
  const res = await apiFetch(ENDPOINT);
  if (!res.ok) throw new Error("failed to load settings");
  return (await res.json()) as SettingsView;
}

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Admin settings for the fairness pre-filter (FR-20), from GET/PUT /api/admin/settings/fairness-prefilter:
 * the thresholds that decide which AI fairness signals are published. They apply from the next
 * enrichment; TORs already enriched keep their signals until they are enriched again.
 */
export default function FairnessPrefilterSettings() {
  const { user } = useAuth();
  const [view, setView] = useState<SettingsView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function show(body: SettingsView) {
    setView(body);
    setDraft(toDraft(body.settings));
  }

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((body) => !cancelled && show(body))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  function retry() {
    setLoadError(false);
    fetchSettings()
      .then(show)
      .catch(() => setLoadError(true));
  }

  const { values, errors } = draft ? validate(draft) : { values: null, errors: {} };
  const changed = Boolean(view && values && !sameThresholds(values, view.settings));
  const showingDefaults = Boolean(view && values && sameThresholds(values, view.defaults));

  function update(field: keyof Draft, value: string) {
    setMessage(null);
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!values || !changed) return;
    setSaving(true);
    setMessage(null);
    const res = await apiFetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { message?: string } | null;
      return setMessage({ tone: "error", text: body?.message ? `บันทึกไม่สำเร็จ: ${body.message}` : "บันทึกไม่สำเร็จ กรุณาลองใหม่" });
    }
    show((await res.json()) as SettingsView);
    setMessage({ tone: "ok", text: "บันทึกแล้ว มีผลกับ TOR ที่ประมวลผลด้วย AI ครั้งถัดไป" });
  }

  const inputClass = (bad: boolean) =>
    `w-24 rounded-xl border bg-white px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-rose-dark)]/30 ${
      bad ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
    }`;

  return (
    <div>
      <AdminPageHeader
        eyebrow="ตั้งค่าระบบ"
        title="เกณฑ์คัดกรองสัญญาณด้านความเป็นธรรม"
        description="กำหนดว่าสัญญาณจาก AI แบบไหนที่จะเผยแพร่บนหน้า TOR ค่าที่บันทึกมีผลกับ TOR ที่ประมวลผลด้วย AI ครั้งถัดไป TOR ที่ประมวลผลแล้วจะยังคงสัญญาณเดิมจนกว่าจะถูกประมวลผลใหม่"
      />

      <div className="mx-5 mt-6 flex flex-col gap-6 sm:mx-8">
        {message && (
          <p
            role="status"
            className={`rounded-2xl px-4 py-3 text-sm ${
              message.tone === "ok"
                ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]"
                : "bg-[var(--color-danger-bg)] text-[var(--color-danger)]"
            }`}
          >
            {message.text}
          </p>
        )}

        {loadError && (
          <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-text-muted)] sm:p-6">
            <p>โหลดการตั้งค่าไม่สำเร็จ</p>
            <button type="button" onClick={retry} className="mt-2 font-medium text-[var(--color-rose-dark)] hover:underline">
              ลองอีกครั้ง
            </button>
          </section>
        )}

        {!loadError && (!view || !draft) && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={15} className="animate-spin" />
            กำลังโหลด…
          </p>
        )}

        {view && draft && (
          <form onSubmit={(e) => void save(e)} className="rounded-3xl border border-[var(--color-border)] bg-white p-5 sm:p-6" noValidate>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-[var(--color-text)]">เกณฑ์ที่ใช้อยู่</h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                {view.isDefault || !view.updatedAt
                  ? "ใช้ค่าเริ่มต้นของระบบ"
                  : `บันทึกล่าสุด ${formatSavedAt(view.updatedAt)}${view.updatedBy && view.updatedBy === user?.id ? " โดยคุณ" : ""}`}
              </p>
            </div>

            <div className="mt-5 flex flex-col divide-y divide-[var(--color-border)]">
              <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-md">
                  <label htmlFor="budgetDeviationPercent" className="text-sm font-semibold text-[var(--color-text)]">
                    งบประมาณต่างจากราคากลางอย่างน้อย
                  </label>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                    สัญญาณด้านงบประมาณจะแสดงเมื่องบประมาณสูงหรือต่ำกว่าราคากลางตั้งแต่ค่านี้ขึ้นไป · ค่าเริ่มต้น{" "}
                    {view.defaults.budgetDeviationPercent}%
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      id="budgetDeviationPercent"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={500}
                      value={draft.budgetDeviationPercent}
                      onChange={(e) => update("budgetDeviationPercent", e.target.value)}
                      aria-invalid={Boolean(errors.budgetDeviationPercent)}
                      aria-describedby={errors.budgetDeviationPercent ? "budgetDeviationPercent-error" : undefined}
                      className={inputClass(Boolean(errors.budgetDeviationPercent))}
                    />
                    <span className="text-sm text-[var(--color-text-muted)]">%</span>
                  </div>
                  {errors.budgetDeviationPercent && (
                    <p id="budgetDeviationPercent-error" className="mt-1 text-xs text-[var(--color-danger)]">
                      {errors.budgetDeviationPercent}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-md">
                  <label htmlFor="minBidWindowDays" className="text-sm font-semibold text-[var(--color-text)]">
                    ระยะเวลายื่นข้อเสนอสั้นกว่า
                  </label>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                    สัญญาณด้านระยะเวลาจะแสดงเมื่อเวลาตั้งแต่วันประกาศถึงวันยื่นข้อเสนอน้อยกว่าค่านี้ · ค่าเริ่มต้น{" "}
                    {view.defaults.minBidWindowDays} วัน
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      id="minBidWindowDays"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={90}
                      step={1}
                      value={draft.minBidWindowDays}
                      onChange={(e) => update("minBidWindowDays", e.target.value)}
                      aria-invalid={Boolean(errors.minBidWindowDays)}
                      aria-describedby={errors.minBidWindowDays ? "minBidWindowDays-error" : undefined}
                      className={inputClass(Boolean(errors.minBidWindowDays))}
                    />
                    <span className="text-sm text-[var(--color-text-muted)]">วัน</span>
                  </div>
                  {errors.minBidWindowDays && (
                    <p id="minBidWindowDays-error" className="mt-1 text-xs text-[var(--color-danger)]">
                      {errors.minBidWindowDays}
                    </p>
                  )}
                </div>
              </div>

              <fieldset className="pt-5">
                <legend className="text-sm font-semibold text-[var(--color-text)]">ระดับขั้นต่ำที่จะแสดง</legend>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  สัญญาณที่ระดับต่ำกว่านี้จะไม่ถูกเผยแพร่ · ค่าเริ่มต้น{" "}
                  {SEVERITY_OPTIONS.find((o) => o.value === view.defaults.minSeverity)?.label}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {SEVERITY_OPTIONS.map((o) => {
                    const selected = draft.minSeverity === o.value;
                    return (
                      <label
                        key={o.value}
                        className={`flex cursor-pointer flex-col rounded-2xl border px-4 py-3 transition-colors ${
                          selected
                            ? "border-[var(--color-rose-dark)] bg-[var(--color-blush-soft)]"
                            : "border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="minSeverity"
                          value={o.value}
                          checked={selected}
                          onChange={() => update("minSeverity", o.value)}
                          className="sr-only"
                        />
                        <span className="text-sm font-semibold text-[var(--color-text)]">{o.label}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{o.hint}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!changed || !values || saving}
                className="flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                บันทึก
              </button>
              {changed && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setMessage(null);
                    setDraft(toDraft(view.settings));
                  }}
                  className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
              {!showingDefaults && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setMessage(null);
                    setDraft(toDraft(view.defaults));
                  }}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-medium text-[var(--color-rose-dark)] hover:underline disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  ใช้ค่าเริ่มต้น
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
