import Link from "next/link";
import Image from "next/image";
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
import CategoryGrid from "@/components/CategoryGrid";
import StatusBadge from "@/components/StatusBadge";
import mascotPeek from "@/components/picture/bottom.png";
import mascotSign from "@/components/picture/circle.png";
import mascotHug from "@/components/picture/hug.png";
import { formatBudget } from "@/lib/mockData";
import { fetchTorList } from "@/lib/torApi";

/** "฿8.5M"-style budget for the compact hero card. */
function formatCompactBaht(amount: number): string {
  if (!amount) return "ไม่ระบุงบ";
  return `฿${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(amount)}`;
}

export default async function Home() {
  const torList = await fetchTorList();
  const openTOR = torList.filter((t) => t.status !== "ปิดรับแล้ว");
  const totalOpenBudget = openTOR.reduce((sum, t) => sum + t.budget, 0);
  const agencyCount = new Set(torList.map((t) => t.agency)).size;
  const latest = [...torList]
    .sort((a, b) => (a.announceDate < b.announceDate ? 1 : -1))
    .slice(0, 6);
  // Hero showcase: the newest TOR still taking bids.
  const featured = latest.find((t) => t.status !== "ปิดรับแล้ว") ?? latest[0];

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
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,_var(--color-blush-deep)_0%,_var(--color-blush)_40%,_var(--color-blush-soft)_75%,_#ffffff_100%)] min-h-[72svh] flex items-center">
        <div
          className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(34,26,24,0.18)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_80%_60%_at_60%_40%,black_10%,transparent_75%)]"
          aria-hidden
        />
        <div className="container-page relative grid lg:grid-cols-2 gap-10 items-center py-14 w-full">
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
                className="btn-pill border border-[var(--color-border-strong)] bg-white px-5 py-3 text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)] hover:border-[var(--color-ink)]/30 transition-colors"
              >
                ดู TOR ใกล้ปิดรับ
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {trust.map((t) => (
                <div key={t.title} className="flex flex-col gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[var(--shadow-sm)] text-[var(--color-rose-dark)]">
                    <t.icon size={16} />
                  </span>
                  <p className="text-xs font-semibold text-[var(--color-text)] leading-tight">{t.title}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-tight">{t.sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block h-[460px]">
            <div className="animate-blob-a absolute -top-10 -right-10 h-80 w-80 rounded-full bg-[var(--color-rose-light)] blur-3xl opacity-80" />
            <div
              className="animate-blob-b absolute top-1/3 -left-16 h-64 w-64 rounded-full bg-[var(--color-blush-deep)] blur-3xl opacity-70"
              style={{ animationDelay: "-3s" }}
            />
            <div
              className="animate-blob-c absolute bottom-0 left-10 h-56 w-56 rounded-full bg-white blur-3xl opacity-70"
              style={{ animationDelay: "-1.5s" }}
            />
            <div
              className="animate-blob-a absolute top-6 right-24 h-40 w-40 rounded-full bg-[var(--color-rose)] blur-3xl opacity-20"
              style={{ animationDelay: "-5s" }}
            />

            <span className="animate-dot-pulse absolute top-2 right-28 h-2.5 w-2.5 rounded-full bg-[var(--color-rose-dark)]" />
            <span
              className="animate-dot-pulse absolute top-1/2 left-0 h-2 w-2 rounded-full bg-[var(--color-rose-dark)]/60"
              style={{ animationDelay: "-2s" }}
            />

            {featured && (
              <>
                <div className="absolute top-[210px] left-16 h-8 w-[240px] rotate-[-4deg] rounded-full bg-black/15 blur-xl" />
                <div className="animate-card-bob absolute top-10 left-6 w-[300px]">
                  <Link
                    href={`/tor/${featured.id}`}
                    className="group relative block rotate-[-4deg] rounded-[1.75rem] bg-white p-5 ring-1 ring-black/[0.03]"
                    style={{ boxShadow: "0 24px 48px -16px rgba(224,87,119,0.35), 0 10px 24px rgba(34,26,24,0.06)" }}
                  >
                    {/* Mascot peeking over the card's top-right edge; its paws sit on the edge. */}
                    <Image
                      src={mascotPeek}
                      alt=""
                      width={150}
                      // ~3× the drawn width so it stays sharp on retina screens and when zoomed in.
                      sizes="450px"
                      priority
                      className="pointer-events-none absolute z-10 select-none"
                      style={{
                        top: -76,
                        right: -16,
                        width: 150,
                        height: "auto",
                        filter: "drop-shadow(0 8px 12px rgba(224,87,119,0.18))",
                      }}
                    />
                    <StatusBadge status={featured.status} />
                    <p className="mt-3 line-clamp-2 font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)] leading-snug">
                      {featured.title}
                    </p>
                    <p className="mt-2 truncate text-xs text-[var(--color-text-muted)]">{featured.agency}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                      <span className="font-[family-name:var(--font-heading)] font-extrabold text-[var(--color-rose-dark)]">
                        {formatCompactBaht(featured.budget)}
                      </span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-ink)] text-white transition-transform group-hover:scale-110">
                        <ArrowUpRight size={15} />
                      </span>
                    </div>
                  </Link>
                </div>
              </>
            )}

            <div className="absolute rotate-[3deg] rounded-full bg-black/15 blur-xl" style={{ bottom: -8, right: 46, width: 170, height: 28 }} />
            <div className="animate-card-bob absolute" style={{ bottom: 0, right: 30, width: 202, animationDelay: "-2.5s" }}>
              <div
                className="relative rotate-[3deg] rounded-[1.75rem] bg-white ring-1 ring-black/[0.03]"
                style={{ padding: "20px 34px", boxShadow: "0 24px 48px -16px rgba(224,87,119,0.3), 0 10px 24px rgba(34,26,24,0.06)" }}
              >
                {/* Mascot hugging the card: head above it, hands gripping its
                    left/right edges (hands sit at ~17% / ~80% of hug.png). */}
                <Image
                  src={mascotHug}
                  alt=""
                  width={320}
                  // ~3× the drawn width so it stays sharp on retina screens and when zoomed in.
                  sizes="960px"
                  className="pointer-events-none absolute z-10 select-none"
                  style={{ left: -54, top: -190, width: 320, maxWidth: "none", height: "auto", filter: "drop-shadow(0 10px 14px rgba(224,87,119,0.2))" }}
                />
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                  <Sparkles size={16} />
                </span>
                <p className="mt-3 text-sm font-bold text-[var(--color-text)]">สรุปด้วย AI แล้ว</p>
                {/* /api/tors only serves enriched TORs, so every one listed has a summary. */}
                <p className="text-xs text-[var(--color-text-muted)]">
                  {torList.length.toLocaleString("th-TH")} ประกาศ
                </p>
              </div>
            </div>

            {/* Mascot holding the open-TOR count up like a sign: the stick's tip
                (≈79%, 8% of circle.png) tucks behind the bottom of the circle. */}
            <div className="animate-card-bob absolute" style={{ left: 30, bottom: -40, width: 182, height: 201, animationDelay: "-4s" }}>
              <Image
                src={mascotSign}
                alt=""
                width={170}
                // ~3× the drawn width so it stays sharp on retina screens and when zoomed in.
                sizes="510px"
                className="pointer-events-none absolute select-none"
                style={{ left: 0, top: 62, width: 170, height: "auto", filter: "drop-shadow(0 12px 16px rgba(224,87,119,0.22))" }}
              />
              <div
                className="absolute z-10 flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[var(--color-ink)] text-center text-white"
                style={{ left: 86, top: 0, boxShadow: "0 20px 40px -12px rgba(34,26,24,0.45)" }}
              >
                <span className="font-[family-name:var(--font-heading)] text-base font-extrabold">
                  {openTOR.length}
                </span>
                <span className="text-[10px] leading-tight px-2">TOR เปิดรับ</span>
              </div>
            </div>

            <div className="animate-card-bob absolute" style={{ top: 40, right: 0, animationDelay: "-3.5s" }}>
              <div
                className="flex items-center gap-2 rounded-full bg-white pl-1.5 pr-4 py-1.5 ring-1 ring-black/[0.03]"
                style={{ boxShadow: "0 16px 32px -14px rgba(224,87,119,0.3), 0 6px 16px rgba(34,26,24,0.06)" }}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)]">
                  <ShieldCheck size={14} />
                </span>
                <span className="text-xs font-semibold text-[var(--color-text)]">ข้อมูลยืนยันจาก e-GP</span>
              </div>
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
        <CategoryGrid torList={torList} />
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
                  {agencyCount} หน่วยงาน
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">เผยแพร่ประกาศ</p>
              </div>
              <div>
                <Sparkles size={18} className="text-[var(--color-rose-dark)]" />
                <p className="mt-2 font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
                  {torList.length.toLocaleString("th-TH")} ประกาศ
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">สรุปด้วย AI แล้ว</p>
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
