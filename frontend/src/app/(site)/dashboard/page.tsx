"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Lock,
  Sparkles,
} from "lucide-react";
import TORCard from "@/components/TORCard";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/useAuth";
import { useBookmarks } from "@/lib/useBookmarks";
import { useTracking } from "@/lib/useTracking";
import { computeMatchScore, useProfile } from "@/lib/useProfile";
import { torList as mockTorList, daysUntil, categories, type Category, type TOR } from "@/lib/mockData";
import { fetchTorList } from "@/lib/torApi";

const catalogFilters: (Category | "ทั้งหมด")[] = ["ทั้งหมด", ...categories];

function DashboardContent() {
  const { displayName } = useAuth();
  const { ids, ready: bookmarksReady } = useBookmarks();
  const { statusOf, ready: trackingReady } = useTracking();
  const { profile, ready: profileReady, hasProfile } = useProfile();
  const [activeCategory, setActiveCategory] = useState<Category | "ทั้งหมด">("ทั้งหมด");
  const [torList, setTorList] = useState<TOR[]>([]);
  const [torsReady, setTorsReady] = useState(false);

  useEffect(() => {
    fetchTorList().then((list) => {
      setTorList(list);
      setTorsReady(true);
    });
  }, []);

  const ready = bookmarksReady && trackingReady && profileReady && torsReady;

  const openTor = useMemo(() => torList.filter((t) => t.status !== "ปิดรับแล้ว"), [torList]);

  const recommended = useMemo(() => {
    if (hasProfile && profile) {
      return [...openTor]
        .map((tor) => ({ tor, score: computeMatchScore(tor, profile) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((x) => x.tor);
    }
    return [...openTor]
      .sort((a, b) => {
        const byDeadline = daysUntil(a.deadline) - daysUntil(b.deadline);
        return byDeadline !== 0 ? byDeadline : b.views - a.views;
      })
      .slice(0, 6);
  }, [hasProfile, profile, openTor]);

  const catalog =
    activeCategory === "ทั้งหมด" ? torList : torList.filter((t) => t.category === activeCategory);

  if (!ready) return null;

  const saved = mockTorList.filter((t) => ids.includes(t.id));
  const upcoming = saved
    .filter((t) => {
      const r = daysUntil(t.deadline);
      return r >= 0 && r <= 3;
    })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
  const submittedCount = saved.filter((t) => statusOf(t.id) === "ยื่นแล้ว").length;

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-lg font-bold text-white">
            {(displayName || "ส").trim().slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
              สวัสดี, {displayName}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              นี่คือสรุป TOR ที่คุณติดตามอยู่วันนี้
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/bookmarks"
            className="badge bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <Bookmark size={12} />
            บันทึกไว้ {saved.length}
          </Link>
          <Link
            href="/bookmarks?view=calendar"
            className={`badge transition-colors ${
              upcoming.length > 0
                ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
                : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <CalendarClock size={12} />
            ใกล้ปิดรับ {upcoming.length}
          </Link>
          <Link
            href="/bookmarks?view=tracking"
            className="badge bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <CheckCircle2 size={12} />
            ยื่นแล้ว {submittedCount}
          </Link>
        </div>
      </div>

      {!hasProfile && (
        <div className="mt-5 card flex flex-wrap items-center justify-between gap-3 border-none bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_55%,_var(--color-blush-soft)_100%)] p-4 sm:p-5">
          <p className="flex items-center gap-2 text-xs font-medium text-[var(--color-ink-soft)] sm:text-sm">
            <Sparkles size={15} className="shrink-0 text-[var(--color-rose-dark)]" />
            กรอกโปรไฟล์ธุรกิจเพื่อให้คำแนะนำ TOR แม่นยำขึ้น
          </p>
          <Link href="/account/profile" className="btn-pill btn-pill-primary whitespace-nowrap px-3.5 py-2 text-xs sm:text-sm">
            กรอกโปรไฟล์
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-5 card border-none bg-[var(--color-warning-bg)] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[var(--color-warning)]">
            <CalendarClock size={15} />
            <span className="text-sm font-bold">ใกล้ปิดรับใน 3 วันนี้ ({upcoming.length})</span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {upcoming.map((tor) => {
              const r = daysUntil(tor.deadline);
              return (
                <Link
                  key={tor.id}
                  href={`/tor/${tor.id}`}
                  className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-text)] transition-colors"
                >
                  <span className="font-semibold">{r === 0 ? "วันนี้" : `เหลือ ${r} วัน`}</span> — {tor.title}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <section className="mt-9">
        <div className="flex items-center gap-1.5">
          <Sparkles size={15} className="text-[var(--color-rose-dark)]" />
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)]">
            แนะนำสำหรับคุณ
          </h2>
        </div>
        {hasProfile ? (
          <>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              จัดอันดับตามความเหมาะสมกับโปรไฟล์ธุรกิจของคุณ
            </p>
            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {recommended.map((tor) => (
                <TORCard key={tor.id} tor={tor} showMatchScore />
              ))}
            </div>
          </>
        ) : (
          <Link
            href="/account/profile"
            className="group relative mt-4 block overflow-hidden rounded-[1.75rem] border border-white/60 bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_50%,_var(--color-blush-soft)_100%)] px-6 py-11 text-center transition-transform sm:px-10"
          >
            <div
              className="animate-blob-a pointer-events-none absolute -top-12 -right-10 h-44 w-44 rounded-full bg-white/50 blur-3xl"
              aria-hidden
            />
            <div
              className="animate-blob-b pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-80"
              style={{ animationDelay: "-3s" }}
              aria-hidden
            />

            <div className="relative flex flex-col items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--color-rose-dark)] shadow-[var(--shadow-md)] transition-transform group-hover:scale-105">
                <Lock size={22} />
              </span>
              <h3 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)]">
                ยังไม่เห็นคำแนะนำเฉพาะคุณ
              </h3>
              <p className="max-w-sm text-sm leading-relaxed text-[var(--color-ink-soft)]">
                กรอกโปรไฟล์ธุรกิจครั้งเดียว ให้ AI ช่วยจัดอันดับ TOR ที่เหมาะกับคุณที่สุดจากทั้งหมด
              </p>
              <span className="btn-pill btn-pill-primary mt-1.5 px-5 py-2.5 text-sm">
                กรอกโปรไฟล์ธุรกิจ
                <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)]">
            TOR ทั้งหมด
          </h2>
          <Link href="/tor" className="text-xs font-semibold text-[var(--color-rose-dark)] hover:underline">
            ไปหน้าค้นหาแบบละเอียด
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {catalogFilters.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                activeCategory === c
                  ? "bg-[var(--color-ink)] text-white"
                  : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {catalog.map((tor) => (
            <TORCard key={tor.id} tor={tor} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
