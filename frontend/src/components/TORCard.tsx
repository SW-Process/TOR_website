import Link from "next/link";
import { ArrowUpRight, Building2, Eye } from "lucide-react";
import { TOR, daysUntil, formatBudget, formatThaiDate } from "@/lib/mockData";
import StatusBadge from "./StatusBadge";
import BookmarkButton from "./BookmarkButton";

export default function TORCard({ tor }: { tor: TOR }) {
  const remaining = daysUntil(tor.deadline);
  const deadlineLabel =
    tor.status === "ปิดรับแล้ว"
      ? `ปิดรับเมื่อ ${formatThaiDate(tor.deadline)}`
      : remaining <= 0
      ? "ปิดรับวันนี้"
      : `เหลือ ${remaining} วัน`;

  return (
    <div className="group isolate card overflow-hidden flex flex-col transition-shadow duration-300 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={tor.status} />
          <BookmarkButton id={tor.id} />
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
              {formatBudget(tor.budget)}
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
    </div>
  );
}
