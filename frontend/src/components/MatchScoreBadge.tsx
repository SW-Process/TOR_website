"use client";

import { Sparkles } from "lucide-react";

/**
 * Renders the backend match score (GET /api/vendor/matches). `score` is null
 * while the scores are still loading.
 */
export default function MatchScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="px-4 py-2.5 bg-[var(--color-surface-alt)]" aria-busy="true">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-text-faint)]">
          <span className="flex items-center gap-1">
            <Sparkles size={11} />
            เหมาะกับคุณ
          </span>
          <span>…</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full animate-pulse rounded-full bg-white/70" />
      </div>
    );
  }

  const textColor =
    score >= 70
      ? "text-[var(--color-success)]"
      : score >= 40
      ? "text-[var(--color-warning)]"
      : "text-[var(--color-text-faint)]";
  const barColor =
    score >= 70 ? "bg-[var(--color-success)]" : score >= 40 ? "bg-[var(--color-warning)]" : "bg-[var(--color-text-faint)]";
  const bgTint =
    score >= 70
      ? "bg-[var(--color-success-bg)]"
      : score >= 40
      ? "bg-[var(--color-warning-bg)]"
      : "bg-[var(--color-surface-alt)]";

  return (
    <div
      className={`px-4 py-2.5 ${bgTint}`}
      title="คำนวณจากหมวดหมู่ เทคโนโลยี และช่วงงบประมาณในโปรไฟล์ธุรกิจของคุณ"
    >
      <div className={`flex items-center justify-between text-[11px] font-semibold ${textColor}`}>
        <span className="flex items-center gap-1">
          <Sparkles size={11} />
          เหมาะกับคุณ
        </span>
        <span>{score}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
        <div
          className={`h-full rounded-full ${barColor} transition-[width] duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
