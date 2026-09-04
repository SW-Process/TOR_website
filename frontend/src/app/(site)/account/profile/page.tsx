"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  MapPin,
  PartyPopper,
  Sparkles,
  Tags,
  Wallet,
} from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { categories, type Category } from "@/lib/mockData";
import { emptyProfile, useProfile, type BusinessProfile } from "@/lib/useProfile";

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Building2;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
        <Icon size={13} />
      </span>
      <div>
        <h3 className="text-[13px] font-bold text-[var(--color-text)]">{title}</h3>
        {subtitle && <p className="text-[11px] text-[var(--color-text-faint)]">{subtitle}</p>}
      </div>
    </div>
  );
}

const inputClass =
  "rounded-xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm shadow-[var(--shadow-sm)] transition-colors focus:outline-none focus:border-[var(--color-rose-dark)]";

export default function ProfilePage() {
  const router = useRouter();
  const { profile, ready, saveProfile } = useProfile();
  const [form, setForm] = useState<BusinessProfile>(emptyProfile);
  const [saved, setSaved] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  useEffect(() => {
    if (ready) setForm(profile ?? emptyProfile);
  }, [ready, profile]);

  useEffect(() => {
    setIsOnboarding(new URLSearchParams(window.location.search).get("onboarding") === "1");
  }, []);

  function toggleCategory(cat: Category) {
    setForm((prev) => ({
      ...prev,
      interestedCategories: prev.interestedCategories.includes(cat)
        ? prev.interestedCategories.filter((c) => c !== cat)
        : [...prev.interestedCategories, cat],
    }));
  }

  function field<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const formEl = !ready ? null : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveProfile(form);
        if (isOnboarding) {
          router.push("/dashboard");
          return;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }}
      className={`flex flex-col gap-5 ${
        isOnboarding
          ? "rounded-[1.75rem] border border-white/60 bg-white/80 p-5 shadow-[var(--shadow-lg)] backdrop-blur-2xl sm:p-6"
          : "card p-5 sm:p-6"
      }`}
    >
      <section className="flex flex-col gap-3">
        <SectionHeading icon={Building2} title="ข้อมูลธุรกิจ" />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">ชื่อธุรกิจ / บริษัท</span>
            <input
              value={form.businessName}
              onChange={(e) => field("businessName", e.target.value)}
              placeholder="เช่น บริษัท ดิจิทัล โซลูชัน จำกัด"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">ประเภทธุรกิจ / ความเชี่ยวชาญ</span>
            <input
              value={form.businessType}
              onChange={(e) => field("businessType", e.target.value)}
              placeholder="เช่น พัฒนาซอฟต์แวร์, ที่ปรึกษาไอที"
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <div className="h-px bg-[var(--color-border)]" />

      <section className="flex flex-col gap-3">
        <SectionHeading icon={Tags} title="หมวดหมู่ TOR ที่สนใจ" subtitle="เลือกได้มากกว่า 1 หมวด" />
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const active = form.interestedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--color-ink)] text-white"
                    : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-[var(--color-border)]" />

      <section className="flex flex-col gap-3">
        <SectionHeading icon={Wallet} title="ขนาดธุรกิจและงบประมาณ" subtitle="ใช้ช่วยจับคู่ TOR ที่ขนาดพอดีกับคุณ" />
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">ทุนจดทะเบียน (บาท)</span>
            <input
              type="number"
              min={0}
              value={form.registeredCapital || ""}
              onChange={(e) => field("registeredCapital", Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">ปีประสบการณ์</span>
            <input
              type="number"
              min={0}
              value={form.experienceYears || ""}
              onChange={(e) => field("experienceYears", Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">ขนาดทีม (คน)</span>
            <input
              type="number"
              min={0}
              value={form.teamSize || ""}
              onChange={(e) => field("teamSize", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">งบประมาณโครงการที่รับได้ (ต่ำสุด)</span>
            <input
              type="number"
              min={0}
              value={form.budgetMin || ""}
              onChange={(e) => field("budgetMin", Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">งบประมาณโครงการที่รับได้ (สูงสุด)</span>
            <input
              type="number"
              min={0}
              value={form.budgetMax || ""}
              onChange={(e) => field("budgetMax", Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <div className="h-px bg-[var(--color-border)]" />

      <section className="flex flex-col gap-3">
        <SectionHeading icon={MapPin} title="พื้นที่ให้บริการ" />
        <input
          value={form.serviceArea}
          onChange={(e) => field("serviceArea", e.target.value)}
          placeholder="เช่น กรุงเทพมหานครและปริมณฑล"
          className={inputClass}
        />
      </section>

      <div className="h-px bg-[var(--color-border)]" />

      <section className="flex flex-col gap-3">
        <SectionHeading icon={Award} title="ใบรับรอง / มาตรฐานที่มี" />
        <textarea
          value={form.certifications}
          onChange={(e) => field("certifications", e.target.value)}
          placeholder="เช่น ISO/IEC 27001, PMP, AWS Certified (คั่นด้วยจุลภาค)"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </section>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="btn-pill btn-pill-primary px-5 py-2.5 text-sm">
          {isOnboarding ? "บันทึกและไปแดชบอร์ด" : "บันทึกโปรไฟล์"}
          {isOnboarding && <ArrowRight size={14} />}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-success)]">
            <CheckCircle2 size={16} />
            บันทึกแล้ว
          </span>
        )}
      </div>
    </form>
  );

  const matchNote = (
    <div
      className={`flex items-start gap-2.5 p-3.5 sm:p-4 ${
        isOnboarding
          ? "rounded-2xl bg-white/60 backdrop-blur"
          : "card border-none bg-[var(--color-rose-light)]"
      }`}
    >
      <Sparkles size={16} className="mt-0.5 shrink-0 text-[var(--color-rose-dark)]" />
      <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
        เปอร์เซ็นต์ความเหมาะสมที่แสดงตอนนี้เป็นการประเมินเบื้องต้นจากหมวดหมู่และงบประมาณที่คุณกรอกเท่านั้น
        ทีมข้อมูลกำลังออกแบบโมเดล AI เพื่อคำนวณให้แม่นยำขึ้นจากข้อมูลชุดนี้และข้อมูลเพิ่มเติมในอนาคต
      </p>
    </div>
  );

  if (isOnboarding) {
    return (
      <RequireAuth>
        <div className="relative flex-1 overflow-hidden bg-[linear-gradient(135deg,_#e9eaec_0%,_#eff0f1_50%,_#f5f5f6_100%)]">
          <div
            className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(34,26,24,0.1)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black_10%,transparent_75%)]"
            aria-hidden
          />
          <div className="animate-blob-a pointer-events-none absolute -top-16 -right-10 h-96 w-96 rounded-full bg-white blur-3xl opacity-70" aria-hidden />
          <div
            className="animate-blob-b pointer-events-none absolute top-1/3 -left-16 h-80 w-80 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-40"
            style={{ animationDelay: "-3s" }}
            aria-hidden
          />

          <div className="container-page relative py-8 sm:py-10">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--color-rose-dark)] shadow-[var(--shadow-sm)]">
                    <PartyPopper size={17} />
                  </span>
                  <span className="eyebrow mt-2.5 block">ยินดีต้อนรับ</span>
                  <h1 className="mt-1 font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold leading-tight text-[var(--color-text)]">
                    มาตั้งค่าโปรไฟล์ธุรกิจกันก่อน
                  </h1>
                  <p className="mt-2 max-w-md text-xs text-[var(--color-ink-soft)] leading-relaxed">
                    กรอกครั้งเดียว ใช้ประเมินว่า TOR แต่ละงานเหมาะกับธุรกิจคุณแค่ไหนตั้งแต่ครั้งแรกที่เข้าใช้งาน
                  </p>
                </div>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="shrink-0 rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] backdrop-blur transition-colors hover:bg-white hover:text-[var(--color-text)] whitespace-nowrap"
                >
                  ข้ามไปก่อน
                </button>
              </div>

              <div className="mt-5">{matchNote}</div>
              <div className="mt-4">{formEl}</div>
            </div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="container-page py-8">
        <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
          โปรไฟล์ธุรกิจ
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1.5 max-w-2xl">
          กรอกข้อมูลธุรกิจของคุณเพื่อให้ระบบช่วยประเมินว่า TOR แต่ละงานเหมาะกับคุณแค่ไหน
          ข้อมูลนี้จัดเก็บไว้ในเบราว์เซอร์นี้เท่านั้น
        </p>

        <div className="mt-6 max-w-3xl">{matchNote}</div>
        <div className="mt-6 max-w-3xl">{formEl}</div>
      </div>
    </RequireAuth>
  );
}
