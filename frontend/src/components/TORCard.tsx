import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Building2, Eye } from "lucide-react";
import { TOR, daysUntil, formatBudget, formatThaiDate } from "@/lib/mockData";
import StatusBadge from "./StatusBadge";
import BookmarkButton from "./BookmarkButton";

import imgITPortal from "./picture/mock/จ้างพัฒนาระบบแพลตฟอร์มสืบค้นประกาศจัดซื้อจัดจ้างกลาง (e-Procurement Portal).jpg";
import imgRoadConstruction from "./picture/mock/ประกวดราคาจ้างก่อสร้างปรับปรุงผิวจราจรถนนสายรอง เขตบางรัก.jpeg";
import imgFloodConsulting from "./picture/mock/จ้างที่ปรึกษาจัดทำแผนแม่บทการจัดการน้ำท่วมและระบายน้ำระยะยาว.jpg";
import imgMedicalEquip from "./picture/mock/จัดซื้อครุภัณฑ์ทางการแพทย์ เครื่องช่วยหายใจชนิดควบคุมปริมาตรและความดัน.jpg";
import imgCleaningService from "./picture/mock/จ้างเหมาบริการทำความสะอาดอาคารสำนักงานเขตและพื้นที่โดยรอบ.jpeg";
import imgCCTVMaintenance from "./picture/mock/จ้างบำรุงรักษาระบบกล้องโทรทัศน์วงจรปิด (CCTV) พื้นที่สาธารณะ.jpg";
import imgEIAConsulting from "./picture/mock/จ้างที่ปรึกษาประเมินผลกระทบสิ่งแวดล้อมโครงการก่อสร้างสวนสาธารณะริมคลอง.jpg";
import imgSchoolComputers from "./picture/mock/จัดซื้อครุภัณฑ์คอมพิวเตอร์และอุปกรณ์ต่อพ่วงสำหรับโรงเรียนในสังกัด.jpg";

const torImage: Record<string, typeof imgITPortal> = {
  "tor-2026-0142": imgITPortal,
  "tor-2026-0138": imgRoadConstruction,
  "tor-2026-0135": imgFloodConsulting,
  "tor-2026-0129": imgMedicalEquip,
  "tor-2026-0121": imgCleaningService,
  "tor-2026-0118": imgCCTVMaintenance,
  "tor-2026-0111": imgEIAConsulting,
  "tor-2026-0104": imgSchoolComputers,
};

export default function TORCard({ tor }: { tor: TOR }) {
  const remaining = daysUntil(tor.deadline);
  const deadlineLabel =
    tor.status === "ปิดรับแล้ว"
      ? `ปิดรับเมื่อ ${formatThaiDate(tor.deadline)}`
      : remaining <= 0
      ? "ปิดรับวันนี้"
      : `เหลือ ${remaining} วัน`;
  const image = torImage[tor.id];

  return (
    <div className="group isolate card overflow-hidden flex flex-col transition-shadow duration-300 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5">
      <Link href={`/tor/${tor.id}`} className="relative isolate block aspect-[16/9] w-full shrink-0 overflow-hidden bg-[var(--color-blush-soft)]">
        {image ? (
          <>
            <Image
              src={image}
              alt={tor.title}
              fill
              sizes="(min-width: 1024px) 33vw, 90vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-blush-deep)]" />
        )}
        <span className="absolute top-3 left-3">
          <StatusBadge status={tor.status} />
        </span>
        <span className="absolute top-3 right-3">
          <BookmarkButton id={tor.id} />
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
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
