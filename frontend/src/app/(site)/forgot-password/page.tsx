"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Mail } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Shown after a successful submit regardless of whether the email has an account,
  // matching the backend's response — this page never reveals which emails are registered.
  const [sent, setSent] = useState(false);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_45%,_var(--color-blush-soft)_100%)] px-4 py-8">
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

      <div className="relative w-full max-w-sm rounded-[2rem] border border-white/60 bg-[linear-gradient(160deg,_#ffffff_0%,_#ffffff_45%,_var(--color-blush-soft)_100%)] p-6 shadow-[var(--shadow-lg)] sm:p-7">
        <span className="eyebrow">สำหรับผู้ใช้ทั่วไป</span>
        <h1 className="mt-1.5 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
          ลืมรหัสผ่าน
        </h1>

        {sent ? (
          <>
            <p className="mt-3 rounded-2xl bg-[var(--color-blush-soft)]/60 px-4 py-3 text-sm leading-relaxed text-[var(--color-text)]">
              หากอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว
              กรุณาตรวจสอบกล่องจดหมาย (รวมถึงถังขยะ/สแปม) ลิงก์จะใช้ได้ภายใน 1 ชั่วโมง
            </p>
            <Link
              href="/login"
              className="mt-5 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black"
            >
              กลับไปเข้าสู่ระบบ
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              กรอกอีเมลที่ใช้สมัครสมาชิก เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setSending(true);
                const result = await forgotPassword(email);
                setSending(false);
                if (!result.ok) {
                  setError(result.error || "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
                  return;
                }
                setSent(true);
              }}
              className="mt-5 flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[var(--color-text)]">อีเมล</span>
                <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-2 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
                  <Mail size={16} className="shrink-0 text-[var(--color-text-faint)]" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full bg-transparent text-sm focus:outline-none"
                  />
                </div>
              </label>
              {error && <span className="text-xs font-medium text-[var(--color-rose-dark)]">{error}</span>}
              <button
                type="submit"
                disabled={sending}
                className="mt-1 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black disabled:opacity-70"
              >
                {sending ? "กำลังส่ง..." : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
                {!sending && <ArrowUpRight size={15} />}
              </button>
            </form>

            <p className="mt-4 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
              นึกรหัสผ่านออกแล้ว?{" "}
              <Link href="/login" className="font-semibold text-[var(--color-rose-dark)] hover:underline">
                เข้าสู่ระบบ
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
