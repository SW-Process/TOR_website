"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Bell, BellOff, CalendarClock, Loader2, SearchCheck, UserRoundCheck } from "lucide-react";
import { timeAgo, useNotifications, type NotificationType, type VendorNotification } from "@/lib/useNotifications";

const TYPE_META: Record<NotificationType, { label: string; Icon: typeof Bell }> = {
  profile_match: { label: "ตรงกับโปรไฟล์ธุรกิจ", Icon: UserRoundCheck },
  saved_search_match: { label: "ตรงกับการค้นหาที่บันทึกไว้", Icon: SearchCheck },
  deadline_reminder: { label: "ใกล้ปิดรับข้อเสนอ", Icon: CalendarClock },
};

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Bell in the site header for vendors (FR-30): unread count on the icon and a dropdown of
 * notifications from GET /api/vendor/notifications. Opening one marks it read and goes to its TOR.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { notifications, unreadCount, hasNextPage, status, refresh, loadMore, markRead } = useNotifications(true);
  const router = useRouter();
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
    if (next) void refresh();
  }

  function openNotification(n: VendorNotification) {
    void markRead(n.id);
    if (n.tor?.isPublic) {
      setOpen(false);
      router.push(`/tor/${n.tor.id}`);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    await loadMore();
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
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-rose-dark)]"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-rose)] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white"
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
            className="fixed left-4 right-4 top-[4.5rem] z-40 rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <p className="text-sm font-semibold text-[var(--color-text)]">การแจ้งเตือน</p>
              {unreadCount > 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">ยังไม่ได้อ่าน {unreadCount} รายการ</span>
              )}
            </div>
            <div className="h-px bg-[var(--color-border)]" />

            <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1.5">
              {status === "loading" && notifications.length === 0 && (
                <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-[var(--color-text-muted)]">
                  <Loader2 size={15} className="animate-spin" />
                  กำลังโหลด…
                </p>
              )}

              {status === "error" && notifications.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  <p>โหลดการแจ้งเตือนไม่สำเร็จ</p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="mt-2 font-medium text-[var(--color-rose-dark)] hover:underline"
                  >
                    ลองอีกครั้ง
                  </button>
                </div>
              )}

              {status === "ready" && notifications.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <BellOff size={22} className="text-[var(--color-text-faint)]" />
                  <p className="text-sm font-medium text-[var(--color-text)]">ยังไม่มีการแจ้งเตือน</p>
                  <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                    เมื่อมี TOR ใหม่ที่ตรงกับโปรไฟล์ธุรกิจหรือการค้นหาที่คุณบันทึกไว้ จะแจ้งให้ทราบที่นี่
                  </p>
                  <Link
                    href="/account/profile"
                    onClick={() => setOpen(false)}
                    className="mt-1 text-xs font-medium text-[var(--color-rose-dark)] hover:underline"
                  >
                    ตั้งค่าโปรไฟล์ธุรกิจ
                  </Link>
                </div>
              )}

              {notifications.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {notifications.map((n) => {
                    const { label: typeLabel, Icon } = TYPE_META[n.type] ?? TYPE_META.profile_match;
                    const canOpen = Boolean(n.tor?.isPublic);
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
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
                            <Icon size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                              {typeLabel}
                              <span aria-hidden="true">·</span>
                              <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                            </span>
                            <span
                              className={`mt-0.5 line-clamp-2 block text-[13px] leading-snug ${
                                n.read ? "text-[var(--color-text-muted)]" : "font-medium text-[var(--color-text)]"
                              }`}
                            >
                              {n.message ?? n.tor?.title ?? "TOR ที่ตรงกับคุณ"}
                            </span>
                            {n.tor?.agency && (
                              <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-faint)]">
                                {n.tor.agency}
                              </span>
                            )}
                            {!canOpen && (
                              <span className="mt-0.5 block text-[11px] text-[var(--color-text-faint)]">
                                TOR นี้ไม่ได้เผยแพร่แล้ว
                              </span>
                            )}
                          </span>
                          {!n.read && (
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--color-rose)]">
                              <span className="sr-only">ยังไม่ได้อ่าน</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {hasNextPage && (
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
