import { Pin } from "lucide-react";
import { formatThaiDate } from "@/lib/mockData";
import { ANNOUNCEMENT_KIND_LABELS, type HelpAnnouncementSummary } from "@/lib/helpApi";

/** Title with LINE's "[สิ้นสุด]" prefix once the announcement has ended. */
export function announcementTitle(a: Pick<HelpAnnouncementSummary, "title" | "ended">): string {
  return a.ended ? `[สิ้นสุด] ${a.title}` : a.title;
}

/** Small line under a title: pin, kind, publish date. */
export function AnnouncementMeta({ a }: { a: HelpAnnouncementSummary }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {a.pinned && !a.ended && (
        <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-rose-dark)]">
          <Pin size={11} />
          ปักหมุด
        </span>
      )}
      <span>{ANNOUNCEMENT_KIND_LABELS[a.kind]}</span>
      {a.publishedAt && <span>· {formatThaiDate(a.publishedAt)}</span>}
    </span>
  );
}
