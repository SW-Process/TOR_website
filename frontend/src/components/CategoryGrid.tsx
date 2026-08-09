import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Category, categories, torList } from "@/lib/mockData";

import imgConstruction from "./picture/งานก่อสร้าง.jpg";
import imgIT from "./picture/เทคโนโลยีสารสนเทศ.jpg";
import imgConsulting from "./picture/งานที่ปรึกษา.jpg";
import imgProcurement from "./picture/จัดซื้อครุภัณฑ์.jpg";
import imgService from "./picture/งานบริการ.jpg";
import imgMaintenance from "./picture/บำรุงรักษา.jpg";
import imgHealth from "./picture/สาธารณสุข.jpg";
import imgEnvironment from "./picture/สิ่งแวดล้อม.jpg";

const categoryImage: Record<Category, typeof imgConstruction> = {
  งานก่อสร้าง: imgConstruction,
  เทคโนโลยีสารสนเทศ: imgIT,
  งานที่ปรึกษา: imgConsulting,
  จัดซื้อครุภัณฑ์: imgProcurement,
  งานบริการ: imgService,
  บำรุงรักษา: imgMaintenance,
  สาธารณสุข: imgHealth,
  สิ่งแวดล้อม: imgEnvironment,
};

export default function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {categories.map((c) => {
        const count = torList.filter((t) => t.category === c).length;
        return (
          <Link
            key={c}
            href={`/tor?category=${encodeURIComponent(c)}`}
            className="group isolate card overflow-hidden transition-shadow duration-300 hover:shadow-[var(--shadow-lg)]"
          >
            <div className="relative isolate aspect-[16/10] w-full overflow-hidden bg-[var(--color-blush-soft)]">
              <Image
                src={categoryImage[c]}
                alt={c}
                fill
                sizes="(min-width: 1024px) 22vw, 45vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-[var(--color-rose-dark)]/15" />
              <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/25" />
              <span className="badge absolute top-3 left-3 bg-white/95 text-[var(--color-text)] shadow-[var(--shadow-sm)]">
                {count} โครงการ
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 p-4">
              <span className="font-[family-name:var(--font-heading)] text-sm font-bold text-[var(--color-text)] leading-snug">
                {c}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-white transition-colors duration-300 group-hover:bg-[var(--color-rose-dark)]">
                <ArrowUpRight size={15} />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
