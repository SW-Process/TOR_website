"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Lock, Mail, User } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";

export default function SignUpPage() {
  const router = useRouter();
  const [signingUp, setSigningUp] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-1 items-start justify-center overflow-hidden bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_45%,_var(--color-blush-soft)_100%)] px-4 pt-12 pb-10 sm:pt-16">
      <div
        className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(34,26,24,0.18)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black_10%,transparent_75%)]"
        aria-hidden
      />
      <div className="animate-blob-a pointer-events-none absolute -top-16 -right-10 h-96 w-96 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-80" aria-hidden />
      <div
        className="animate-blob-b pointer-events-none absolute bottom-0 -left-16 h-80 w-80 rounded-full bg-[var(--color-blush-deep)] blur-3xl opacity-70"
        style={{ animationDelay: "-3s" }}
        aria-hidden
      />

      <div className="relative w-full max-w-sm rounded-[2rem] border border-white/60 bg-[linear-gradient(160deg,_#ffffff_0%,_#ffffff_45%,_var(--color-blush-soft)_100%)] p-7 shadow-[var(--shadow-lg)] sm:p-9">
        <span className="eyebrow">สำหรับผู้ใช้ทั่วไป</span>
        <h1 className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
          สมัครสมาชิก
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          สร้างบัญชีเพื่อบันทึก TOR ที่สนใจและรับการแจ้งเตือนทางอีเมล
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSigningUp(true);
            setTimeout(() => router.push("/"), 700);
          }}
          className="mt-7 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">ชื่อ</span>
            <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
              <User size={16} className="shrink-0 text-[var(--color-text-faint)]" />
              <input
                required
                type="text"
                placeholder="ชื่อ-นามสกุล"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">อีเมล</span>
            <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
              <Mail size={16} className="shrink-0 text-[var(--color-text-faint)]" />
              <input
                required
                type="email"
                placeholder="you@email.com"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-text)]">รหัสผ่าน</span>
            <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
              <Lock size={16} className="shrink-0 text-[var(--color-text-faint)]" />
              <input
                required
                type="password"
                placeholder="••••••••"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={signingUp}
            className="mt-1.5 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-3 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black disabled:opacity-70"
          >
            {signingUp ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
            {!signingUp && <ArrowUpRight size={15} />}
          </button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          <span className="text-xs text-[var(--color-text-faint)]">หรือ</span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-full border border-[var(--color-border)] bg-white py-3 text-sm font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-blush-soft)]/40"
        >
          <GoogleIcon size={18} />
          สมัครสมาชิกด้วย Google
        </button>

        <p className="mt-6 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="font-semibold text-[var(--color-rose-dark)] hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
