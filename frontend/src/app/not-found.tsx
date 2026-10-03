import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock, FileQuestion, FileSearch, Home, Search } from "lucide-react";
import mascotLost from "@/components/picture/404.png";

// Root not-found renders inside the root layout only (outside `(site)/layout`),
// as a standalone full-screen page without the site Header/Footer. Covers both
// unmatched URLs and `notFound()` calls such as an unknown TOR id in `tor/[id]`.

const shortcuts = [
  { href: "/tor", icon: Search, label: "ค้นหา TOR ทั้งหมด" },
  { href: "/tor?sort=deadline", icon: Clock, label: "TOR ใกล้ปิดรับ" },
];

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_40%,_var(--color-blush-soft)_75%,_#ffffff_100%)]">
      <div
        className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(34,26,24,0.18)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_80%_60%_at_60%_40%,black_10%,transparent_75%)]"
        aria-hidden
      />

      {/* Giant ghost "404" behind everything. */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none font-extrabold leading-none tracking-tighter text-white/50 text-[38vw] lg:text-[26rem]"
        aria-hidden
      >
        404
      </span>

      <div className="container-page relative py-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-ink)] text-white">
            <FileSearch size={16} />
          </span>
          <span className="font-[family-name:var(--font-heading)] text-[17px] font-bold tracking-tight text-[var(--color-ink)]">
            TOR Checker
          </span>
        </Link>
      </div>

      <div className="container-page relative grid w-full flex-1 items-center gap-10 pb-14 lg:grid-cols-2">
        {/* Copy + actions */}
        <div className="order-2 lg:order-1">
          <span className="eyebrow">Error 404 · Page not found</span>
          <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl sm:text-5xl font-extrabold leading-[1.08] text-[var(--color-text)]">
            อุ๊ย! หาหน้านี้
            <br />
            <span className="text-[var(--color-rose-dark)]">ไม่เจอเลย</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--color-ink-soft)]">
            ลิงก์อาจพิมพ์ผิด หน้าถูกย้าย หรือประกาศ TOR นี้ถูกนำออกจากระบบแล้ว
            ลองค้นหาใหม่อีกครั้ง หรือกลับไปเริ่มที่หน้าแรกได้เลย
          </p>

          {/* Plain GET form to /tor?q=… — no client JS needed. */}
          <form
            action="/tor"
            className="mt-7 flex max-w-md items-center gap-2 rounded-full border border-[var(--color-border)] bg-white p-1.5 pl-5 shadow-[var(--shadow-lg)]"
          >
            <Search size={18} className="shrink-0 text-[var(--color-text-faint)]" />
            <input
              name="q"
              type="text"
              placeholder="ค้นหาชื่อโครงการ หรือหน่วยงาน"
              aria-label="ค้นหา TOR"
              className="min-w-0 flex-1 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
            />
            <button type="submit" className="btn-pill btn-pill-primary px-5 py-2.5 text-sm">
              ค้นหา
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/" className="btn-pill btn-pill-primary py-3 pl-6 pr-2">
              <Home size={16} />
              กลับหน้าแรก
              <span className="btn-icon-circle">
                <ArrowUpRight size={15} />
              </span>
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-[var(--color-ink-soft)] ring-1 ring-black/[0.04] backdrop-blur transition-colors hover:bg-white hover:text-[var(--color-rose-dark)]"
              >
                <s.icon size={14} />
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Mascot scene — shifted right on desktop so it only overlaps part of the ghost "4". */}
        <div className="relative order-1 mx-auto h-[300px] w-full max-w-[460px] sm:h-[400px] lg:order-2 lg:h-[480px] lg:translate-x-12 xl:translate-x-32">
          <div className="animate-blob-a absolute -top-6 right-0 h-64 w-64 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-80" />
          <div
            className="animate-blob-b absolute bottom-6 -left-6 h-56 w-56 rounded-full bg-white blur-3xl opacity-80"
            style={{ animationDelay: "-3s" }}
          />
          <div
            className="animate-blob-c absolute top-1/3 left-1/4 h-40 w-40 rounded-full bg-[var(--color-rose)] blur-3xl opacity-20"
            style={{ animationDelay: "-1.5s" }}
          />

          <span className="animate-dot-pulse absolute top-6 left-8 h-2.5 w-2.5 rounded-full bg-[var(--color-rose-dark)]" />
          <span
            className="animate-dot-pulse absolute bottom-16 right-4 h-2 w-2 rounded-full bg-[var(--color-rose-dark)]/60"
            style={{ animationDelay: "-2s" }}
          />

          {/* A blank "missing" TOR card tilted behind the mascot. */}
          <div className="animate-card-bob absolute bottom-20 -left-4 hidden w-40 sm:block" style={{ animationDelay: "-2s" }}>
            <div
              className="rotate-[-8deg] rounded-[1.25rem] bg-white p-4 ring-1 ring-black/[0.03]"
              style={{ boxShadow: "0 20px 40px -16px rgba(224,87,119,0.35), 0 8px 18px rgba(34,26,24,0.06)" }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                <FileQuestion size={15} />
              </span>
              <div className="mt-3 h-2 w-24 rounded-full bg-[var(--color-border)]" />
              <div className="mt-2 h-2 w-16 rounded-full bg-[var(--color-border)]" />
              <div className="mt-2 h-2 w-20 rounded-full bg-[var(--color-border)]" />
            </div>
          </div>

          {/* Ground shadow + mascot */}
          <div className="absolute bottom-2 left-1/2 h-8 w-56 -translate-x-1/2 rounded-full bg-[var(--color-rose-dark)]/20 blur-xl" />
          <div className="animate-card-bob absolute inset-x-0 bottom-6 mx-auto w-[260px] sm:w-[340px] lg:w-[400px]">
            <Image
              src={mascotLost}
              alt="มาสคอตงงหาหน้าไม่เจอ"
              // ~3× the largest drawn width so it stays sharp on retina screens.
              sizes="(min-width: 1024px) 1200px, 780px"
              priority
              className="h-auto w-full select-none"
              style={{ filter: "drop-shadow(0 18px 24px rgba(224,87,119,0.25))" }}
            />
          </div>

          <div
            className="animate-card-bob absolute right-0 top-1/2 hidden items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 ring-1 ring-black/[0.03] sm:flex"
            style={{ boxShadow: "0 16px 32px -14px rgba(224,87,119,0.3), 0 6px 16px rgba(34,26,24,0.06)", animationDelay: "-4s" }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
              <Search size={13} />
            </span>
            <span className="text-xs font-semibold text-[var(--color-text)]">หาอยู่นะ…</span>
          </div>
        </div>
      </div>
    </main>
  );
}
