"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, MessageSquare, Search } from "lucide-react";

export default function AdminTopbar() {
  const router = useRouter();
  const [query, setQuery] = useState("");

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
        <Link href="/admin/logs" className="hidden sm:block text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-ink)] transition-colors">
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

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-xs font-bold text-[var(--color-rose-dark)] ring-2 ring-[var(--color-rose-dark)]/30">
          กก
        </span>
      </div>
    </div>
  );
}
