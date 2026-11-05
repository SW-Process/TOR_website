"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CalendarClock, SearchCheck, UserRoundCheck } from "lucide-react";
import BellMenu, { type BellMenuItem } from "@/components/BellMenu";
import { useNotifications, type NotificationType } from "@/lib/useNotifications";

const TYPE_META: Record<NotificationType, { label: string; Icon: typeof Bell }> = {
  profile_match: { label: "ตรงกับโปรไฟล์ธุรกิจ", Icon: UserRoundCheck },
  saved_search_match: { label: "ตรงกับการค้นหาที่บันทึกไว้", Icon: SearchCheck },
  deadline_reminder: { label: "ใกล้ปิดรับข้อเสนอ", Icon: CalendarClock },
};

/**
 * Bell in the site header for vendors (FR-30): unread count on the icon and a dropdown of
 * notifications from GET /api/vendor/notifications. Opening one marks it read and goes to its TOR.
 */
export default function NotificationBell() {
  const { notifications, unreadCount, hasNextPage, status, refresh, loadMore, markRead } = useNotifications(true);
  const router = useRouter();

  const items: BellMenuItem[] = notifications.map((n) => {
    const { label, Icon } = TYPE_META[n.type] ?? TYPE_META.profile_match;
    return {
      id: n.id,
      read: n.read,
      createdAt: n.createdAt,
      kindLabel: label,
      Icon,
      text: n.message ?? n.tor?.title ?? "TOR ที่ตรงกับคุณ",
      detail: n.tor?.agency,
      note: n.tor?.isPublic ? null : "TOR นี้ไม่ได้เผยแพร่แล้ว",
    };
  });

  function openNotification(id: string, close: () => void) {
    const n = notifications.find((x) => x.id === id);
    if (!n) return;
    void markRead(n.id);
    if (n.tor?.isPublic) {
      close();
      router.push(`/tor/${n.tor.id}`);
    }
  }

  return (
    <BellMenu
      items={items}
      unreadCount={unreadCount}
      status={status}
      refresh={() => void refresh()}
      onSelect={openNotification}
      hasNextPage={hasNextPage}
      onLoadMore={loadMore}
      buttonClassName="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-rose-dark)]"
      panelClassName="fixed left-4 right-4 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
      empty={(close) => (
        <>
          <BellOff size={22} className="text-[var(--color-text-faint)]" />
          <p className="text-sm font-medium text-[var(--color-text)]">ยังไม่มีการแจ้งเตือน</p>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            เมื่อมี TOR ใหม่ที่ตรงกับโปรไฟล์ธุรกิจหรือการค้นหาที่คุณบันทึกไว้ จะแจ้งให้ทราบที่นี่
          </p>
          <Link
            href="/account/profile"
            onClick={close}
            className="mt-1 text-xs font-medium text-[var(--color-rose-dark)] hover:underline"
          >
            ตั้งค่าโปรไฟล์ธุรกิจ
          </Link>
        </>
      )}
    />
  );
}
