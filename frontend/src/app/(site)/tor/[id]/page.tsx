import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Download,
  Eye,
  Hash,
  MapPin,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  daysUntil,
  formatBudget,
  formatThaiDate,
  getTORById,
  torList,
} from "@/lib/mockData";
import StatusBadge from "@/components/StatusBadge";
import BookmarkButton from "@/components/BookmarkButton";
import ReportIssueButton from "@/components/ReportIssueButton";
import TORCard from "@/components/TORCard";

export default async function TORDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tor = getTORById(id);
  if (!tor) notFound();

  const remaining = daysUntil(tor.deadline);
  const related = torList
    .filter((t) => t.category === tor.category && t.id !== tor.id)
    .slice(0, 3);

  const infoCards = [
    { icon: Hash, label: "เลขที่โครงการ", value: tor.projectCode },
    { icon: Building2, label: "หน่วยงานย่อย", value: tor.department },
    { icon: MapPin, label: "พื้นที่ดำเนินการ", value: tor.location },
    { icon: Eye, label: "จำนวนผู้เข้าชม", value: `${tor.views.toLocaleString("th-TH")} ครั้ง` },
  ];

  return (
    <div className="container-page py-8">
      <nav className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mb-5">
        <Link href="/" className="hover:text-[var(--color-rose-dark)]">หน้าแรก</Link>
        <ChevronRight size={13} />
        <Link href="/tor" className="hover:text-[var(--color-rose-dark)]">ค้นหา TOR</Link>
        <ChevronRight size={13} />
        <span className="text-[var(--color-text)]">{tor.projectCode}</span>
      </nav>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <StatusBadge status={tor.status} />
            <span className="badge bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">{tor.category}</span>
          </div>

          <h1 className="font-[family-name:var(--font-heading)] text-2xl sm:text-3xl font-extrabold leading-snug text-[var(--color-text)]">
            {tor.title}
          </h1>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5">
              <Building2 size={15} />
              {tor.agency}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarClock size={15} />
              ประกาศเมื่อ {formatThaiDate(tor.announceDate)}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {infoCards.map((c) => (
              <div key={c.label} className="card p-4">
                <c.icon size={16} className="text-[var(--color-rose-dark)]" />
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">{c.label}</p>
                <p className="text-sm font-semibold text-[var(--color-text)] mt-0.5 break-words">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 card p-6 sm:p-7 bg-gradient-to-br from-white to-[var(--color-blush-soft)]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="badge bg-white text-[var(--color-rose-dark)] shadow-[var(--shadow-sm)] py-1.5">
                <Sparkles size={14} />
                สรุปสาระสำคัญโดย AI · ความเชื่อมั่น{tor.summary.confidence}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                สร้างเมื่อ {formatThaiDate(tor.summary.generatedAt)}
              </span>
            </div>

            <div className="mt-5">
              <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
                ประเด็นสำคัญของโครงการ
              </h2>
              <ul className="mt-2.5 space-y-2">
                {tor.summary.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-[var(--color-text)] leading-relaxed">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-rose-dark)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
                คุณสมบัติผู้เสนอราคา
              </h2>
              <ul className="mt-2.5 space-y-2">
                {tor.summary.qualifications.map((q, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-[var(--color-text)] leading-relaxed">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ink)]" />
                    {q}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
                เกณฑ์การพิจารณา
              </h2>
              <div className="mt-3 space-y-2.5">
                {tor.summary.evaluationCriteria.map((c) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
                      <span>{c.label}</span>
                      <span>{c.weight}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-rose-dark)]"
                        style={{ width: `${c.weight}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 rounded-2xl bg-[var(--color-warning-bg)] px-3.5 py-3 text-xs text-[var(--color-warning)]">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              สรุปนี้สร้างขึ้นโดยระบบ AI จากเอกสาร TOR ต้นฉบับ อาจมีความคลาดเคลื่อนได้ โปรดตรวจสอบกับเอกสารต้นฉบับก่อนใช้ประกอบการตัดสินใจ
            </div>
          </div>

          <div className="mt-8">
            <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)] mb-2.5">
              รายละเอียดโครงการ
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{tor.description}</p>
          </div>

          {related.length > 0 && (
            <div className="mt-12">
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)] mb-4">
                TOR ที่เกี่ยวข้อง
              </h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {related.map((t) => (
                  <TORCard key={t.id} tor={t} />
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="card p-5">
            <p className="text-xs text-[var(--color-text-muted)]">งบประมาณโครงการ</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-[var(--color-rose-dark)] mt-1">
              {formatBudget(tor.budget)}
            </p>

            <div className="mt-4 rounded-2xl bg-[var(--color-surface-alt)] px-3.5 py-3">
              <p className="text-xs text-[var(--color-text-muted)]">กำหนดยื่นข้อเสนอ</p>
              <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">
                {formatThaiDate(tor.deadline)}
              </p>
              {tor.status !== "ปิดรับแล้ว" && (
                <p
                  className={`text-xs mt-1 font-medium ${
                    remaining <= 5 ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {remaining > 0 ? `เหลืออีก ${remaining} วัน` : "ปิดรับวันนี้"}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <a href={tor.documentUrl} className="btn-pill btn-pill-primary w-full py-2.5 text-sm">
                <Download size={16} />
                ดาวน์โหลดเอกสารต้นฉบับ (PDF)
              </a>
              <BookmarkButton id={tor.id} variant="full" />
              <ReportIssueButton torId={tor.projectCode} />
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              เอกสารต้นฉบับดึงข้อมูลจากระบบ e-GP กรมบัญชีกลาง หากพบว่าไฟล์ไม่ตรงกับประกาศล่าสุด
              โปรดยึดถือข้อมูลจากเว็บไซต์หน่วยงานเจ้าของโครงการเป็นหลัก
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
