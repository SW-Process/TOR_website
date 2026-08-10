"use client";

import { useState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";

export default function AlertSignup() {
  const [submitted, setSubmitted] = useState(false);
  const [keyword, setKeyword] = useState("");

  return (
    <div className="card p-6 sm:p-10 bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_55%,_var(--color-blush-soft)_100%)] border-none">
      <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
        <div className="flex items-start gap-4 md:flex-1">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-rose-dark)]">
            <BellRing size={20} />
          </span>
          <div>
            <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)]">
              รับแจ้งเตือน TOR ที่ตรงกับคุณ
            </h3>
            <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
              ตั้งค่าคำสำคัญ หมวดหมู่ หรือหน่วยงานที่สนใจ ระบบจะแจ้งเตือนทันทีเมื่อมีประกาศใหม่ตรงเงื่อนไข
            </p>
          </div>
        </div>

        {submitted ? (
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-[var(--color-text)] md:w-auto">
            <CheckCircle2 size={18} className="text-[var(--color-success)]" />
            บันทึกคำสำคัญ &quot;{keyword}&quot; เรียบร้อย (ตัวอย่างการทำงาน)
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (keyword.trim()) setSubmitted(true);
            }}
            className="flex flex-col sm:flex-row gap-2 md:w-[420px]"
          >
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="เช่น พัฒนาเว็บแอป, ระบบคลาวด์"
              className="flex-1 rounded-full border border-transparent bg-white px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-ink)]"
            />
            <button type="submit" className="btn-pill btn-pill-primary px-4 py-2.5 text-sm whitespace-nowrap">
              ตั้งการแจ้งเตือน
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
