"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import SettingsShell from "@/components/account/SettingsShell";
import { AvatarCard, FieldBlock, SubLabel, SubmitBar, inputClass, useSubmit } from "@/components/account/ui";
import { categories, type Category } from "@/lib/mockData";
import { emptyProfile, useProfile, type BusinessProfile } from "@/lib/useProfile";

function MatchNote() {
  return (
    <div className="flex items-start gap-3 rounded-3xl bg-[var(--color-surface-alt)] p-4 sm:p-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-rose-dark)] shadow-[var(--shadow-sm)]">
        <Sparkles size={16} />
      </span>
      <p className="text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
        เปอร์เซ็นต์ความเหมาะสมที่แสดงตอนนี้เป็นการประเมินเบื้องต้นจากหมวดหมู่และงบประมาณที่คุณกรอกเท่านั้น
        ทีมข้อมูลกำลังออกแบบโมเดล AI เพื่อคำนวณให้แม่นยำขึ้นจากข้อมูลชุดนี้และข้อมูลเพิ่มเติมในอนาคต
      </p>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${inputClass} pr-14 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-faint)]">
        {suffix}
      </span>
    </div>
  );
}

/** The business-profile form; state starts from `initial`, so mount it only once the profile has loaded. */
function BusinessProfileForm({ initial, onboarding }: { initial: BusinessProfile; onboarding: boolean }) {
  const router = useRouter();
  const { saveProfile } = useProfile();
  const [form, setForm] = useState<BusinessProfile>(initial);
  const [savedForm, setSavedForm] = useState<BusinessProfile>(initial);
  const { pending, error, done, setDone, run } = useSubmit();
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  function field<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDone(false);
  }

  function toggleCategory(cat: Category) {
    field(
      "interestedCategories",
      form.interestedCategories.includes(cat)
        ? form.interestedCategories.filter((c) => c !== cat)
        : [...form.interestedCategories, cat]
    );
  }

  async function save() {
    try {
      await saveProfile(form);
      return { ok: true };
    } catch {
      return { ok: false, error: "บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่" };
    }
  }

  return (
    <form
      className="flex flex-col gap-9"
      onSubmit={(e) => {
        e.preventDefault();
        void run(save, () => (onboarding ? router.push("/dashboard") : setSavedForm(form)));
      }}
    >
      <FieldBlock title="ชื่อธุรกิจ / บริษัท">
        <input
          value={form.businessName}
          onChange={(e) => field("businessName", e.target.value)}
          placeholder="เช่น บริษัท ดิจิทัล โซลูชัน จำกัด"
          className={inputClass}
        />
      </FieldBlock>

      <FieldBlock title="ประเภทธุรกิจ / ความเชี่ยวชาญ">
        <input
          value={form.businessType}
          onChange={(e) => field("businessType", e.target.value)}
          placeholder="เช่น พัฒนาซอฟต์แวร์, ที่ปรึกษาไอที"
          className={inputClass}
        />
      </FieldBlock>

      <FieldBlock
        title="หมวดหมู่ TOR ที่สนใจ"
        aside={form.interestedCategories.length ? `เลือกแล้ว ${form.interestedCategories.length} หมวด` : "เลือกได้หลายหมวด"}
        help="ใช้จัดอันดับ TOR ที่แนะนำในหน้าแดชบอร์ด"
      >
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const on = form.interestedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCategory(cat)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${
                  on
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] font-medium text-white"
                    : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
                }`}
              >
                {on && <Check size={14} strokeWidth={2.5} />}
                {cat}
              </button>
            );
          })}
        </div>
      </FieldBlock>

      <FieldBlock title="เทคโนโลยีที่ใช้" help="คั่นแต่ละรายการด้วยจุลภาค ใช้จับคู่กับเทคโนโลยีที่ TOR ต้องการ">
        <textarea
          value={form.technologyStack}
          onChange={(e) => field("technologyStack", e.target.value)}
          placeholder="เช่น React, Node.js, PostgreSQL, Docker"
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </FieldBlock>

      <FieldBlock title="ขนาดธุรกิจ">
        <div className="grid gap-3 sm:grid-cols-3">
          <SubLabel label="ทุนจดทะเบียน">
            <NumberInput value={form.registeredCapital} onChange={(n) => field("registeredCapital", n)} suffix="บาท" />
          </SubLabel>
          <SubLabel label="ประสบการณ์">
            <NumberInput value={form.experienceYears} onChange={(n) => field("experienceYears", n)} suffix="ปี" />
          </SubLabel>
          <SubLabel label="ขนาดทีม">
            <NumberInput value={form.teamSize} onChange={(n) => field("teamSize", n)} suffix="คน" />
          </SubLabel>
        </div>
      </FieldBlock>

      <FieldBlock title="งบประมาณโครงการที่รับได้" help="ใช้ช่วยจับคู่ TOR ที่ขนาดพอดีกับธุรกิจของคุณ">
        <div className="grid gap-3 sm:grid-cols-2">
          <SubLabel label="ต่ำสุด">
            <NumberInput value={form.budgetMin} onChange={(n) => field("budgetMin", n)} suffix="บาท" />
          </SubLabel>
          <SubLabel label="สูงสุด">
            <NumberInput value={form.budgetMax} onChange={(n) => field("budgetMax", n)} suffix="บาท" />
          </SubLabel>
        </div>
      </FieldBlock>

      <FieldBlock title="พื้นที่ให้บริการ">
        <input
          value={form.serviceArea}
          onChange={(e) => field("serviceArea", e.target.value)}
          placeholder="เช่น กรุงเทพมหานครและปริมณฑล"
          className={inputClass}
        />
      </FieldBlock>

      <FieldBlock title="ใบรับรอง / มาตรฐานที่มี" help="คั่นแต่ละรายการด้วยจุลภาค">
        <textarea
          value={form.certifications}
          onChange={(e) => field("certifications", e.target.value)}
          placeholder="เช่น ISO/IEC 27001, PMP, AWS Certified"
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </FieldBlock>

      <SubmitBar
        pending={pending}
        disabled={!onboarding && !dirty}
        label={onboarding ? "บันทึกและไปแดชบอร์ด" : "บันทึก"}
        icon={onboarding ? <ArrowRight size={15} /> : undefined}
        error={error}
        done={done}
        doneText="บันทึกโปรไฟล์ธุรกิจแล้ว"
      />
    </form>
  );
}

function ProfileContent() {
  const router = useRouter();
  const onboarding = useSearchParams().get("onboarding") === "1";
  const { profile, ready } = useProfile();
  const formEl = ready && <BusinessProfileForm initial={profile ?? emptyProfile} onboarding={onboarding} />;

  if (onboarding) {
    // First visit after sign-up: a focused page without the settings menu.
    return (
      <RequireAuth>
        <div className="container-page py-10">
          <div className="mx-auto max-w-[640px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="eyebrow">ยินดีต้อนรับ</span>
                <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
                  ตั้งค่าโปรไฟล์ธุรกิจ
                </h1>
                <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                  กรอกครั้งเดียว ใช้ประเมินว่า TOR แต่ละงานเหมาะกับธุรกิจคุณแค่ไหน
                </p>
              </div>
              <button
                onClick={() => router.push("/dashboard")}
                className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
              >
                ข้ามไปก่อน
              </button>
            </div>
            <div className="mt-8 flex flex-col gap-9">
              <AvatarCard />
              <MatchNote />
              {formEl}
            </div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <SettingsShell active="business" title="โปรไฟล์ธุรกิจ" showDetailOnMobile>
      <div className="flex flex-col gap-9">
        <MatchNote />
        {formEl}
      </div>
    </SettingsShell>
  );
}

export default function ProfilePage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <ProfileContent />
    </Suspense>
  );
}
