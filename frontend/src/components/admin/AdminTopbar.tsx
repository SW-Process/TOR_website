"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftRight, Bell, LogOut, MessageSquare, Search } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export default function AdminTopbar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { user, displayName, avatarSrc, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    router.push("/");
  }

  const initial = (displayName || "ผ").trim().slice(0, 1).toUpperCase();
  const avatar = avatarSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
  ) : (
    initial
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(query.trim() ? `/admin/records?q=${encodeURIComponent(query.trim())}` : "/admin/records");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 sm:px-8 pt-6">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-[var(--shadow-sm)] w-full sm:w-72"
      >
        <Search size={15} className="text-[var(--color-text-faint)] shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา TOR..."
          className="w-full bg-transparent text-sm focus:outline-none"
        />
      </form>

      <div className="flex items-center gap-4 sm:gap-5">
        <Link href="/admin/records" className="hidden sm:block text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-ink)] transition-colors">
          ส่งออกข้อมูล
        </Link>
        <Link href="/admin/reports" className="hidden sm:block text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-ink)] transition-colors">
          รายงาน
        </Link>

        <button
          type="button"
          aria-label="ข้อความ"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[var(--shadow-sm)] text-[var(--color-ink-soft)] hover:text-[var(--color-rose-dark)] transition-colors"
        >
          <MessageSquare size={15} />
        </button>
        <button
          type="button"
          aria-label="การแจ้งเตือน"
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[var(--shadow-sm)] text-[var(--color-ink-soft)] hover:text-[var(--color-rose-dark)] transition-colors"
        >
          <Bell size={15} />
          <span className="absolute top-2 right-2.5 h-1.5 w-1.5 rounded-full bg-[var(--color-rose-dark)]" />
        </button>

        <div className="relative">
          <button
            type="button"
            aria-label="เมนูบัญชี"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-rose-light)] text-xs font-bold text-[var(--color-rose-dark)] ring-2 ring-[var(--color-rose-dark)]/30 transition-shadow hover:ring-[var(--color-rose-dark)]/60"
          >
            {avatar}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-[var(--color-border)] bg-white p-1.5 shadow-[var(--shadow-lg)]"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-rose-light)] text-sm font-bold text-[var(--color-rose-dark)]">
                    {avatar}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{displayName}</p>
                    <p className="truncate text-xs text-[var(--color-text-faint)]">{user?.email}</p>
                    <span className="mt-1 inline-block rounded-full bg-[var(--color-rose-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-rose-dark)]">
                      ผู้ดูแลระบบ
                    </span>
                  </div>
                </div>
                <div className="my-1 h-px bg-[var(--color-border)]" />
                {/* Leaves the admin panel only — the session stays logged in. */}
                <Link
                  href="/"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-blush-soft)]"
                >
                  <ArrowLeftRight size={15} className="text-[var(--color-ink-soft)]" />
                  <span className="flex-1">
                    กลับสู่หน้าเว็บไซต์
                    <span className="block text-[11px] text-[var(--color-text-faint)]">ยังเข้าสู่ระบบอยู่ กลับมาหน้าแอดมินได้จากเมนูด้านบน</span>
                  </span>
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--color-rose-dark)] hover:bg-[var(--color-blush-soft)]"
                >
                  <LogOut size={15} />
                  ออกจากระบบ
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
