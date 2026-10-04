"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useHiddenTors } from "@/lib/useHiddenTors";

/** "ซ่อน TOR นี้" toggle: a small icon on cards, a full-width button on the detail page. */
export default function HideTorButton({ id, variant = "icon" }: { id: string; variant?: "icon" | "full" }) {
  const { isHidden, hide, unhide, ready, canHide } = useHiddenTors();
  const hidden = ready && isHidden(id);

  // Hiding is a vendor feature (the API rejects other roles).
  if (!canHide) return null;

  if (variant === "full") {
    return (
      <button
        data-shortcut="hide"
        onClick={() => void (hidden ? unhide(id) : hide(id))}
        disabled={!ready}
        className="btn-pill w-full border border-[var(--color-border-strong)] bg-white px-4 py-2.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-ink)]"
      >
        {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
        {hidden ? "เลิกซ่อน TOR นี้" : "ซ่อน TOR นี้"}
      </button>
    );
  }

  return (
    <button
      aria-label="ซ่อน TOR นี้"
      title="ซ่อน TOR นี้"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void hide(id);
      }}
      disabled={!ready}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[var(--color-ink-soft)] shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-[var(--color-ink)]"
    >
      <EyeOff size={14} />
    </button>
  );
}

/**
 * Wraps a TOR card: hiding it collapses the card into an Instagram-style "hidden"
 * notice with an undo, instead of vanishing mid-scroll. A TOR hidden on an earlier
 * visit renders nothing, so after a refresh hidden TORs are simply gone.
 */
export function HideableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { isHidden, wasHiddenThisVisit, unhide, ready } = useHiddenTors();
  if (!ready || !isHidden(id)) return <>{children}</>;
  if (!wasHiddenThisVisit(id)) return null;

  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--color-ink)] text-[var(--color-ink)]">
        <EyeOff size={20} />
      </span>
      <div>
        <p className="text-sm font-bold text-[var(--color-text)]">ซ่อน TOR นี้แล้ว</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
          TOR นี้จะไม่แสดงในผลการค้นหาและคำแนะนำของคุณอีก
        </p>
      </div>
      <div className="flex items-center gap-4 text-sm font-semibold">
        <button onClick={() => void unhide(id)} className="text-[var(--color-rose-dark)] hover:underline">
          เลิกซ่อน
        </button>
        <Link href="/account/settings?section=hidden" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          จัดการ
        </Link>
      </div>
    </div>
  );
}
