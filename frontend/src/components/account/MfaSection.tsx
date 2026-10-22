"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Download, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { disableMfa, enableMfa, regenerateRecoveryCodes, startMfaSetup, type MfaSetup } from "@/lib/mfaApi";
import { FieldBlock, inputClass } from "./ui";

const buttonDark =
  "flex items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-60";
const buttonLight =
  "flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-60";

/** The recovery codes, shown once, with copy and download. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `รหัสสำรอง TOR Checker (ใช้ได้รหัสละครั้ง)\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] p-5">
      <p className="text-sm font-semibold text-[var(--color-text)]">บันทึกรหัสสำรองไว้ในที่ปลอดภัย</p>
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        ใช้รหัสเหล่านี้เข้าสู่ระบบได้หากเข้าถึงแอปยืนยันตัวตนไม่ได้ แต่ละรหัสใช้ได้ครั้งเดียว รหัสจะแสดงเพียงครั้งนี้เท่านั้น
      </p>
      <ol className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded-xl bg-[var(--color-surface-alt)] px-3 py-2 text-center tracking-wider">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonLight}
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
        <a
          className={buttonLight}
          download="tor-checker-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
        >
          <Download size={15} />
          ดาวน์โหลด
        </a>
        <button type="button" className={buttonDark} onClick={onDone}>
          บันทึกแล้ว
        </button>
      </div>
    </div>
  );
}

/**
 * "ยืนยันตัวตนสองขั้นตอน": set up an authenticator app (scan the QR code, confirm one
 * code, keep the recovery codes), replace the recovery codes, or turn it off. Admins
 * can't turn it off: the admin panel requires it.
 */
export default function MfaSection() {
  const { user, refresh, logoutOthers } = useAuth();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);

  if (!user) return null;

  async function act<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, then: (data: T) => void) {
    setBusy(true);
    setError("");
    setNotice("");
    const result = await fn();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    then(result.data);
  }

  if (codes) {
    return (
      <div className="flex flex-col gap-6">
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
            void refresh();
          }}
        />
        {/* ASVS 7.4.3: after changing an authentication factor, offer to end the other sessions. */}
        <div className="rounded-3xl bg-[var(--color-surface-alt)] p-5">
          <p className="text-sm text-[var(--color-text)]">ต้องการให้อุปกรณ์อื่นที่เข้าสู่ระบบอยู่ ออกจากระบบด้วยหรือไม่?</p>
          <button
            type="button"
            disabled={busy}
            className={`${buttonLight} mt-3`}
            onClick={() => void act(async () => {
              const r = await logoutOthers();
              return r.ok ? { ok: true as const, data: null } : { ok: false as const, error: r.error ?? "ไม่สำเร็จ" };
            }, () => setNotice("ออกจากระบบอุปกรณ์อื่นแล้ว"))}
          >
            ออกจากระบบอุปกรณ์อื่นทั้งหมด
          </button>
          {notice && <p className="mt-2 text-xs text-[var(--color-success)]">{notice}</p>}
        </div>
      </div>
    );
  }

  if (user.mfaEnabled) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex items-start gap-4 rounded-3xl bg-[var(--color-surface-alt)] p-5">
          <ShieldCheck size={22} className="mt-0.5 shrink-0 text-[var(--color-success)]" />
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-text)]">เปิดใช้งานอยู่</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
              ทุกครั้งที่เข้าสู่ระบบ ต้องกรอกรหัส 6 หลักจากแอปยืนยันตัวตนด้วย · เหลือรหัสสำรอง {user.recoveryCodesLeft} รหัส
            </p>
          </div>
        </div>

        <FieldBlock title="รหัสสำรอง" help="สร้างชุดใหม่หากรหัสเดิมหาย หรือใกล้หมด รหัสชุดเดิมทั้งหมดจะใช้ไม่ได้ทันที">
          <button type="button" disabled={busy} className={buttonLight} onClick={() => void act(regenerateRecoveryCodes, (d) => setCodes(d.recoveryCodes))}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            สร้างรหัสสำรองชุดใหม่
          </button>
        </FieldBlock>

        {!user.mfaRequired && (
          <FieldBlock title="ปิดการยืนยันตัวตนสองขั้นตอน" help="บัญชีจะเหลือการป้องกันเพียงรหัสผ่านอย่างเดียว">
            {confirmOff ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="flex items-center gap-2 rounded-full bg-[var(--color-rose-dark)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => void act(disableMfa, () => {
                    setConfirmOff(false);
                    void refresh();
                  })}
                >
                  <ShieldOff size={15} />
                  ยืนยัน ปิดการใช้งาน
                </button>
                <button type="button" className={buttonLight} onClick={() => setConfirmOff(false)}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button type="button" className={buttonLight} onClick={() => setConfirmOff(true)}>
                ปิดการใช้งาน
              </button>
            )}
          </FieldBlock>
        )}
        {error && <p className="text-xs font-medium text-[var(--color-rose-dark)]">{error}</p>}
      </div>
    );
  }

  if (setup) {
    return (
      <form
        className="flex flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => enableMfa(code), (d) => {
            setSetup(null);
            setCode("");
            setCodes(d.recoveryCodes);
          });
        }}
      >
        <FieldBlock title="1. สแกน QR code ด้วยแอปยืนยันตัวตน" help="เช่น Google Authenticator, Microsoft Authenticator หรือ 1Password">
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-[var(--color-border)] p-5 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL, nothing to optimise */}
            <img
              src={`data:image/svg+xml;base64,${btoa(setup.qrSvg)}`}
              alt="QR code สำหรับตั้งค่าแอปยืนยันตัวตน"
              width={168}
              height={168}
              className="rounded-xl bg-white"
            />
            <div className="min-w-0 text-xs leading-relaxed text-[var(--color-text-muted)]">
              สแกนไม่ได้? กรอกรหัสนี้ในแอปเอง
              <code className="mt-2 block break-all rounded-xl bg-[var(--color-surface-alt)] px-3 py-2 font-mono text-[13px] tracking-wider text-[var(--color-text)]">
                {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
            </div>
          </div>
        </FieldBlock>
        <FieldBlock title="2. กรอกรหัส 6 หลักที่แอปแสดง">
          <input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className={`${inputClass} tracking-[0.3em]`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        </FieldBlock>
        {error && <p className="text-xs font-medium text-[var(--color-rose-dark)]">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || code.replace(/\s/g, "").length !== 6} className={buttonDark}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            เปิดใช้งาน
          </button>
          <button type="button" className={buttonLight} onClick={() => setSetup(null)}>
            ยกเลิก
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {user.mfaRequired && (
        <p className="rounded-2xl bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
          บัญชีผู้ดูแลระบบต้องเปิดการยืนยันตัวตนสองขั้นตอนก่อนใช้งานหน้าผู้ดูแลระบบ
        </p>
      )}
      <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
        เพิ่มความปลอดภัยให้บัญชี: นอกจากรหัสผ่านแล้ว ทุกครั้งที่เข้าสู่ระบบต้องกรอกรหัส 6 หลักจากแอปยืนยันตัวตนบนมือถือด้วย
        แม้รหัสผ่านรั่วไหล ผู้อื่นก็เข้าบัญชีไม่ได้
      </p>
      {error && <p className="text-xs font-medium text-[var(--color-rose-dark)]">{error}</p>}
      <button type="button" disabled={busy} className={`${buttonDark} self-start`} onClick={() => void act(startMfaSetup, setSetup)}>
        {busy && <Loader2 size={15} className="animate-spin" />}
        เปิดใช้งานการยืนยันตัวตนสองขั้นตอน
      </button>
    </div>
  );
}
