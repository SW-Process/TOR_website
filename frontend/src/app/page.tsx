import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Building2,
  Landmark,
  Lock,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import HeroSearch from "@/components/HeroSearch";
import TORCard from "@/components/TORCard";
import AlertSignup from "@/components/AlertSignup";
import { agencies, categories, formatBudget, torList } from "@/lib/mockData";

const categoryIcon: Record<string, string> = {
  งานก่อสร้าง: "🏗️",
  เทคโนโลยีสารสนเทศ: "💻",
  งานที่ปรึกษา: "📋",
  จัดซื้อครุภัณฑ์: "🩺",
  งานบริการ: "🧹",
  บำรุงรักษา: "🛠️",
  สาธารณสุข: "🏥",
  สิ่งแวดล้อม: "🌳",
};

export default function Home() {
  const openTOR = torList.filter((t) => t.status !== "ปิดรับแล้ว");
  const totalOpenBudget = openTOR.reduce((sum, t) => sum + t.budget, 0);
  const latest = [...torList]
    .sort((a, b) => (a.announceDate < b.announceDate ? 1 : -1))
    .slice(0, 6);

  const trust = [
    { icon: ShieldCheck, title: "ข้อมูลจาก e-GP", sub: "กรมบัญชีกลาง" },
    { icon: RefreshCcw, title: "อัปเดตทุกวัน", sub: "ไม่พลาดประกาศใหม่" },
    { icon: Lock, title: "ใช้งานฟรี", sub: "ไม่ต้องเข้าสู่ระบบ" },
  ];

  const steps = [
    {
      icon: Search,
      title: "ค้นหาและกรอง TOR",
      desc: "ค้นหาด้วยคำสำคัญ กรองตามหน่วยงาน หมวดหมู่ งบประมาณ หรือวันปิดรับ",
    },
    {
      icon: Sparkles,
      title: "อ่านสรุปด้วย AI",
      desc: "สรุปประเด็นสำคัญ คุณสมบัติผู้เสนอราคา และเกณฑ์พิจารณาให้อัตโนมัติ",
    },
    {
      icon: Bookmark,
      title: "บันทึกและติดตาม",
      desc: "บันทึก TOR ที่สนใจ ดาวน์โหลดเอกสาร และตั้งแจ้งเตือนเมื่อมีประกาศใหม่",
    },
  ];

  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--color-blush)]">
        <div className="container-page relative grid lg:grid-cols-2 gap-10 items-center py-14 sm:py-20">
          <div>
            <span className="eyebrow">Bangkok Procurement Platform</span>
            <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl sm:text-5xl font-extrabold leading-[1.08] text-[var(--color-text)]">
              ค้นหา TOR ได้ง่าย
              <br />
              <span className="text-[var(--color-rose-dark)]">แบบที่ควรเป็น</span>
            </h1>
            <p className="mt-5 max-w-md text-[var(--color-ink-soft)] text-base leading-relaxed">
              รวมประกาศจัดซื้อจัดจ้างของกรุงเทพมหานครไว้ในที่เดียว พร้อมสรุปสาระสำคัญด้วย AI
              ค้นหาได้ฟรี ไม่ต้องเข้าสู่ระบบ
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/tor" className="btn-pill btn-pill-primary py-3 pl-6 pr-2">
                เริ่มค้นหา TOR
                <span className="btn-icon-circle">
                  <ArrowUpRight size={15} />
                </span>
              </Link>
              <Link
                href="/tor?sort=deadline"
                className="btn-pill border border-[var(--color-ink)]/15 bg-white/60 px-5 py-3 text-sm text-[var(--color-text)] hover:bg-white transition-colors"
              >
                ดู TOR ใกล้ปิดรับ
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {trust.map((t) => (
                <div key={t.title} className="flex flex-col gap-1.5">
                  <t.icon size={18} className="text-[var(--color-rose-dark)]" />
                  <p className="text-xs font-semibold text-[var(--color-text)] leading-tight">{t.title}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-tight">{t.sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block h-[420px]">
            <div className="absolute -top-6 -right-4 h-72 w-72 rounded-full bg-[var(--color-blush-deep)] blur-3xl opacity-70" />
            <div className="absolute bottom-6 left-4 h-56 w-56 rounded-full bg-white blur-3xl opacity-60" />

            <div className="absolute top-10 left-6 w-[300px] rotate-[-4deg] rounded-[1.75rem] bg-white p-5 shadow-[var(--shadow-lg)]">
              <span className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]">เปิดรับ</span>
              <p className="mt-3 font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)] leading-snug">
                จ้างพัฒนาระบบแพลตฟอร์มสืบค้นประกาศจัดซื้อจัดจ้างกลาง
              </p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">สำนักยุทธศาสตร์และประเมินผล</p>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                <span className="font-[family-name:var(--font-heading)] font-extrabold text-[var(--color-rose-dark)]">
                  ฿8.5M
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-ink)] text-white">
                  <ArrowUpRight size={15} />
                </span>
              </div>
            </div>

            <div className="absolute bottom-8 right-4 w-56 rotate-[3deg] rounded-[1.75rem] bg-white p-5 shadow-[var(--shadow-lg)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                <Sparkles size={16} />
              </span>
              <p className="mt-3 text-sm font-bold text-[var(--color-text)]">สรุปด้วย AI แล้ว</p>
              <p className="text-xs text-[var(--color-text-muted)]">ทุกประกาศ 100%</p>
            </div>

            <div className="absolute top-1/2 right-16 flex h-24 w-24 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[var(--color-ink)] text-center text-white shadow-[var(--shadow-lg)]">
              <span className="font-[family-name:var(--font-heading)] text-base font-extrabold">
                {openTOR.length}
              </span>
              <span className="text-[10px] leading-tight px-2">TOR เปิดรับ</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page mt-16">
        <div className="text-center mb-8">
          <span className="eyebrow">หมวดหมู่</span>
          <h2 className="mt-1.5 font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
            เลือกดูตามหมวดหมู่งาน
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {categories.map((c) => {
            const count = torList.filter((t) => t.category === c).length;
            return (
              <Link key={c} href={`/tor?category=${encodeURIComponent(c)}`} className="group flex flex-col items-center gap-3 text-center">
                <span className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-blush-deep)] text-3xl sm:text-4xl transition-transform group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-md)]">
                  {categoryIcon[c]}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-text)]">{c}</span>
                  <span className="block text-xs text-[var(--color-text-faint)]">{count} โครงการ</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container-page mt-16">
        <div className="card overflow-hidden bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-blush-soft)] border-none p-8 sm:p-12">
          <div className="grid md:grid-cols-[1.3fr_1fr] gap-8 items-center">
            <div>
              <span className="eyebrow">โปร่งใสทุกขั้นตอน</span>
              <h2 className="mt-2 font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold leading-tight text-[var(--color-text)]">
                ข้อมูลจัดซื้อจัดจ้างที่
                <span className="text-[var(--color-rose-dark)]"> ตรวจสอบได้</span>
              </h2>
              <p className="mt-3 max-w-md text-sm text-[var(--color-ink-soft)] leading-relaxed">
                เปิดให้ประชาชนและผู้ประกอบการเข้าถึงประกาศจัดซื้อจัดจ้างของกรุงเทพมหานครได้ฟรี
                เพื่อส่งเสริมความโปร่งใสของภาครัฐ
              </p>
              <Link href="/tor" className="btn-pill btn-pill-primary mt-6 py-3 pl-6 pr-2">
                ดูประกาศทั้งหมด
                <span className="btn-icon-circle">
                  <ArrowUpRight size={15} />
                </span>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Wallet size={18} className="text-[var(--color-rose-dark)]" />
                <p className="mt-2 font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
                  {formatBudget(totalOpenBudget)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">งบประมาณเปิดรับ</p>
              </div>
              <div>
                <Landmark size={18} className="text-[var(--color-rose-dark)]" />
                <p className="mt-2 font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
                  {agencies.length} หน่วยงาน
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">เผยแพร่ประกาศ</p>
              </div>
              <div>
                <Sparkles size={18} className="text-[var(--color-rose-dark)]" />
                <p className="mt-2 font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
                  100%
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">สรุปด้วย AI</p>
              </div>
              <div>
                <Building2 size={18} className="text-[var(--color-rose-dark)]" />
                <p className="mt-2 font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
                  {openTOR.length} โครงการ
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">เปิดรับขณะนี้</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page mt-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="eyebrow">ประกาศล่าสุด</span>
            <h2 className="mt-1.5 font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
              TOR ที่เพิ่งประกาศ
            </h2>
          </div>
          <Link
            href="/tor"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-rose-dark)] hover:underline"
          >
            ดูทั้งหมด
            <ArrowRight size={15} />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {latest.map((tor) => (
            <TORCard key={tor.id} tor={tor} />
          ))}
        </div>
        <Link
          href="/tor"
          className="btn-pill sm:hidden mt-6 w-full border border-[var(--color-border-strong)] py-3 text-sm font-semibold text-[var(--color-text)]"
        >
          ดูทั้งหมด
          <ArrowRight size={15} />
        </Link>
      </section>

      <section className="container-page mt-20">
        <div className="text-center max-w-xl mx-auto">
          <span className="eyebrow">วิธีใช้งาน</span>
          <h2 className="mt-1.5 font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">
            ใช้งานง่ายเพียง 3 ขั้นตอน
          </h2>
        </div>
        <div className="mt-9 grid md:grid-cols-3 gap-5">
          {steps.map((step, i) => (
            <div key={step.title} className="card p-7 relative">
              <span className="absolute top-6 right-6 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-border-strong)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                <step.icon size={20} />
              </span>
              <h3 className="mt-4 font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page mt-16 mb-20">
        <AlertSignup />
      </section>
    </div>
  );
}
