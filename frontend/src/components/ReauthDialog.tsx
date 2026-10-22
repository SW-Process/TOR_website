"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";
import { API_BASE } from "@/lib/api";
import { setReauthHandler, type ReauthMethod } from "@/lib/reauth";

const inputClass =
  "w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-ink)]/40 focus:bg-white focus:outline-none";

interface Pending {
  methods: ReauthMethod[];
  resolve: (ok: boolean) => void;
}

/**
 * Asks for the password (and authenticator code, when MFA is on) before a sensitive
 * account change, confirms them on POST /api/auth/reauth, and lets the change go ahead.
 * Mounted once in the root layout; lib/api.ts opens it on a `reauth_required` answer.
 */
export default function ReauthDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReauthHandler(
      (methods) =>
        new Promise<boolean>((resolve) => {
          setPassword("");
          setCode("");
          setError("");
          setPending({ methods, resolve });
        })
    );
    return () => setReauthHandler(null);
  }, []);

  useEffect(() => {
    if (pending) firstField.current?.focus();
  }, [pending]);

  if (!pending) return null;
  const needsPassword = pending.methods.includes("password");
  const needsCode = pending.methods.includes("totp");
  const googleOnly = pending.methods.includes("google");

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Plain fetch, not apiFetch: this request must never open the dialog itself.
      const res = await fetch(`${API_BASE}/api/auth/reauth`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(needsPassword ? { currentPassword: password } : {}),
          ...(needsCode ? { mfaCode: code.replace(/\s/g, "") } : {}),
        }),
      });
      if (res.ok) return close(true);
      setError(res.status === 429 ? "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่" : "รหัสผ่านหรือรหัสยืนยันไม่ถูกต้อง");
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={() => !busy && close(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-[var(--shadow-lg)] sm:p-7"
      >
        <button
          type="button"
          aria-label="ปิด"
          onClick={() => close(false)}
          disabled={busy}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] disabled:opacity-40"
        >
          <X size={17} />
        </button>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
          <ShieldCheck size={20} />
        </span>
        <h2 id="reauth-title" className="mt-4 font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-text)]">
          ยืนยันว่าเป็นคุณ
        </h2>

        {googleOnly ? (
          <>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
              การเปลี่ยนแปลงนี้ต้องยืนยันตัวตนอีกครั้ง กรุณาเข้าสู่ระบบด้วย Google ใหม่ แล้วกลับมาทำรายการนี้ภายใน 10 นาที
            </p>
            <button
              type="button"
              onClick={() => {
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = `${API_BASE}/api/auth/google`;
              }}
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-full border border-[var(--color-border)] bg-white py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
            >
              <GoogleIcon size={18} />
              เข้าสู่ระบบด้วย Google อีกครั้ง
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-1.5 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
              เพื่อความปลอดภัย กรุณายืนยันตัวตนก่อนเปลี่ยนการตั้งค่าบัญชี ยืนยันแล้วทำรายการต่อได้ 10 นาที
            </p>
            {needsPassword && (
              <input
                ref={firstField}
                type="password"
                required
                autoComplete="current-password"
                placeholder="รหัสผ่านปัจจุบัน"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {needsCode && (
              <input
                ref={needsPassword ? undefined : firstField}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="รหัส 6 หลักจากแอปยืนยันตัวตน หรือรหัสสำรอง"
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
            {error && <p className="rounded-xl bg-[var(--color-rose-light)] px-3 py-2 text-xs font-medium text-[var(--color-rose-dark)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-70"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              ยืนยัน
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
