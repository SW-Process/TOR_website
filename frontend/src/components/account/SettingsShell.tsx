"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Briefcase, ChevronLeft, ChevronRight, EyeOff, KeyRound, LogOut, Mail, Trash2, UserRound } from "lucide-react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/useAuth";
import { Avatar } from "./ui";

/** Every page reachable from the settings sidebar; `/account/settings?section=<id>` unless noted. */
export type SettingsPageId = "profile" | "email" | "password" | "hidden" | "delete" | "business";

export const SETTINGS_ROOT = "/account/settings";

export function settingsHref(id: Exclude<SettingsPageId, "business">): string {
  return `${SETTINGS_ROOT}?section=${id}`;
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pb-2 text-[13px] font-semibold text-[var(--color-text-muted)]">{title}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  href,
  onClick,
  active,
  danger,
}: {
  icon: typeof UserRound;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const className = `flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-left text-[15px] transition-colors hover:bg-[var(--color-surface-alt)] ${
    active ? "bg-[var(--color-surface-alt)] font-semibold" : ""
  } ${danger ? "text-[var(--color-rose-dark)]" : "text-[var(--color-text)]"}`;
  const content = (
    <>
      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={16} className="text-[var(--color-text-faint)] lg:hidden" />
    </>
  );
  return href ? (
    <Link href={href} scroll={false} className={className} aria-current={active ? "page" : undefined}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * Instagram-style settings layout: grouped menu on the left, the active page on the right.
 * Phones show one or the other — the menu alone until a page is picked (`showDetailOnMobile`).
 */
export default function SettingsShell({
  active,
  title,
  showDetailOnMobile,
  children,
}: {
  active: SettingsPageId;
  title: string;
  showDetailOnMobile: boolean;
  children: React.ReactNode;
}) {
  const { user, displayName, logout } = useAuth();
  const router = useRouter();
  const isVendor = user?.role === "vendor";

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <RequireAuth>
      <div className="container-page grid min-h-[calc(100svh-var(--header-h))] grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside
          className={`min-w-0 py-8 lg:sticky lg:top-[var(--header-h)] lg:h-[calc(100svh-var(--header-h))] lg:overflow-y-auto lg:border-r lg:border-[var(--color-border)] lg:pr-8 ${
            showDetailOnMobile ? "hidden lg:block" : ""
          }`}
        >
          <h1 className="px-4 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
            การตั้งค่า
          </h1>

          <div className="mt-6 rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-md)]">
            <p className="text-xs font-bold text-[var(--color-rose-dark)]">TOR Checker</p>
            <p className="mt-1 text-lg font-extrabold text-[var(--color-text)]">ศูนย์บัญชี</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
              จัดการข้อมูลส่วนตัว การเข้าสู่ระบบ และความปลอดภัยของบัญชี
            </p>
            <div className="mt-4 flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
              <Avatar size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--color-text)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{user?.email}</p>
              </div>
            </div>
          </div>

          <nav className="mt-7 flex flex-col gap-7">
            <NavGroup title="บัญชีของคุณ">
              <NavItem icon={UserRound} label="แก้ไขโปรไฟล์" href={settingsHref("profile")} active={active === "profile"} />
              <NavItem icon={Mail} label="อีเมล" href={settingsHref("email")} active={active === "email"} />
              <NavItem
                icon={KeyRound}
                label="รหัสผ่านและความปลอดภัย"
                href={settingsHref("password")}
                active={active === "password"}
              />
            </NavGroup>

            {isVendor && (
              <NavGroup title="การใช้งาน TOR Checker">
                <NavItem icon={Briefcase} label="โปรไฟล์ธุรกิจ" href="/account/profile" active={active === "business"} />
                <NavItem icon={Bookmark} label="รายการที่บันทึก" href="/bookmarks" />
                <NavItem icon={EyeOff} label="TOR ที่ซ่อนไว้" href={settingsHref("hidden")} active={active === "hidden"} />
              </NavGroup>
            )}

            <NavGroup title="อื่นๆ">
              <NavItem icon={LogOut} label="ออกจากระบบ" onClick={handleLogout} />
              {isVendor && (
                <NavItem icon={Trash2} label="ลบบัญชี" href={settingsHref("delete")} active={active === "delete"} danger />
              )}
            </NavGroup>
          </nav>
        </aside>

        <main className={`min-w-0 py-8 lg:pl-16 ${showDetailOnMobile ? "" : "hidden lg:block"}`}>
          <div className="mx-auto max-w-[640px]">
            <div className="flex items-center gap-2">
              <Link
                href={SETTINGS_ROOT}
                scroll={false}
                aria-label="กลับไปที่การตั้งค่า"
                className="-ml-2 rounded-full p-2 text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] lg:hidden"
              >
                <ChevronLeft size={22} />
              </Link>
              <h2 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
                {title}
              </h2>
            </div>
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
