"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  FileUp,
  ImagePlus,
  Send,
  X,
} from "lucide-react";
import { agencies, categories, Category, formatBudget } from "@/lib/mockData";

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-ink)]/10";
const labelClass = "text-sm font-medium text-[var(--color-text)]";

export default function PostTORPage() {
  const [submitted, setSubmitted] = useState(false);

  const [title, setTitle] = useState("");
  const [agency, setAgency] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);

  function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImage((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function removeCoverImage() {
    setCoverImage((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  if (submitted) {
    return (
      <div className="container-page py-24">
        <div className="mx-auto max-w-sm text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)]">
            <CheckCircle2 size={22} />
          </span>
          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-xl font-bold text-[var(--color-text)]">
            เผยแพร่ประกาศเรียบร้อย
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
            (ตัวอย่างการทำงาน) ประกาศของท่านจะปรากฏบนหน้าค้นหา TOR หลังผู้ดูแลระบบตรวจสอบและอนุมัติ
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              onClick={() => setSubmitted(false)}
              className="rounded-lg bg-[var(--color-ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black transition-colors"
            >
              โพสต์ประกาศอีกฉบับ
            </button>
            <Link
              href="/tor"
              className="rounded-lg border border-[var(--color-border-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-ink)]/30 transition-colors"
            >
              ดูหน้าค้นหา TOR
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-alt)]">
      <div className="container-page py-8 sm:py-10">
        <nav className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Link href="/" className="hover:text-[var(--color-rose-dark)]">แผงควบคุมหน่วยงาน</Link>
          <span>/</span>
          <span className="text-[var(--color-text)]">สร้างประกาศใหม่</span>
        </nav>
        <h1 className="mt-3 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">
          สร้างประกาศ TOR ใหม่
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          กรอกรายละเอียดโครงการเพื่อเผยแพร่ประกาศจัดซื้อจัดจ้าง
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="card divide-y divide-[var(--color-border)] overflow-hidden"
          >
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                ข้อมูลโครงการ
              </p>
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>ชื่อโครงการ</span>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    type="text"
                    placeholder="เช่น จ้างพัฒนาระบบแพลตฟอร์มสืบค้นประกาศจัดซื้อจัดจ้างกลาง"
                    className={inputClass}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>หน่วยงาน</span>
                    <select
                      required
                      value={agency}
                      onChange={(e) => setAgency(e.target.value)}
                      className={inputClass}
                    >
                      <option value="" disabled>เลือกหน่วยงาน</option>
                      {agencies.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={labelClass}>หมวดหมู่</span>
                    <select
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                      className={inputClass}
                    >
                      <option value="" disabled>เลือกหมวดหมู่</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                งบประมาณและกำหนดการ
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>งบประมาณ (บาท)</span>
                  <input
                    required
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    type="number"
                    placeholder="เช่น 8500000"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>วันปิดรับข้อเสนอ</span>
                  <input
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    type="date"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>

            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                รายละเอียดและเอกสาร
              </p>
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>รายละเอียดโครงการ</span>
                  <textarea
                    required
                    rows={4}
                    placeholder="อธิบายขอบเขตงาน คุณสมบัติผู้เสนอราคา และเกณฑ์การพิจารณาโดยสังเขป"
                    className={`${inputClass} resize-none`}
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>รูปภาพหน้าปกประกาศ (ไม่บังคับ)</span>
                  {coverImage ? (
                    <div className="relative h-36 w-full overflow-hidden rounded-lg border border-[var(--color-border)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={coverImage} alt="ตัวอย่างรูปหน้าปก" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={removeCoverImage}
                        aria-label="ลบรูปภาพ"
                        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] px-4 py-4 hover:border-[var(--color-ink)]/40 transition-colors">
                      <ImagePlus size={18} className="shrink-0 text-[var(--color-text-faint)]" />
                      <p className="text-xs text-[var(--color-text-muted)]">
                        คลิกเพื่อเลือกรูปภาพ หรือลากไฟล์มาวาง — ใช้เป็นภาพหน้าปกของประกาศบนหน้าค้นหา TOR
                      </p>
                      <input type="file" accept="image/*" onChange={handleCoverImageChange} className="hidden" />
                    </label>
                  )}
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>เอกสาร TOR ต้นฉบับ (PDF)</span>
                  <div className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] px-4 py-4 hover:border-[var(--color-ink)]/40 transition-colors">
                    {docName ? (
                      <FileText size={18} className="shrink-0 text-[var(--color-rose-dark)]" />
                    ) : (
                      <FileUp size={18} className="shrink-0 text-[var(--color-text-faint)]" />
                    )}
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {docName ? (
                        <span className="font-semibold text-[var(--color-text)]">{docName}</span>
                      ) : (
                        <>
                          ลากไฟล์มาวาง หรือ <span className="font-semibold text-[var(--color-text)] underline underline-offset-2">เลือกไฟล์</span>
                        </>
                      )}
                    </p>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setDocName(e.target.files?.[0]?.name ?? null)}
                      className="hidden"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 bg-[var(--color-surface-alt)] p-6">
              <Link href="/" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                ยกเลิก
              </Link>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-black transition-colors"
              >
                <Send size={15} />
                เผยแพร่ประกาศ
              </button>
            </div>
          </form>

          <aside className="lg:sticky lg:top-24">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
              <Eye size={13} />
              ตัวอย่างที่จะแสดงผล
            </p>
            <div className="card overflow-hidden">
              {coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImage} alt="" className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-[var(--color-surface-alt)] text-xs text-[var(--color-text-faint)]">
                  ยังไม่มีรูปภาพ
                </div>
              )}
              <div className="p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-rose-dark)]">
                  {category || "หมวดหมู่"}
                </span>
                <p className="mt-1.5 text-sm font-bold leading-snug text-[var(--color-text)]">
                  {title || "ชื่อโครงการจะแสดงที่นี่"}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <Building2 size={12} />
                  {agency || "หน่วยงาน"}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                  <p className="font-[family-name:var(--font-heading)] text-base font-extrabold text-[var(--color-rose-dark)]">
                    {budget ? formatBudget(Number(budget)) : "฿0"}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                    <CalendarClock size={12} />
                    {deadline || "ยังไม่ระบุ"}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
              ตัวอย่างนี้อัปเดตตามข้อมูลที่กรอกแบบเรียลไทม์ นี่คือหน้าตาโดยประมาณของประกาศบนหน้าค้นหา TOR
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
