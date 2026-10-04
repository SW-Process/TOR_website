import Link from "next/link";
import { ChevronRight, LifeBuoy, MessageCircleQuestion, Search } from "lucide-react";
import HelpGuideSidebar from "./HelpGuideSidebar";
import type { HelpCategory } from "@/lib/helpApi";

/**
 * Help-center frame, modelled on LINE's help center: a title band with search,
 * the page content on the left, the "คู่มือช่วยเหลือ" category guide on the right.
 */
export default function HelpShell({
  categories,
  activeCategory,
  query,
  breadcrumb,
  children,
}: {
  categories: HelpCategory[];
  activeCategory?: string;
  /** Prefills the search box on the results page. */
  query?: string;
  /** Trail after "ศูนย์ช่วยเหลือ"; the last item is the current page. */
  breadcrumb?: { label: string; href?: string }[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-b border-[var(--color-border)] bg-[linear-gradient(135deg,_var(--color-blush)_0%,_var(--color-blush-soft)_60%,_#ffffff_100%)]">
        <div className="container-page flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/help" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-ink)] text-white">
              <LifeBuoy size={20} />
            </span>
            <span>
              <span className="block text-xs font-bold tracking-wide text-[var(--color-rose-dark)]">TOR Checker</span>
              <span className="block font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-text)]">
                ศูนย์ช่วยเหลือ
              </span>
            </span>
          </Link>
          <form action="/help/faq" role="search" className="relative w-full sm:max-w-sm">
            <input
              name="q"
              data-shortcut-search
              defaultValue={query}
              placeholder="คุณต้องการความช่วยเหลือเรื่องอะไร"
              aria-label="ค้นหาในศูนย์ช่วยเหลือ"
              className="w-full rounded-full border border-[var(--color-border)] bg-white py-3 pl-5 pr-12 text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-ink)]/40 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="ค้นหา"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-ink)] hover:bg-[var(--color-surface-alt)]"
            >
              <Search size={18} />
            </button>
          </form>
        </div>
      </div>

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <Link href="/help" className="hover:text-[var(--color-rose-dark)]">
                ศูนย์ช่วยเหลือ
              </Link>
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <ChevronRight size={12} />
                  {b.href ? (
                    <Link href={b.href} className="hover:text-[var(--color-rose-dark)]">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="line-clamp-1 text-[var(--color-text)]">{b.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {children}
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:h-fit">
          <HelpGuideSidebar categories={categories} active={activeCategory} />
          <div className="rounded-3xl bg-[var(--color-ink)] p-6 text-white">
            <MessageCircleQuestion size={22} className="text-[var(--color-rose-light)]" />
            <p className="mt-3 font-bold">ยังไม่พบคำตอบ?</p>
            <p className="mt-1 text-sm leading-relaxed text-white/70">
              ผู้ประกอบการที่เข้าสู่ระบบแล้วกดปุ่ม <span className="font-semibold text-white">ติดต่อเรา</span> ที่มุมขวาล่าง
              เพื่อสอบถามทีมงานได้โดยตรง หรือดูช่องทางติดต่ออื่นท้ายเว็บไซต์
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A LINE-style titled list section: big rose heading, one card of linked rows. */
export function HelpSection({
  title,
  children,
  more,
}: {
  title: string;
  children: React.ReactNode;
  more?: { href: string; label: string };
}) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-rose-dark)] sm:text-3xl">
          {title}
        </h2>
        {more && (
          <Link href={more.href} className="shrink-0 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-rose-dark)]">
            {more.label} →
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white px-5 shadow-[var(--shadow-sm)] sm:px-8">
        <ul className="divide-y divide-[var(--color-border)]">{children}</ul>
      </div>
    </section>
  );
}

export function HelpRow({ href, title, meta }: { href: string; title: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-4 py-6">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-rose-dark)] sm:text-base">
            {title}
          </span>
          {meta && <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{meta}</span>}
        </span>
        <ChevronRight size={22} className="shrink-0 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

export function HelpEmpty({ children }: { children: React.ReactNode }) {
  return <li className="py-10 text-center text-sm text-[var(--color-text-muted)]">{children}</li>;
}
