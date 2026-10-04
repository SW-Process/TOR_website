import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import HelpShell from "@/components/help/HelpShell";
import HelpBody from "@/components/help/HelpBody";
import { AnnouncementMeta, announcementTitle } from "@/components/help/announcementBits";
import { fetchAnnouncement, fetchHelpHome } from "@/lib/helpApi";
import { formatThaiDate } from "@/lib/mockData";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const a = await fetchAnnouncement((await params).id);
  return { title: a ? `${announcementTitle(a)} | ศูนย์ช่วยเหลือ TOR Checker` : "ไม่พบประกาศ | TOR Checker" };
}

export default async function HelpAnnouncementPage({ params }: { params: Params }) {
  const { id } = await params;
  const [home, a] = await Promise.all([fetchHelpHome(), fetchAnnouncement(id)]);
  if (!a) notFound();

  return (
    <HelpShell
      categories={home?.categories ?? []}
      breadcrumb={[{ label: "ประกาศ", href: "/help/announcements" }, { label: a.title }]}
    >
      <article className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-sm)] sm:p-10">
        <div className="text-xs text-[var(--color-text-muted)]">
          <AnnouncementMeta a={a} />
        </div>
        <h1 className="mt-3 font-[family-name:var(--font-heading)] text-2xl font-extrabold leading-snug text-[var(--color-text)] sm:text-3xl">
          {announcementTitle(a)}
        </h1>
        {a.ended && a.endsAt && (
          <p className="mt-3 inline-block rounded-full bg-[var(--color-surface-alt)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            สิ้นสุดเมื่อ {formatThaiDate(a.endsAt)}
          </p>
        )}
        <hr className="my-7 border-[var(--color-border)]" />
        <HelpBody text={a.body} />
      </article>
      <Link
        href="/help/announcements"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-rose-dark)]"
      >
        <ArrowLeft size={15} />
        ประกาศทั้งหมด
      </Link>
    </HelpShell>
  );
}
