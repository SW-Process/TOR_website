"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ChevronRight,
  Database,
  FileSearch,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  MessagesSquare,
  Terminal,
} from "lucide-react";
import RunStatusBadge from "./RunStatusBadge";
import {
  fetchAdminStats,
  overallRunStatus,
  RUN_STATUS_LABELS,
  timeAgo,
  type AdminStats,
  type RunSummary,
} from "@/lib/adminStats";

/** Re-check pipeline health this often while the admin panel is open. */
const STATUS_REFRESH_MS = 60_000;

function runLine(label: string, run: RunSummary | null): string {
  return run ? `${label}: ${RUN_STATUS_LABELS[run.status]} · ${timeAgo(run.startedAt)}` : `${label}: ยังไม่เคยรัน`;
}

export const adminNavItems = [
  { href: "/admin", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/admin/scraper", label: "สถานะสแครปเปอร์", icon: Activity },
  { href: "/admin/records", label: "ตรวจสอบ TOR", icon: Database },
  { href: "/admin/reports", label: "รายงานจากผู้ใช้", icon: MessageSquareWarning },
  { href: "/admin/chats", label: "แชทจากผู้ใช้", icon: MessagesSquare },
  { href: "/admin/logs", label: "System Logs", icon: Terminal },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetchAdminStats()
        .then((s) => {
          setStats(s);
          setStatsError(false);
        })
        .catch(() => setStatsError(true));
    void load();
    const timer = setInterval(load, STATUS_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const overallStatus = stats ? overallRunStatus(stats) : null;

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-white">
      <Link href="/" className="flex items-center gap-2.5 px-6 py-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-white shrink-0">
          <FileSearch size={16} />
        </span>
        <span className="font-[family-name:var(--font-heading)] text-[15px] font-bold tracking-tight text-[var(--color-ink)]">
          TOR Checker
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5 px-4 py-2">
        {adminNavItems.map((item) => {
          const isActive =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--color-rose-light)] font-semibold text-[var(--color-rose-dark)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
              }`}
            >
              <item.icon size={16} className={isActive ? "text-[var(--color-rose-dark)]" : "text-[var(--color-text-faint)]"} />
              <span className="flex-1">{item.label}</span>
              <ChevronRight size={13} className={isActive ? "text-[var(--color-rose-dark)]" : "text-[var(--color-text-faint)]"} />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 p-4">
        <Link
          href="/admin/scraper"
          className="rounded-2xl bg-[var(--color-surface-alt)] p-4 hover:bg-[var(--color-blush-soft)] transition-colors"
        >
          <p className="text-xs font-semibold text-[var(--color-text)]">สถานะระบบล่าสุด</p>
          <div className="mt-2.5">
            {overallStatus ? (
              <RunStatusBadge status={overallStatus} />
            ) : (
              <span className="badge bg-white text-[var(--color-text-muted)]">
                {statsError ? "โหลดสถานะไม่ได้" : stats ? "ยังไม่เคยรัน" : "กำลังตรวจสอบ…"}
              </span>
            )}
          </div>
          {stats && (
            <p className="mt-2 whitespace-pre-line text-[11px] text-[var(--color-text-faint)] leading-relaxed">
              {`${runLine("ดึงข้อมูล", stats.lastDiscovery)}\n${runLine("ประมวลผล AI", stats.lastEnrichment)}`}
            </p>
          )}
        </Link>

        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
        >
          <LogOut size={16} className="text-[var(--color-text-faint)]" />
          กลับสู่หน้าเว็บไซต์
        </Link>
      </div>
    </aside>
  );
}
