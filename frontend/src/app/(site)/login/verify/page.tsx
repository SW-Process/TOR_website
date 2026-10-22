"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowUpRight, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { safeNextPath } from "@/lib/safeNextPath";

/**
 * Second sign-in step (two-step verification): after a correct password, or after
 * Google, the account still needs a 6-digit code from its authenticator app, or one of
 * its recovery codes. The backend holds the half-finished sign-in for 5 minutes.
 */
function VerifyForm() {
  const router = useRouter();
  const { verifyMfa } = useAuth();
  const nextParam = useSearchParams().get("next");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restart, setRestart] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await verifyMfa(code);
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "ยืนยันตัวตนไม่สำเร็จ");
      setRestart(!!result.restart);
      setCode("");
      return;
    }
    router.replace(safeNextPath(nextParam));
  }

  return (
    <div className="relative flex min-h-[calc(100svh-var(--header-h))] flex-1 items-center bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_45%,_var(--color-blush-soft)_100%)]">
      <div className="container-page relative py-14 sm:py-20">
        <div className="mx-auto w-full max-w-sm rounded-[2rem] border border-white/60 bg-white/70 p-7 shadow-[var(--shadow-lg)] backdrop-blur-2xl sm:p-9">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--color-ink)] shadow-[var(--shadow-sm)]">
            <ShieldCheck size={22} />
          </span>
          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
            ยืนยันตัวตนสองขั้นตอน
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {useRecovery
              ? "กรอกรหัสสำรองที่คุณบันทึกไว้ตอนเปิดใช้งาน แต่ละรหัสใช้ได้ครั้งเดียว"
              : "เปิดแอปยืนยันตัวตน (เช่น Google Authenticator) แล้วกรอกรหัส 6 หลักของ TOR Checker"}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex items-center gap-2.5 rounded-2xl border border-white bg-white/90 px-3.5 py-3 shadow-[var(--shadow-sm)] focus-within:border-[var(--color-rose-dark)]">
              <KeyRound size={16} className="shrink-0 text-[var(--color-text-faint)]" />
              <input
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={useRecovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                maxLength={useRecovery ? 13 : 7}
                placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
                aria-label={useRecovery ? "รหัสสำรอง" : "รหัส 6 หลัก"}
                className="w-full bg-transparent text-base tracking-[0.2em] focus:outline-none"
              />
            </label>
            {error && (
              <p className="rounded-xl bg-[var(--color-rose-light)] px-3 py-2 text-xs font-medium text-[var(--color-rose-dark)]" role="alert">
                {error}{" "}
                {restart && (
                  <Link href="/login" className="font-semibold underline">
                    กลับไปเข้าสู่ระบบ
                  </Link>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || restart}
              className="flex items-center justify-center gap-2.5 rounded-full bg-[var(--color-ink)] py-3 text-sm font-semibold text-white shadow-[var(--shadow-glow)] hover:bg-black disabled:opacity-70"
            >
              {busy ? "กำลังตรวจสอบ..." : "ยืนยัน"}
              {!busy && <ArrowUpRight size={15} />}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode("");
              setError("");
            }}
            className="mt-5 w-full text-center text-xs font-semibold text-[var(--color-rose-dark)] hover:underline"
          >
            {useRecovery ? "ใช้รหัสจากแอปยืนยันตัวตนแทน" : "เข้าถึงแอปไม่ได้? ใช้รหัสสำรอง"}
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
            ไม่มีทั้งแอปและรหัสสำรอง? ติดต่อผู้ดูแลระบบผ่านศูนย์ช่วยเหลือเพื่อยืนยันตัวตน
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
