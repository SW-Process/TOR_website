import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleHelp } from "lucide-react";
import HelpShell, { HelpRow, HelpSection } from "@/components/help/HelpShell";
import HelpBody from "@/components/help/HelpBody";
import { fetchFaq, fetchHelpHome } from "@/lib/helpApi";
import { formatThaiDate } from "@/lib/mockData";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await fetchFaq((await params).id);
  return { title: found ? `${found.faq.question} | ศูนย์ช่วยเหลือ TOR Checker` : "ไม่พบคำถาม | TOR Checker" };
}

export default async function HelpFaqPage({ params }: { params: Params }) {
  const { id } = await params;
  const [home, found] = await Promise.all([fetchHelpHome(), fetchFaq(id)]);
  if (!found) notFound();
  const { faq, related } = found;
  const category = home?.categories.find((c) => c.slug === faq.category);

  return (
    <HelpShell
      categories={home?.categories ?? []}
      activeCategory={faq.category}
      breadcrumb={[
        ...(category ? [{ label: category.label, href: `/help/faq?category=${category.slug}` }] : []),
        { label: faq.question },
      ]}
    >
      <article className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-sm)] sm:p-10">
        {category && <p className="text-xs font-bold text-[var(--color-rose-dark)]">{category.label}</p>}
        <h1 className="mt-2 flex items-start gap-3 font-[family-name:var(--font-heading)] text-2xl font-extrabold leading-snug text-[var(--color-text)] sm:text-3xl">
          <CircleHelp size={28} className="mt-1 shrink-0 text-[var(--color-rose)]" />
          {faq.question}
        </h1>
        <hr className="my-7 border-[var(--color-border)]" />
        <HelpBody text={faq.answer} />
        <p className="mt-8 text-xs text-[var(--color-text-faint)]">อัปเดตล่าสุด {formatThaiDate(faq.updatedAt)}</p>
      </article>

      {related.length > 0 && (
        <div className="mt-12">
          <HelpSection title="คำถามที่เกี่ยวข้อง">
            {related.map((f) => (
              <HelpRow key={f.id} href={`/help/faq/${f.id}`} title={f.question} />
            ))}
          </HelpSection>
        </div>
      )}

      <Link
        href="/help/faq"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-rose-dark)]"
      >
        <ArrowLeft size={15} />
        คำถามทั้งหมด
      </Link>
    </HelpShell>
  );
}
