"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Bell, Loader2, type LucideIcon } from "lucide-react";
import { timeAgo } from "@/lib/useNotifications";

/** One row in the dropdown, already worded for the reader. */
export interface BellMenuItem {
  id: string;
  read: boolean;
  createdAt: string;
  /** Short kind of alert shown above the text, e.g. "ตรงกับโปรไฟล์ธุรกิจ". */
  kindLabel: string;
  Icon: LucideIcon;
  text: string;
  /** Small line under the text (an agency, a run id). */
  detail?: string | null;
  /** Faint note, e.g. why the row can't be opened. */
  note?: string | null;
}

interface BellMenuProps {
  items: BellMenuItem[];
  unreadCount: number;
  status: "loading" | "ready" | "error";
  /** Called when the dropdown opens (to refresh) and from the error state's retry button. */
  refresh: () => void;
  /** A row was clicked; call `close()` before navigating away. */
  onSelect: (id: string, close: () => void) => void;
  /** Shown when the list is empty; call `close()` from any link in it. */
  empty: (close: () => void) => ReactNode;
  hasNextPage?: boolean;
  onLoadMore?: () => Promise<void>;
  /** The bell button's look, which differs between the site header and the admin top bar. */
  buttonClassName: string;
  /** Ring around the unread badge, matching the surface behind the button. */
  badgeRingClassName?: string;
  /** Where the dropdown sits; the mobile position depends on the header it's in. */
  panelClassName: string;
}

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Bell button with an unread badge and a dropdown list, shared by the vendor notification bell
 * and the admin alerts bell. The callers own the data; this only renders it.
 */
export default function BellMenu({
  items,
  unreadCount,
  status,
  refresh,
  onSelect,
  empty,
  hasNextPage = false,
  onLoadMore,
  buttonClassName,
  badgeRingClassName = "ring-white",
  panelClassName,
}: BellMenuProps) {
  const [open, setOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and hand focus back to the bell.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  }

  async function handleLoadMore() {
    if (!onLoadMore) return;
    setLoadingMore(true);
    await onLoadMore();
    setLoadingMore(false);
  }

  const label = unreadCount > 0 ? `การแจ้งเตือน (ยังไม่ได้อ่าน ${unreadCount} รายการ)` : "การแจ้งเตือน";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={buttonClassName}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-rose)] px-1 text-[9px] font-bold leading-none text-white ring-2 ${badgeRingClassName}`}
          >
            {badgeText(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            id={panelId}
            role="region"
            aria-label="การแจ้งเตือน"
            className={`z-40 rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)] ${panelClassName}`}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <p className="text-sm font-semibold text-[var(--color-text)]">การแจ้งเตือน</p>
              {unreadCount > 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">ยังไม่ได้อ่าน {unreadCount} รายการ</span>
              )}
            </div>
            <div className="h-px bg-[var(--color-border)]" />

            <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1.5">
              {status === "loading" && items.length === 0 && (
                <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-[var(--color-text-muted)]">
                  <Loader2 size={15} className="animate-spin" />
                  กำลังโหลด…
                </p>
              )}

              {status === "error" && items.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  <p>โหลดการแจ้งเตือนไม่สำเร็จ</p>
                  <button
                    type="button"
                    onClick={refresh}
                    className="mt-2 font-medium text-[var(--color-rose-dark)] hover:underline"
                  >
                    ลองอีกครั้ง
                  </button>
                </div>
              )}

              {status === "ready" && items.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">{empty(() => setOpen(false))}</div>
              )}

              {items.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(n.id, () => setOpen(false))}
                        className={`flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-blush-soft)] ${
                          n.read ? "" : "bg-[var(--color-surface-alt)]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            n.read
                              ? "bg-[var(--color-blush-soft)] text-[var(--color-text-muted)]"
                              : "bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]"
                          }`}
                        >
                          <n.Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                            {n.kindLabel}
                            <span aria-hidden="true">·</span>
                            <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                          </span>
                          <span
                            className={`mt-0.5 line-clamp-2 block text-[13px] leading-snug ${
                              n.read ? "text-[var(--color-text-muted)]" : "font-medium text-[var(--color-text)]"
                            }`}
                          >
                            {n.text}
                          </span>
                          {n.detail && (
                            <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-faint)]">
                              {n.detail}
                            </span>
                          )}
                          {n.note && (
                            <span className="mt-0.5 block text-[11px] text-[var(--color-text-faint)]">{n.note}</span>
                          )}
                        </span>
                        {!n.read && (
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--color-rose)]">
                            <span className="sr-only">ยังไม่ได้อ่าน</span>
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {hasNextPage && onLoadMore && (
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={loadingMore}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--color-rose-dark)] hover:bg-[var(--color-blush-soft)] disabled:opacity-60"
                >
                  {loadingMore && <Loader2 size={13} className="animate-spin" />}
                  ดูการแจ้งเตือนก่อนหน้า
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
