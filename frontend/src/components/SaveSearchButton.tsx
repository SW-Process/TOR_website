"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BookmarkPlus, Check, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { createSavedSearch, MAX_SAVED_SEARCH_NAME } from "@/lib/savedSearchApi";
import { hasSearchCriteria, suggestSearchName, toSavedSearchFilters, type TorFilters } from "@/lib/torSearch";

const pillClass =
  "btn-pill border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-ink)] transition-colors shrink-0";

/**
 * "บันทึกการค้นหา" on the search page (FR-28): saves the current keyword and filters as one
 * of the vendor's saved searches through POST /api/vendor/profile/saved-searches. Signed-out
 * visitors get a link to sign in and come back; admins don't see it (the API is vendor-only).
 */
export default function SaveSearchButton({ filters }: { filters: TorFilters }) {
  const { user, ready, isLoggedIn } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [alerts, setAlerts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The criteria last saved, so the button reads "บันทึกแล้ว" until the search changes. */
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const criteriaKey = JSON.stringify(toSavedSearchFilters(filters));
  const canSave = hasSearchCriteria(filters);
  const justSaved = savedKey === criteriaKey;

  useEffect(() => {
    if (!open) return;
    nameRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ready || user?.role === "admin") return null;

  if (!isLoggedIn) {
    const query = searchParams.toString();
    const back = `${pathname}${query ? `?${query}` : ""}`;
    return (
      <Link href={`/login?next=${encodeURIComponent(back)}`} className={pillClass}>
        <BookmarkPlus size={15} />
        เข้าสู่ระบบเพื่อบันทึกการค้นหา
      </Link>
    );
  }

  function openDialog() {
    setName(suggestSearchName(filters));
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("กรุณาตั้งชื่อการค้นหา");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createSavedSearch({
      name: trimmed,
      filters: toSavedSearchFilters(filters),
      alertsEnabled: alerts,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSavedKey(criteriaKey);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={openDialog}
        disabled={!canSave || justSaved}
        title={canSave ? undefined : "พิมพ์คำค้นหาหรือเลือกตัวกรองก่อน"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${pillClass} disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-[var(--color-border)]`}
      >
        {justSaved ? <Check size={15} className="text-[var(--color-success)]" /> : <BookmarkPlus size={15} />}
        {justSaved ? "บันทึกการค้นหาแล้ว" : "บันทึกการค้นหา"}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {justSaved ? "บันทึกการค้นหาแล้ว" : ""}
      </p>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-x-4 top-24 z-50 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80"
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p id={titleId} className="text-sm font-semibold text-[var(--color-text)]">
                    บันทึกการค้นหานี้
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    เก็บคำค้นหาและตัวกรองไว้ใช้ซ้ำ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="rounded-full p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-blush-soft)]"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--color-text)]">
                ชื่อการค้นหา
                <input
                  ref={nameRef}
                  id="saved-search-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_SAVED_SEARCH_NAME}
                  required
                  className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-normal focus:border-[var(--color-ink)] focus:outline-none"
                />
              </label>

              <label className="flex items-start gap-2 text-xs text-[var(--color-text)]">
                <input
                  id="saved-search-alerts"
                  type="checkbox"
                  checked={alerts}
                  onChange={(e) => setAlerts(e.target.checked)}
                  className="mt-0.5 accent-[var(--color-rose-dark)]"
                />
                <span>
                  แจ้งเตือนเมื่อมี TOR ใหม่ตรงกับการค้นหานี้
                  <span className="block text-[var(--color-text-muted)]">ในเว็บไซต์ และทางอีเมลถ้าเปิดรับอีเมลไว้</span>
                </span>
              </label>

              {error && (
                <p role="alert" className="text-xs text-[var(--color-danger)]">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-pill px-3.5 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  ยกเลิก
                </button>
                <button type="submit" disabled={saving} className="btn-pill btn-pill-primary px-4 py-2 text-sm disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
