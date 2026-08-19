"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSearch } from "lucide-react";
import { adminNavItems } from "./AdminSidebar";

export default function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden sticky top-0 z-40 border-b border-[var(--color-border)] bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ink)] text-white shrink-0">
          <FileSearch size={14} />
        </span>
        <span className="font-[family-name:var(--font-heading)] text-sm font-bold text-[var(--color-ink)]">
          Admin Console
        </span>
      </div>
      <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3">
        {adminNavItems.map((item) => {
          const isActive =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--color-ink)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              <item.icon size={13} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
