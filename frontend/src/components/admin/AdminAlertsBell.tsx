"use client";

import { useRouter } from "next/navigation";
import { Bell, BellOff, TriangleAlert } from "lucide-react";
import BellMenu, { type BellMenuItem } from "@/components/BellMenu";
import { useAuth } from "@/lib/useAuth";
import { useAdminAlerts, type AdminAlertType } from "@/lib/useAdminAlerts";

const TYPE_META: Record<string, { label: string; Icon: typeof Bell }> = {
  pipeline_run_failed: { label: "รอบดึงข้อมูลล้มเหลว", Icon: TriangleAlert },
};
const FALLBACK_META = { label: "การแจ้งเตือนระบบ", Icon: Bell };

function metaFor(type: AdminAlertType) {
  return TYPE_META[type] ?? FALLBACK_META;
}

/**
 * Alerts bell in the admin top bar (FR-39): unread count from GET /api/admin/notifications and a
 * dropdown of the newest alerts. Opening one marks it read; one tied to an ingestion run goes to
 * the scraper status page, where the runs are listed.
 */
export default function AdminAlertsBell() {
  const { user } = useAuth();
  // The admin API answers 403 until two-step verification is done (AdminMfaGate explains that).
  const enabled = user?.role === "admin" && (!user.mfaRequired || user.sessionMfa);
  const { alerts, unreadCount, status, refresh, markRead } = useAdminAlerts(enabled);
  const router = useRouter();

  const items: BellMenuItem[] = alerts.map((a) => {
    const { label, Icon } = metaFor(a.type);
    return {
      id: a.id,
      read: a.read,
      createdAt: a.createdAt,
      kindLabel: label,
      Icon,
      text: a.message,
      detail: a.ingestionRunId ? `รอบดึงข้อมูล ${a.ingestionRunId}` : null,
    };
  });

  function openAlert(id: string, close: () => void) {
    const alert = alerts.find((a) => a.id === id);
    if (!alert) return;
    void markRead(alert.id);
    if (alert.ingestionRunId) {
      close();
      router.push("/admin/scraper");
    }
  }

  return (
    <BellMenu
      items={items}
      unreadCount={unreadCount}
      status={status}
      refresh={() => void refresh()}
      onSelect={openAlert}
      buttonClassName="relative flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[var(--shadow-sm)] text-[var(--color-ink-soft)] hover:text-[var(--color-rose-dark)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-rose-dark)]"
      badgeRingClassName="ring-[var(--color-surface-alt)]"
      // Below the sticky mobile nav on small screens; under the bell from sm up.
      panelClassName="fixed left-4 right-4 top-20 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
      empty={() => (
        <>
          <BellOff size={22} className="text-[var(--color-text-faint)]" />
          <p className="text-sm font-medium text-[var(--color-text)]">ยังไม่มีการแจ้งเตือน</p>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            เมื่อรอบดึงข้อมูลล้มเหลวหรือค้างนานเกินกำหนด จะแจ้งให้ทราบที่นี่
          </p>
        </>
      )}
    />
  );
}
