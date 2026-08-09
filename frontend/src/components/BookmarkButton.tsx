"use client";

import { Bookmark } from "lucide-react";
import { useBookmarks } from "@/lib/useBookmarks";

export default function BookmarkButton({
  id,
  variant = "icon",
}: {
  id: string;
  variant?: "icon" | "full";
}) {
  const { isBookmarked, toggle, ready } = useBookmarks();
  const active = ready && isBookmarked(id);

  if (variant === "full") {
    return (
      <button onClick={() => toggle(id)} className="btn-pill w-full px-4 py-2.5 text-sm border border-[var(--color-border-strong)] bg-white text-[var(--color-text)] hover:border-[var(--color-ink)] transition-colors">
        <Bookmark size={16} className={active ? "text-[var(--color-rose-dark)]" : ""} fill={active ? "currentColor" : "none"} />
        {active ? "บันทึกแล้ว" : "บันทึก TOR นี้"}
      </button>
    );
  }

  return (
    <button
      aria-label={active ? "ยกเลิกบันทึก" : "บันทึก TOR"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white"
    >
      <Bookmark
        size={14}
        className={active ? "text-[var(--color-rose-dark)]" : "text-[var(--color-ink-soft)]"}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}
