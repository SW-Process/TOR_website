import Link from "next/link";
import { FileSearch, Mail, ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-16 rounded-t-[2rem] bg-[var(--color-ink)] text-white">
      <div className="container-page py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
              <FileSearch size={16} />
            </span>
            <span className="font-[family-name:var(--font-heading)] text-base font-semibold tracking-tight">
              TOR Insight
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/60 max-w-md">
            แพลตฟอร์มรวบรวมและสรุปประกาศจัดซื้อจัดจ้าง (TOR) ของหน่วยงานในสังกัดกรุงเทพมหานคร
            ด้วยเทคโนโลยี AI เพื่อเพิ่มความโปร่งใสและลดภาระผู้ประกอบการในการติดตามข้อมูล
          </p>
          <div className="mt-5 flex items-start gap-2 text-xs text-white/45 max-w-md">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
            <span>
              ข้อมูลประกาศจัดซื้อจัดจ้างรวบรวมจากระบบจัดซื้อจัดจ้างภาครัฐ (e-GP)
              กรมบัญชีกลาง เอกสารต้นฉบับให้ยึดถือข้อมูลจากหน่วยงานเจ้าของประกาศเป็นหลัก
            </span>
          </div>
        </div>

        <div>
          <h3 className="eyebrow text-white/50">เมนูลัด</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-white/65">
            <li><Link href="/" className="hover:text-white transition-colors">หน้าแรก</Link></li>
            <li><Link href="/tor" className="hover:text-white transition-colors">ค้นหา TOR</Link></li>
            <li><Link href="/bookmarks" className="hover:text-white transition-colors">รายการที่บันทึก</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow text-white/50">ติดต่อ / แจ้งปัญหา</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-white/65">
            <li className="flex items-center gap-2">
              <Mail size={13} />
              <span>support@tor-insight.go.th (ตัวอย่าง)</span>
            </li>
            <li><Link href="#" className="hover:text-white transition-colors">นโยบายความเป็นส่วนตัว (PDPA)</Link></li>
            <li><Link href="#" className="hover:text-white transition-colors">ข้อกำหนดการใช้งาน</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page py-4 text-xs text-white/40 flex flex-col sm:flex-row gap-2 sm:justify-between">
          <span>© 2569 TOR Insight — โครงการต้นแบบ (Mock Frontend) ไม่ใช่บริการทางราชการอย่างเป็นทางการ</span>
          <span>ข้อมูลทั้งหมดในหน้านี้เป็นข้อมูลจำลองเพื่อการนำเสนอต้นแบบ</span>
        </div>
      </div>
    </footer>
  );
}
