"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ArrowRight, KanbanSquare, CalendarClock } from "lucide-react";
import TORCard from "@/components/TORCard";
import TrackingBoard from "@/components/TrackingBoard";
import DeadlineCalendar from "@/components/DeadlineCalendar";
import RequireAuth from "@/components/RequireAuth";
import { useBookmarks } from "@/lib/useBookmarks";
import { torList } from "@/lib/mockData";

const views = [
  { key: "list", label: "รายการที่บันทึก", icon: Bookmark },
  { key: "tracking", label: "ติดตามสถานะ", icon: KanbanSquare },
  { key: "calendar", label: "ปฏิทิน Deadline", icon: CalendarClock },
] as const;

type ViewKey = (typeof views)[number]["key"];

export default function BookmarksPage() {
  const { ids, ready } = useBookmarks();
  const [view, setView] = useState<ViewKey>("list");
  const saved = torList.filter((t) => ids.includes(t.id));

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "tracking" || requested === "calendar") setView(requested);
  }, []);

  return (
    <RequireAuth>
    <div className="container-page py-8">
      <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
        TOR ที่บันทึกไว้
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
        รายการ TOR ที่คุณบันทึกไว้ พร้อมติดตามสถานะและวันปิดรับ ข้อมูลจัดเก็บไว้ในเบราว์เซอร์นี้เท่านั้น
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {views.map((v) => {
          const Icon = v.icon;
          const active = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--color-ink)] text-white"
                  : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Icon size={14} />
              {v.label}
            </button>
          );
        })}
      </div>

      {!ready ? null : saved.length === 0 ? (
        <div className="mt-8 card p-12 flex flex-col items-center text-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
            <Bookmark size={22} />
          </span>
          <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
            ยังไม่มี TOR ที่บันทึกไว้ กดไอคอน <Bookmark size={13} className="inline -mt-0.5" /> บนการ์ด TOR
            เพื่อบันทึกโครงการที่คุณสนใจไว้ที่นี่
          </p>
          <Link href="/tor" className="btn-pill btn-pill-primary mt-2 px-4 py-2.5 text-sm">
            ไปค้นหา TOR
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          {view === "list" && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {saved.map((tor) => (
                <TORCard key={tor.id} tor={tor} />
              ))}
            </div>
          )}
          {view === "tracking" && <TrackingBoard saved={saved} />}
          {view === "calendar" && <DeadlineCalendar saved={saved} />}
        </div>
      )}
    </div>
    </RequireAuth>
  );
}
