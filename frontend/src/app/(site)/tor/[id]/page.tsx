import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileX2,
  Flag,
  Hash,
  MapPin,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { formatBudget, formatThaiDate, formatThaiMonthYear, type FairnessField, type FairnessFlag } from "@/lib/mockData";
import { fetchTorById, fetchTorList, isUnknownDeadline } from "@/lib/torApi";
import { ANNOUNCEMENT_KIND_LABELS, statusNote } from "@/lib/torStatus";
import StatusBadge from "@/components/StatusBadge";
import BookmarkButton from "@/components/BookmarkButton";
import HideTorButton from "@/components/HideTorButton";
import TorViewCount from "@/components/TorViewCount";
import ReportIssueButton from "@/components/ReportIssueButton";
import ShareTorButtons from "@/components/ShareTorButtons";
import TORCard from "@/components/TORCard";

const FAIRNESS_FIELD_LABELS: Record<FairnessField, string> = {
  budget: "งบประมาณ",
  deadline: "กำหนดเวลา",
  category: "หมวดหมู่",
  agency: "หน่วยงาน",
  title: "ชื่อโครงการ",
  qualificationRequirements: "คุณสมบัติผู้เสนอราคา",
  other: "อื่นๆ",
};

const FAIRNESS_SEVERITY_LABELS: Record<FairnessFlag["severity"], string> = {
  low: "ควรสังเกตเล็กน้อย",
  medium: "ควรพิจารณาเพิ่มเติม",
  high: "ควรตรวจสอบเพิ่มเติม",
};

export default async function TORDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tor = await fetchTorById(id);
  if (!tor) notFound();

  const procurement = tor.procurement ?? null;
  const bidDeadline = procurement?.bidDeadline ?? null;
  // Forward the session so the vendor's hidden TORs are left out of "similar TORs".
  const torList = await fetchTorList((await cookies()).toString());
  const related = torList
    .filter((t) => t.category === tor.category && t.id !== tor.id)
    .slice(0, 3);

  const infoCards = [
    { icon: Hash, label: "เลขที่โครงการ", value: tor.projectCode },
    { icon: Building2, label: "หน่วยงานย่อย", value: tor.department },
    { icon: MapPin, label: "พื้นที่ดำเนินการ", value: tor.location },
    { icon: Eye, label: "จำนวนผู้เข้าชม", value: <TorViewCount torId={tor.id} initial={tor.views} /> },
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
              ประกาศเมื่อ {tor.announceDate ? formatThaiDate(tor.announceDate) : "ไม่ระบุ"}
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

          {procurement && procurement.announcements.length > 0 && (
            <div className="mt-8 card p-6 sm:p-7">
              <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
                ลำดับประกาศใน e-GP
              </h2>
              <ol className="mt-4 space-y-3">
                {procurement.announcements.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-rose-dark)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {ANNOUNCEMENT_KIND_LABELS[a.kind] ?? a.typeName ?? "ประกาศ"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {a.publishedAt ? formatThaiDate(a.publishedAt) : "ไม่ระบุวันที่"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
                {procurement.contractStatus && <span>สถานะสัญญา: {procurement.contractStatus}</span>}
                {procurement.lastCheckedAt && (
                  <span>ตรวจสอบสถานะล่าสุด {formatThaiDate(procurement.lastCheckedAt)}</span>
                )}
              </div>
            </div>
          )}

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
                      <span>{c.weight === undefined ? "ไม่ระบุน้ำหนัก" : `${c.weight}%`}</span>
                    </div>
                    {c.weight !== undefined && (
                      <div className="h-2 rounded-full bg-white overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-rose-dark)]"
                          style={{ width: `${c.weight}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 rounded-2xl bg-[var(--color-warning-bg)] px-3.5 py-3 text-xs text-[var(--color-warning)]">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              สรุปนี้สร้างขึ้นโดยระบบ AI จากเอกสาร TOR ต้นฉบับ อาจมีความคลาดเคลื่อนได้ โปรดตรวจสอบกับเอกสารต้นฉบับก่อนใช้ประกอบการตัดสินใจ
            </div>
          </div>

          {tor.fairnessFlags.length > 0 && (
            <div className="mt-8 card p-6 sm:p-7">
              <span className="badge bg-[var(--color-warning-bg)] text-[var(--color-warning)] py-1.5">
                <Flag size={14} />
                สัญญาณที่ควรตรวจสอบเพิ่มเติม · วิเคราะห์โดย AI
              </span>

              <ul className="mt-4 space-y-3">
                {tor.fairnessFlags.map((flag, i) => (
                  <li key={i} className="rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-[var(--color-text)]">
                        {FAIRNESS_FIELD_LABELS[flag.field]}
                      </p>
                      <span className="rounded-full bg-[var(--color-warning-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-warning)]">
                        {FAIRNESS_SEVERITY_LABELS[flag.severity]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[var(--color-text-muted)] leading-relaxed">
                      {flag.message}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[var(--color-warning-bg)] px-3.5 py-3 text-xs text-[var(--color-warning)]">
                <ShieldAlert size={15} className="mt-0.5 shrink-0" />
                สัญญาณเหล่านี้สร้างขึ้นโดยระบบ AI เพื่อใช้ประกอบการตรวจสอบเบื้องต้นเท่านั้น ไม่ใช่ข้อสรุปหรือข้อกล่าวหาว่ามีการกระทำผิดใดๆ
                โปรดตรวจสอบร่วมกับเอกสารต้นฉบับก่อนใช้ประกอบการตัดสินใจ
              </div>
            </div>
          )}

          <div className="mt-8">
            <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)] mb-2.5">
              รายละเอียดโครงการ
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{tor.description}</p>
          </div>

          {related.length > 0 && (
            <div className="mt-12">
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-text)] mb-4">
                TOR ในหมวดหมู่เดียวกัน
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
                {bidDeadline
                  ? procurement?.bidDeadlinePrecision === "month"
                    ? `เดือน ${formatThaiMonthYear(bidDeadline)}`
                    : formatThaiDate(bidDeadline)
                  : "ไม่ระบุ"}
              </p>
              <p
                className={`text-xs mt-1 font-medium ${
                  tor.status === "ใกล้ปิดรับ" ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"
                }`}
              >
                {statusNote(tor)}
              </p>
              {!bidDeadline && !isUnknownDeadline(tor.deadline) && (
                <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-text-faint)]">
                  วันที่ระบุในเอกสาร TOR (อ่านโดย AI): {formatThaiDate(tor.deadline)}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {tor.documentUrl ? (
                <a
                  href={tor.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-pill btn-pill-primary w-full py-2.5 text-sm"
                >
                  <Download size={16} />
                  ดาวน์โหลดเอกสารต้นฉบับ (PDF)
                </a>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-4 py-5 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--color-rose-dark)] shadow-[var(--shadow-sm)]">
                    <FileX2 size={18} />
                  </span>
                  <p className="text-xs font-semibold text-[var(--color-text)]">TOR นี้ไม่มีเอกสาร PDF</p>
                  <p className="text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                    ลองดูประกาศต้นฉบับที่ e-GP แทนด้านล่างนี้
                  </p>
                </div>
              )}
              {tor.sourceListingUrl && (
                <a
                  href={tor.sourceListingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-pill w-full border border-[var(--color-border-strong)] py-2.5 text-sm text-[var(--color-text)]"
                >
                  <ExternalLink size={16} />
                  ดูประกาศต้นฉบับที่ e-GP
                </a>
              )}
              <BookmarkButton id={tor.id} variant="full" />
              <HideTorButton id={tor.id} variant="full" />
              <ShareTorButtons torId={tor.id} />
              <ReportIssueButton torId={tor.id} projectCode={tor.projectCode} />
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
