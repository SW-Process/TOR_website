"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import type { HelpCategory } from "@/lib/helpApi";

/** LINE-style "คู่มือช่วยเหลือ": a collapsible list of FAQ categories. */
export default function HelpGuideSidebar({ categories, active }: { categories: HelpCategory[]; active?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-base font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
      >
        คู่มือช่วยเหลือ
        <ChevronUp size={20} className={`transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-0.5 rounded-2xl bg-[var(--color-surface-alt)] p-2">
          {categories.map((c) => {
            const isActive = c.slug === active;
            return (
              <li key={c.slug}>
                <Link
                  href={`/help/faq?category=${c.slug}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? "bg-white font-bold text-[var(--color-rose-dark)] shadow-[var(--shadow-sm)]"
                      : "font-medium text-[var(--color-text)] hover:bg-white/70"
                  }`}
                >
                  <span>{c.label}</span>
                  <span className="text-xs font-normal text-[var(--color-text-faint)]">{c.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
