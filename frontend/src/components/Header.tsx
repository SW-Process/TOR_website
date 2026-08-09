"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Search, Bookmark, LogIn, FileSearch } from "lucide-react";

const navLinks = [
  { href: "/", label: "หน้าแรก" },
  { href: "/tor", label: "ค้นหา TOR" },
  { href: "/tor?sort=deadline", label: "ใกล้ปิดรับ" },
  { href: "/bookmarks", label: "รายการที่บันทึก" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="container-page flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-white">
            <FileSearch size={16} />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-[17px] font-bold tracking-tight text-[var(--color-ink)]">
            TOR Insight
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
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

        <div className="hidden md:flex items-center gap-1.5">
          <Link
            href="/tor"
            aria-label="ค้นหา"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors"
          >
            <Search size={16} />
          </Link>
          <Link
            href="/bookmarks"
            aria-label="รายการที่บันทึก"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-blush-soft)] transition-colors"
          >
            <Bookmark size={16} />
          </Link>
          <Link href="/login" className="btn-pill btn-pill-primary ml-1 px-4 py-2.5 text-[13px]">
            <LogIn size={14} />
            เข้าสู่ระบบ
          </Link>
        </div>

        <button
          aria-label="เปิดเมนู"
          className="md:hidden rounded-full p-2 text-[var(--color-ink)] hover:bg-[var(--color-blush-soft)]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-[var(--color-border)] bg-white px-5 py-3 flex flex-col gap-1">
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
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="btn-pill btn-pill-primary mt-1 py-2.5 text-sm"
          >
            <LogIn size={15} />
            เข้าสู่ระบบ
          </Link>
        </nav>
      )}
    </header>
  );
}
