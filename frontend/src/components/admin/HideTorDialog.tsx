"use client";

import { useEffect, useRef } from "react";
import { Building2, EyeOff, Hash, Loader2, X } from "lucide-react";

/** Confirm hiding a TOR from the public site (admin records page). */
export default function HideTorDialog({
  title,
  agency,
  projectCode,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  agency: string;
  projectCode: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe choice first, and let Esc back out (unless a request is in flight).
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hide-tor-title"
        aria-describedby="hide-tor-desc"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-[1.75rem] bg-white p-6 sm:p-7 shadow-[var(--shadow-lg)]"
      >
        <button
          type="button"
          aria-label="ปิด"
          onClick={onCancel}
          disabled={busy}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] disabled:opacity-40"
        >
          <X size={17} />
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
          <EyeOff size={20} />
        </span>

        <h2
          id="hide-tor-title"
          className="mt-4 font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-text)]"
        >
          ซ่อน TOR นี้จากหน้าเว็บ?
        </h2>
        <p id="hide-tor-desc" className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
          ผู้ใช้ทั่วไปจะค้นหาและเปิดดู TOR นี้ไม่ได้อีก ข้อมูลยังเก็บไว้ในฐานข้อมูล ไม่ได้ถูกลบ
        </p>

        <div className="mt-5 rounded-2xl bg-[var(--color-surface-alt)] p-4">
          <p className="text-sm font-semibold leading-snug text-[var(--color-text)] line-clamp-3">{title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
            {agency && (
              <span className="flex items-center gap-1.5">
                <Building2 size={12} />
                {agency}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Hash size={12} />
              {projectCode}
            </span>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-pill border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-ink)]/40 disabled:opacity-40"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-pill bg-[var(--color-danger)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <EyeOff size={15} />}
            {busy ? "กำลังซ่อน..." : "ซ่อนจากหน้าเว็บ"}
          </button>
        </div>
      </div>
    </div>
  );
}
