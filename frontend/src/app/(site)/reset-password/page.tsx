"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowUpRight, Lock } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

function ResetPasswordForm() {
  const { resetPassword } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

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
          ตั้งรหัสผ่านใหม่
        </h1>

        {!token ? (
          <>
            <p className="mt-3 rounded-2xl bg-[var(--color-rose-light)] px-4 py-3 text-sm font-medium text-[var(--color-rose-dark)]">
              ลิงก์นี้ไม่ถูกต้อง กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง
            </p>
            <Link
              href="/forgot-password"
              className="mt-5 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black"
            >
              ขอลิงก์ใหม่
            </Link>
          </>
        ) : done ? (
          <>
            <p className="mt-3 rounded-2xl bg-[var(--color-blush-soft)]/60 px-4 py-3 text-sm leading-relaxed text-[var(--color-text)]">
              ตั้งรหัสผ่านใหม่สำเร็จแล้ว อุปกรณ์ที่เข้าสู่ระบบไว้ก่อนหน้านี้ถูกออกจากระบบทั้งหมด
              กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่
            </p>
            <Link
              href="/login"
              className="mt-5 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black"
            >
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">กรอกรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== confirmPassword) {
                  setError("รหัสผ่านไม่ตรงกัน");
                  return;
                }
                if (password.length < 8) {
                  setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
                  return;
                }
                setError("");
                setSubmitting(true);
                const result = await resetPassword(token, password);
                setSubmitting(false);
                if (!result.ok) {
                  setError(result.error || "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
                  return;
                }
                setDone(true);
              }}
              className="mt-5 flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[var(--color-text)]">รหัสผ่านใหม่</span>
                <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-2 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
                  <Lock size={16} className="shrink-0 text-[var(--color-text-faint)]" />
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-transparent text-sm focus:outline-none"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-[var(--color-text)]">ยืนยันรหัสผ่านใหม่</span>
                <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-white px-3.5 py-2 shadow-[var(--shadow-sm)] transition-colors focus-within:border-[var(--color-rose-dark)]">
                  <Lock size={16} className="shrink-0 text-[var(--color-text-faint)]" />
                  <input
                    required
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-transparent text-sm focus:outline-none"
                  />
                </div>
                {error && <span className="text-xs font-medium text-[var(--color-rose-dark)]">{error}</span>}
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="mt-1 flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-black disabled:opacity-70"
              >
                {submitting ? "กำลังตั้งรหัสผ่านใหม่..." : "ตั้งรหัสผ่านใหม่"}
                {!submitting && <ArrowUpRight size={15} />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
