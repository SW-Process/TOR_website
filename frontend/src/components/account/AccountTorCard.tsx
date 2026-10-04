"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Clock, ExternalLink, Hash, Sparkles } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { formatBudget, formatThaiDate, type TOR } from "@/lib/mockData";
import { statusNote } from "@/lib/torStatus";

/**
 * A TOR as a settings-page card, laid out like the admin report cards: status and
 * timestamp, AI summary, a TOR box with "เปิดดู", then the page's own actions.
 */
export default function AccountTorCard({
  tor,
  timeLabel,
  at,
  boxLabel,
  actions,
}: {
  tor: TOR;
  /** e.g. "ซ่อนเมื่อ" / "บันทึกเมื่อ" — shown before the date in the top-right corner. */
  timeLabel: string;
  at: string;
  /** Small caption over the TOR title, e.g. "TOR ที่ซ่อน". */
  boxLabel: string;
  actions: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={tor.status} />
          <span className="badge bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">{tor.category}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-text-faint)]">
          <Clock size={12} />
          {timeLabel} {formatThaiDate(at)}
        </span>
      </div>

      {/* aiSummary.summary is a model-written summary, never the agency's own text — label it so. */}
      <div className="rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-rose-dark)]">
          <Sparkles size={11} />
          สรุปโดย AI
        </p>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          {tor.description || "ยังไม่มีสรุปสำหรับ TOR นี้"}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-[var(--color-border)] p-4">
        <p className="text-[11px] font-semibold text-[var(--color-text-faint)]">{boxLabel}</p>
        <Link
          href={`/tor/${tor.id}`}
          className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-text)] hover:text-[var(--color-rose-dark)]"
        >
          {tor.title}
        </Link>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
          {tor.projectCode && (
            <span className="flex items-center gap-1">
              <Hash size={11} />
              {tor.projectCode}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-1">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{tor.agency}</span>
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-base font-extrabold text-[var(--color-rose-dark)]">{formatBudget(tor.budget)}</p>
            <p className="text-[11px] text-[var(--color-text-faint)]">{statusNote(tor)}</p>
          </div>
          <Link
            href={`/tor/${tor.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-ink)]/40"
          >
            <ExternalLink size={13} />
            เปิดดู
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </article>
  );
}

/**
 * The dark pill action at the bottom of a card. Disabled while `onClick` runs; on
 * success the card usually unmounts, on failure it stays, so it re-enables.
 */
export function CardAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button
      disabled={pending}
      onClick={() => {
        setPending(true);
        void onClick().finally(() => setPending(false));
      }}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
