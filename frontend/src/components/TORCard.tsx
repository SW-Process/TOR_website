import Link from "next/link";
import { ArrowUpRight, Building2, Eye } from "lucide-react";
import { TOR } from "@/lib/mockData";
import { statusNote, torPriceText } from "@/lib/torStatus";
import StatusBadge from "./StatusBadge";
import BookmarkButton from "./BookmarkButton";
import HideTorButton, { HideableCard } from "./HideTorButton";
import MatchScoreBadge from "./MatchScoreBadge";

export default function TORCard({
  tor,
  matchScore,
  hideable = true,
}: {
  tor: TOR;
  /** Omit to hide the badge; null shows its loading state. */
  matchScore?: number | null;
  /** false where hiding makes no sense, e.g. the vendor's own saved list. */
  hideable?: boolean;
}) {
  const deadlineLabel = statusNote(tor);

  const card = (
    <div className="group isolate card overflow-hidden flex flex-col transition-shadow duration-300 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={tor.status} />
          <div className="flex items-center gap-1.5">
            {hideable && <HideTorButton id={tor.id} />}
            <BookmarkButton id={tor.id} />
          </div>
        </div>

        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-rose-dark)]">
          {tor.category}
        </span>

        <Link href={`/tor/${tor.id}`}>
          <h3 className="font-[family-name:var(--font-heading)] text-[15px] font-bold leading-snug text-[var(--color-text)] line-clamp-2 hover:text-[var(--color-rose-dark)] transition-colors">
            {tor.title}
          </h3>
        </Link>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5">
            <Building2 size={12} />
            {tor.agency}
          </span>
          <span className="flex items-center gap-1.5">
            <Eye size={12} />
            {tor.views.toLocaleString("th-TH")}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
          <div>
            <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[var(--color-rose-dark)]">
              {torPriceText(tor)}
            </p>
            <p
              className={`text-xs font-medium ${
                tor.status === "ใกล้ปิดรับ" ? "text-[var(--color-warning)]" : "text-[var(--color-text-faint)]"
              }`}
            >
              {deadlineLabel}
            </p>
          </div>
          <Link
            href={`/tor/${tor.id}`}
            aria-label="ดูรายละเอียด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-white transition-colors duration-300 group-hover:bg-[var(--color-rose-dark)]"
          >
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
      {matchScore !== undefined && <MatchScoreBadge score={matchScore} />}
    </div>
  );

  return hideable ? <HideableCard id={tor.id}>{card}</HideableCard> : card;
}
