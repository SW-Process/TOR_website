"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Menu,
  X,
  Search,
  Bookmark,
  LogIn,
  LogOut,
  FileSearch,
  UserRound,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { CLOSING_SOON_HREF } from "@/lib/torSearch";

const publicLinks = [
  { href: "/tor", label: "ค้นหา TOR" },
  { href: CLOSING_SOON_HREF, label: "ใกล้ปิดรับ" },
];

// Vendor-only pages: their APIs reject admins, so admins get the admin panel link instead.
const vendorLinks = [
  { href: "/dashboard", label: "แดชบอร์ด" },
  { href: "/bookmarks", label: "รายการที่บันทึก" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, displayName, avatarSrc, ready, isLoggedIn, logout } = useAuth();
  const router = useRouter();

  const loggedIn = ready && isLoggedIn;
  const isAdmin = loggedIn && user?.role === "admin";
  const isVendor = loggedIn && user?.role === "vendor";
  const navLinks = [...publicLinks, ...(isVendor ? vendorLinks : [])];

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    setOpen(false);
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="container-page flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-white">
            <FileSearch size={16} />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-[17px] font-bold tracking-tight text-[var(--color-ink)]">
            TOR Checker
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[13.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-rose-dark)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-1.5">
          <Link
            href="/tor"
            aria-label="ค้นหา"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors"
          >
            <Search size={16} />
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="btn-pill border border-[var(--color-border-strong)] mr-1 px-3.5 py-2 text-[13px] font-medium text-[var(--color-text)] hover:border-[var(--color-ink)] transition-colors"
            >
              <ShieldCheck size={14} />
              หน้าแอดมิน
            </Link>
          )}

          {isVendor && (
            <Link
              href="/bookmarks"
              aria-label="รายการที่บันทึก"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors"
            >
              <Bookmark size={16} />
            </Link>
          )}

          {loggedIn ? (
            <div className="relative ml-1">
              <button
                aria-label="เมนูบัญชี"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ink)] text-xs font-bold text-white"
              >
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  (displayName || "ส").trim().slice(0, 1).toUpperCase()
                )}
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold text-[var(--color-text)] truncate">{displayName}</p>
                      <p className="text-xs text-[var(--color-text-faint)] truncate">{user?.email}</p>
                    </div>
                    <div className="my-1 h-px bg-[var(--color-border)]" />
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
                      >
                        <ShieldCheck size={15} />
                        หน้าแอดมิน
                      </Link>
                    )}
                    {isVendor && (
                      <Link
                        href="/account/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
                      >
                        <UserRound size={15} />
                        โปรไฟล์ธุรกิจ
                      </Link>
                    )}
                    <Link
                      href="/account/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
                    >
                      <Settings size={15} />
                      ตั้งค่าบัญชี
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--color-rose-dark)] hover:bg-[var(--color-blush-soft)]"
                    >
                      <LogOut size={15} />
                      ออกจากระบบ
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className="btn-pill btn-pill-primary ml-1 px-4 py-2.5 text-[13px]">
              <LogIn size={14} />
              เข้าสู่ระบบ
            </Link>
          )}
        </div>

        <button
          aria-label="เปิดเมนู"
          className="lg:hidden rounded-full p-2 text-[var(--color-ink)] hover:bg-[var(--color-blush-soft)]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="lg:hidden border-t border-[var(--color-border)] bg-white px-5 py-3 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
            >
              {link.label}
            </Link>
          ))}

          {loggedIn ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
                >
                  <ShieldCheck size={15} />
                  หน้าแอดมิน · {displayName}
                </Link>
              )}
              {isVendor && (
                <Link
                  href="/account/profile"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
                >
                  โปรไฟล์ธุรกิจ · {displayName}
                </Link>
              )}
              <Link
                href="/account/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
              >
                <Settings size={15} />
                ตั้งค่าบัญชี
              </Link>
              <button
                onClick={handleLogout}
                className="btn-pill mt-1 border border-[var(--color-border-strong)] py-2.5 text-sm text-[var(--color-rose-dark)]"
              >
                <LogOut size={15} />
                ออกจากระบบ
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="btn-pill btn-pill-primary mt-1 py-2.5 text-sm"
            >
              <LogIn size={15} />
              เข้าสู่ระบบ
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
