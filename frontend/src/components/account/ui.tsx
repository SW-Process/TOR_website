"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth, type AuthResult } from "@/lib/useAuth";

/** Instagram-style form primitives shared by the account settings pages. */

export const inputClass =
  "w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3.5 text-[15px] text-[var(--color-text)] transition-colors placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-ink)]/40 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]";

/** Submit state for one form: pending flag, error text, and a "saved" flag. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function run(action: () => Promise<AuthResult>, onSuccess?: () => void) {
    setPending(true);
    setError("");
    setDone(false);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(result.error || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }
    setDone(true);
    onSuccess?.();
  }

  return { pending, error, done, setError, setDone, run };
}

export function FieldBlock({
  title,
  help,
  aside,
  children,
}: {
  title: string;
  help?: React.ReactNode;
  /** Small text right of the title, e.g. "เลือกแล้ว 3 หมวด". */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-[var(--color-text)]">{title}</h2>
        {aside && <span className="text-xs text-[var(--color-text-muted)]">{aside}</span>}
      </div>
      {children}
      {help && <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{help}</p>}
    </div>
  );
}

/** Small label above an input inside a FieldBlock that holds several inputs. */
export function SubLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

/** Right-aligned submit with inline status, like Instagram's "ส่ง" footer. */
export function SubmitBar({
  pending,
  disabled,
  label,
  error,
  done,
  doneText,
  danger,
  icon,
}: {
  pending: boolean;
  disabled?: boolean;
  label: string;
  error: string;
  done: boolean;
  doneText: string;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
      {error ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)] sm:mr-auto">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </p>
      ) : (
        done && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--color-success)] sm:mr-auto">
            <CheckCircle2 size={14} className="shrink-0" />
            {doneText}
          </p>
        )
      )}
      <button
        type="submit"
        disabled={pending || disabled}
        className={`inline-flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          danger ? "bg-[var(--color-rose-dark)] hover:bg-[var(--color-rose)]" : "bg-[var(--color-ink)] hover:bg-black"
        }`}
      >
        {pending && <Loader2 size={15} className="animate-spin" />}
        {label}
        {!pending && icon}
      </button>
    </div>
  );
}

export function Avatar({ size }: { size: number }) {
  const { displayName, avatarSrc } = useAuth();
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ink)] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
      ) : (
        (displayName || "ส").slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

/** The grey "avatar + name + เปลี่ยนรูปภาพ" card at the top of Instagram's edit-profile page. */
export function AvatarCard({ subtitle }: { subtitle?: string }) {
  const { user, displayName, uploadAvatar } = useAuth();
  const avatar = useSubmit();

  function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void avatar.run(() => uploadAvatar(file));
  }

  return (
    <div>
      <div className="flex items-center gap-4 rounded-3xl bg-[var(--color-surface-alt)] p-4 sm:p-5">
        <Avatar size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-[var(--color-text)]">{displayName}</p>
          <p className="truncate text-sm text-[var(--color-text-muted)]">{subtitle ?? user?.email}</p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[var(--color-rose-dark)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-rose)]">
          {avatar.pending && <Loader2 size={14} className="animate-spin" />}
          เปลี่ยนรูปภาพ
          <input type="file" accept="image/*" hidden disabled={avatar.pending} onChange={handleAvatar} />
        </label>
      </div>
      {avatar.error ? (
        <p className="mt-2 text-xs text-[var(--color-rose-dark)]">{avatar.error}</p>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">JPEG, PNG, WebP หรือ GIF ขนาดไม่เกิน 5 MB</p>
      )}
    </div>
  );
}
