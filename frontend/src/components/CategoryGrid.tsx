"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Category, categories, torList } from "@/lib/mockData";

import imgConstruction from "./picture/งานก่อสร้าง.jpg";
import imgIT from "./picture/เทคโนโลยีสารสนเทศ.jpg";
import imgConsulting from "./picture/งานที่ปรึกษา.jpg";
import imgProcurement from "./picture/จัดซื้อครุภัณฑ์.jpg";
import imgService from "./picture/งานบริการ.jpg";
import imgMaintenance from "./picture/บำรุงรักษา.jpg";
import imgHealth from "./picture/สาธารณสุข.jpg";
import imgEnvironment from "./picture/สิ่งแวดล้อม.jpg";

const categoryImage: Record<Category, typeof imgConstruction> = {
  งานก่อสร้าง: imgConstruction,
  เทคโนโลยีสารสนเทศ: imgIT,
  งานที่ปรึกษา: imgConsulting,
  จัดซื้อครุภัณฑ์: imgProcurement,
  งานบริการ: imgService,
  บำรุงรักษา: imgMaintenance,
  สาธารณสุข: imgHealth,
  สิ่งแวดล้อม: imgEnvironment,
};

// Instead of "cloning" just the two edge cards and silently snapping the
// scroll position back after each wrap (which fought with the smooth-scroll
// animation and stuttered), the row repeats the 8 categories several times
// in a row. Going next/prev just keeps moving one step at a time through
// that longer strip — every scroll is one uninterrupted smooth animation,
// so there's nothing to jitter. The middle copy is where the view starts.
const total = categories.length;
// REPEAT must be even so the starting copy sits exactly at the midpoint
// of the strip — that's what gives (near) equal left/right click buffer
// while still starting on the first real category.
const REPEAT = 60;
const LOOPED: Category[] = Array.from({ length: REPEAT }, () => categories).flat();
const START_INDEX = Math.floor(REPEAT / 2) * total;

function realIndexOf(renderIndex: number) {
  return ((renderIndex % total) + total) % total;
}

export default function CategoryGrid() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [renderIndex, setRenderIndex] = useState(START_INDEX);
  const suppressAutoDetect = useRef(false);
  const suppressTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function updateActiveIndex() {
    if (suppressAutoDetect.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const containerCenter = container.getBoundingClientRect().left + container.clientWidth / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cardCenter - containerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    });
    setRenderIndex(closestIndex);
  }

  useLayoutEffect(() => {
    cardRefs.current[START_INDEX]?.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });

    const container = scrollRef.current;
    if (!container) return;

    let frame: number;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActiveIndex);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(index: number) {
    const target = cardRefs.current[index];
    if (!target) return;

    suppressAutoDetect.current = true;
    setRenderIndex(index);
    target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

    clearTimeout(suppressTimeout.current);
    suppressTimeout.current = setTimeout(() => {
      suppressAutoDetect.current = false;
    }, 500);
  }

  function goNext() {
    goTo(renderIndex + 1);
  }

  function goPrev() {
    goTo(renderIndex - 1);
  }

  function goToReal(real: number) {
    // jump to the nearest occurrence of that category within the strip,
    // relative to where we currently are, instead of always the same copy
    goTo(renderIndex - realIndexOf(renderIndex) + real);
  }

  const activeReal = realIndexOf(renderIndex);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LOOPED.map((c, i) => {
          const count = torList.filter((t) => t.category === c).length;
          const isActive = i === renderIndex;
          return (
            <Link
              key={`${c}-${i}`}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              href={`/tor?category=${encodeURIComponent(c)}`}
              onClick={(e) => {
                if (!isActive) {
                  e.preventDefault();
                  goTo(i);
                }
              }}
              className={`group isolate card w-[68vw] shrink-0 snap-center overflow-hidden p-2.5 transition-all duration-300 ease-out sm:w-[280px] ${
                isActive
                  ? "scale-100 opacity-100 blur-none shadow-[var(--shadow-lg)] ring-2 ring-[var(--color-rose-dark)]"
                  : "scale-90 opacity-50 blur-[1.5px] hover:opacity-80 hover:blur-none"
              }`}
            >
              <div className="relative isolate aspect-[16/10] w-full overflow-hidden rounded-2xl ring-1 ring-black/5">
                <Image
                  src={categoryImage[c]}
                  alt={c}
                  fill
                  sizes="(min-width: 640px) 280px, 68vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/15" />
                <span className="badge absolute top-2.5 left-2.5 bg-white/95 text-[var(--color-text)] shadow-[var(--shadow-sm)]">
                  {count} โครงการ
                </span>
                <span
                  className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/55 via-black/10 to-transparent p-3 text-xs font-semibold text-white transition-all duration-300 ${
                    isActive ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                  }`}
                >
                  ดูโครงการทั้งหมด
                  <ArrowUpRight size={13} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-3.5 px-1 pb-1">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-rose-dark)]" />
                  <span className="font-[family-name:var(--font-heading)] text-sm font-bold text-[var(--color-text)] leading-snug">
                    {c}
                  </span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-white transition-colors duration-300 group-hover:bg-[var(--color-rose-dark)]">
                  <ArrowUpRight size={15} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <span className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />

      <button
        aria-label="เลื่อนซ้าย"
        onClick={goPrev}
        className="absolute -left-4 top-[calc(50%-12px)] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[var(--color-ink)] shadow-[var(--shadow-md)] hover:bg-[var(--color-ink)] hover:text-white transition-colors sm:flex"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        aria-label="เลื่อนขวา"
        onClick={goNext}
        className="absolute -right-4 top-[calc(50%-12px)] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[var(--color-ink)] shadow-[var(--shadow-md)] hover:bg-[var(--color-ink)] hover:text-white transition-colors sm:flex"
      >
        <ChevronRight size={18} />
      </button>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {categories.map((c, i) => (
          <button
            key={c}
            aria-label={`ไปที่ ${c}`}
            onClick={() => goToReal(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === activeReal ? "w-6 bg-[var(--color-rose-dark)]" : "w-1.5 bg-[var(--color-border-strong)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
