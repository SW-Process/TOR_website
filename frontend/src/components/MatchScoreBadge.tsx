"use client";

import { Sparkles } from "lucide-react";
import type { TOR } from "@/lib/mockData";
import { computeFallbackScore, computeMatchScore, useProfile } from "@/lib/useProfile";

export default function MatchScoreBadge({ tor }: { tor: TOR }) {
  const { profile, ready, hasProfile } = useProfile();

  if (!ready) return null;

  const score = hasProfile && profile ? computeMatchScore(tor, profile) : computeFallbackScore(tor);
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
      title={
        hasProfile
          ? "ประเมินเบื้องต้นจากโปรไฟล์ธุรกิจของคุณ (ยังไม่ใช่ผลจาก AI)"
          : "ประเมินเบื้องต้นจาก TOR นี้เท่านั้น — กรอกโปรไฟล์ธุรกิจเพื่อความแม่นยำที่สูงขึ้น"
      }
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
