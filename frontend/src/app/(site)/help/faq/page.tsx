import type { Metadata } from "next";
import HelpShell, { HelpEmpty, HelpRow, HelpSection } from "@/components/help/HelpShell";
import { fetchFaqs, fetchHelpHome } from "@/lib/helpApi";

export const metadata: Metadata = { title: "คำถามที่พบบ่อย | ศูนย์ช่วยเหลือ TOR Checker" };

type SearchParams = Promise<{ category?: string | string[]; q?: string | string[] }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export default async function HelpFaqListPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q)?.slice(0, 100);
  const home = await fetchHelpHome();
  const categories = home?.categories ?? [];
  // Unknown category slugs fall back to "all" instead of an API 400.
  const category = categories.find((c) => c.slug === first(sp.category));
  const faqs = await fetchFaqs({ category: category?.slug, q });
  const labelOf = new Map(categories.map((c) => [c.slug, c.label]));

  const title = q ? `ผลการค้นหา “${q}”` : category ? category.label : "คำถามที่พบบ่อย";
  const crumb = q ? "ผลการค้นหา" : category ? category.label : "คำถามที่พบบ่อย";

  return (
    <HelpShell categories={categories} activeCategory={category?.slug} query={q} breadcrumb={[{ label: crumb }]}>
      <HelpSection title={title}>
        {faqs.length === 0 ? (
          <HelpEmpty>
            {q ? (
              <>
                ไม่พบคำถามที่ตรงกับ “{q}” ลองใช้คำอื่น หรือเลือกหมวดจาก <span className="font-semibold">คู่มือช่วยเหลือ</span>
              </>
            ) : (
              "ยังไม่มีคำถามในหมวดนี้"
            )}
          </HelpEmpty>
        ) : (
          faqs.map((f) => (
            <HelpRow
              key={f.id}
              href={`/help/faq/${f.id}`}
              title={f.question}
              meta={category ? undefined : labelOf.get(f.category)}
            />
          ))
        )}
      </HelpSection>
    </HelpShell>
  );
}
