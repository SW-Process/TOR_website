"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronRight,
  Database,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Terminal,
} from "lucide-react";
import RunStatusBadge from "./RunStatusBadge";
import { dataSources } from "@/lib/adminMockData";

export const adminNavItems = [
  { href: "/admin", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/admin/scraper", label: "สถานะสแครปเปอร์", icon: Activity },
  { href: "/admin/logs", label: "System Logs", icon: Terminal },
  { href: "/admin/records", label: "ตรวจสอบ TOR", icon: Database },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const failedSources = dataSources.filter((s) => s.status === "failed").length;
  const overallStatus = failedSources > 0 ? "failed" : dataSources.some((s) => s.status === "running") ? "running" : "success";

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
          <p className="text-xs font-semibold text-[var(--color-text)]">สถานะระบบวันนี้</p>
          <div className="mt-2.5">
            <RunStatusBadge status={overallStatus} />
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-faint)] leading-relaxed">
            {failedSources > 0 ? `${failedSources} แหล่งข้อมูลล้มเหลว` : "ทุกแหล่งข้อมูลทำงานปกติ"}
          </p>
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
