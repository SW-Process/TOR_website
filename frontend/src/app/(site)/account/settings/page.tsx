"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Bookmark, BookmarkX, Building2, CheckCircle2, ChevronDown, Clock, ExternalLink, Eye, EyeOff, Flag, Hash, KanbanSquare, Loader2, MonitorSmartphone } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";
import AccountTorCard, { CardAction } from "@/components/account/AccountTorCard";
import SettingsShell from "@/components/account/SettingsShell";
import { AvatarCard, FieldBlock, SubmitBar, inputClass, useSubmit } from "@/components/account/ui";
import { formatThaiDate } from "@/lib/mockData";
import { useAuth } from "@/lib/useAuth";
import { useMyReports, type MyReport } from "@/lib/useMyReports";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, useBookmarks, type ApplicationStatus } from "@/lib/useBookmarks";
import { useHiddenTors } from "@/lib/useHiddenTors";

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 60;

type SectionId = "profile" | "email" | "password" | "saved" | "hidden" | "reports" | "delete";

const SECTION_TITLES: Record<SectionId, string> = {
  profile: "แก้ไขโปรไฟล์",
  email: "อีเมล",
  password: "รหัสผ่านและความปลอดภัย",
  saved: "รายการที่บันทึก",
  hidden: "TOR ที่ซ่อนไว้",
  reports: "รายงานที่ฉันส่ง",
  delete: "ลบบัญชี",
};

function isSectionId(v: string | null): v is SectionId {
  return v !== null && v in SECTION_TITLES;
}

/* -------------------------------- sections -------------------------------- */

function ProfileSection() {
  const { user, updateDisplayName } = useAuth();
  const saved = user?.displayName ?? "";
  const [name, setName] = useState(saved);
  const form = useSubmit();
  const fallback = user?.email.split("@")[0] ?? "";

  return (
    <form
      className="flex flex-col gap-9"
      onSubmit={(e) => {
        e.preventDefault();
        void form.run(() => updateDisplayName(name));
      }}
    >
      <AvatarCard />

      <FieldBlock title="ชื่อที่แสดง" help={`ชื่อนี้แสดงในเมนูบัญชีและหน้าแดชบอร์ด เว้นว่างไว้เพื่อใช้ชื่อจากอีเมล (${fallback})`}>
        <div className="relative">
          <input
            className={`${inputClass} pr-20`}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder={fallback}
            onChange={(e) => {
              setName(e.target.value);
              form.setDone(false);
            }}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-faint)]">
            {name.length} / {MAX_NAME_LENGTH}
          </span>
        </div>
      </FieldBlock>

      <FieldBlock title="ประเภทบัญชี">
        <input className={inputClass} disabled value={user?.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ประกอบการ"} />
      </FieldBlock>

      <SubmitBar
        pending={form.pending}
        disabled={name.trim() === saved}
        label="บันทึก"
        error={form.error}
        done={form.done}
        doneText="บันทึกชื่อแล้ว"
      />
    </form>
  );
}

function EmailSection() {
  const { user, changeEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, done, run } = useSubmit();

  if (!user?.hasPassword) {
    return (
      <div className="flex flex-col gap-9">
        <FieldBlock title="อีเมลปัจจุบัน">
          <input className={inputClass} disabled value={user?.email ?? ""} />
        </FieldBlock>
        <div className="rounded-3xl bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-text-muted)]">
          บัญชีนี้เข้าสู่ระบบด้วย Google กรุณาตั้งรหัสผ่านในหน้า
          <span className="font-semibold text-[var(--color-text)]"> รหัสผ่านและความปลอดภัย </span>
          ก่อน จึงจะเปลี่ยนอีเมลได้
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-9"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => changeEmail(email, password),
          () => {
            setEmail("");
            setPassword("");
          }
        );
      }}
    >
      <FieldBlock title="อีเมลปัจจุบัน">
        <input className={inputClass} disabled value={user.email} />
      </FieldBlock>
      <FieldBlock title="อีเมลใหม่" help="ครั้งถัดไปให้เข้าสู่ระบบด้วยอีเมลใหม่">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="name@example.com"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FieldBlock>
      <FieldBlock title="รหัสผ่านปัจจุบัน" help="เพื่อยืนยันว่าเป็นเจ้าของบัญชี">
        <input
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FieldBlock>
      <SubmitBar
        pending={pending}
        disabled={!email || !password}
        label="เปลี่ยนอีเมล"
        error={error}
        done={done}
        doneText="เปลี่ยนอีเมลแล้ว"
      />
    </form>
  );
}

function PasswordSection() {
  const { user, changePassword } = useAuth();
  const hasPassword = user?.hasPassword ?? true;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending, error, done, setError, run } = useSubmit();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) return setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    if (next !== confirm) return setError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
    void run(
      () => changePassword(current, next),
      () => {
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <form className="flex flex-col gap-9" onSubmit={handleSubmit}>
        {hasPassword ? (
          <FieldBlock title="รหัสผ่านปัจจุบัน">
            <input
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </FieldBlock>
        ) : (
          <div className="rounded-3xl bg-[var(--color-surface-alt)] p-5 text-sm text-[var(--color-text-muted)]">
            บัญชีนี้ยังไม่มีรหัสผ่าน ตั้งรหัสผ่านเพื่อเข้าสู่ระบบด้วยอีเมลได้ นอกจาก Google
          </div>
        )}
        <FieldBlock title="รหัสผ่านใหม่" help="อย่างน้อย 8 ตัวอักษร · อุปกรณ์อื่นที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ">
          <input
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </FieldBlock>
        <FieldBlock title="ยืนยันรหัสผ่านใหม่">
          <input
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </FieldBlock>
        <SubmitBar
          pending={pending}
          disabled={!next || !confirm || (hasPassword && !current)}
          label={hasPassword ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่าน"}
          error={error}
          done={done}
          doneText="บันทึกรหัสผ่านแล้ว"
        />
      </form>

      <SessionsBlock />

      <FieldBlock title="การเชื่อมต่อบัญชี">
        <div className="flex items-center gap-4 rounded-3xl border border-[var(--color-border)] p-4 sm:p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)]">
            <GoogleIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--color-text)]">Google</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {user?.googleLinked
                ? "เข้าสู่ระบบด้วยบัญชี Google ได้"
                : "เข้าสู่ระบบด้วย Google ที่ใช้อีเมลเดียวกัน เพื่อเชื่อมต่ออัตโนมัติ"}
            </p>
          </div>
          <span
            className={`badge shrink-0 ${
              user?.googleLinked
                ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]"
            }`}
          >
            {user?.googleLinked ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}
          </span>
        </div>
      </FieldBlock>
    </div>
  );
}

/**
 * Saved TORs in the settings theme, with the application status and an unsave
 * action. The full tracker (Kanban, deadline calendar) stays on /bookmarks.
 */
function SavedSection() {
  const { items, ready, error, toggle, setStatus } = useBookmarks();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
          TOR ที่คุณบันทึกไว้ พร้อมสถานะการยื่นของคุณ
          {ready && items.length > 0 && (
            <span className="font-semibold text-[var(--color-text)]"> · บันทึกไว้ {items.length} รายการ</span>
          )}
        </p>
        <Link
          href="/bookmarks?view=tracking"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-ink)]/40"
        >
          <KanbanSquare size={13} />
          เปิดบอร์ดติดตามสถานะ
        </Link>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)]">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      {!ready ? null : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--color-ink)] text-[var(--color-ink)]">
            <Bookmark size={32} strokeWidth={1.6} />
          </span>
          <p className="mt-2 text-lg font-bold text-[var(--color-text)]">ยังไม่มี TOR ที่บันทึกไว้</p>
          <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
            กดไอคอนบุ๊กมาร์กบนการ์ด TOR เพื่อบันทึกโครงการที่คุณสนใจไว้ที่นี่
          </p>
          <Link href="/tor" className="mt-2 rounded-xl bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-white">
            ไปค้นหา TOR
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(({ tor, bookmarkedAt, applicationStatus }) => (
            <AccountTorCard
              key={tor.id}
              tor={tor}
              timeLabel="บันทึกเมื่อ"
              at={bookmarkedAt}
              boxLabel="TOR ที่บันทึก"
              actions={
                <>
                  <label className="relative mr-auto">
                    <select
                      aria-label="สถานะการยื่น"
                      value={applicationStatus}
                      onChange={(e) => void setStatus(tor.id, e.target.value as ApplicationStatus)}
                      className="appearance-none rounded-full border border-[var(--color-border-strong)] bg-white py-2 pl-4 pr-9 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-ink)]/40 focus:border-[var(--color-ink)]/40 focus:outline-none"
                    >
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {APPLICATION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={15}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                    />
                  </label>
                  <CardAction icon={<BookmarkX size={15} />} label="เลิกบันทึก" onClick={() => toggle(tor.id)} />
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ReportFilter = "all" | "open" | "resolved";

const REPORT_FILTERS: { id: ReportFilter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "open", label: "รอดำเนินการ" },
  { id: "resolved", label: "แก้ไขแล้ว" },
];

/** One report, laid out like the admin report card: status, the user's words, the TOR, the reply. */
function ReportCard({ report }: { report: MyReport }) {
  const resolved = report.status === "resolved";
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`badge ${
            resolved
              ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
              : "bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${resolved ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`} />
          {resolved ? "แก้ไขแล้ว" : "รอดำเนินการ"}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-text-faint)]">
          <Clock size={12} />
          ส่งเมื่อ {formatThaiDate(report.createdAt.slice(0, 10))}
        </span>
      </div>

      <div className="rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3">
        <p className="text-[11px] font-semibold text-[var(--color-text-faint)]">สิ่งที่คุณแจ้ง</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text)]">
          <span className="font-serif text-[var(--color-rose)]">“</span>
          {report.description}
          <span className="font-serif text-[var(--color-rose)]">”</span>
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] p-4">
        <p className="text-[11px] font-semibold text-[var(--color-text-faint)]">TOR ที่แจ้ง</p>
        {report.tor ? (
          <>
            <Link
              href={`/tor/${report.tor.id}`}
              className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-text)] hover:text-[var(--color-rose-dark)]"
            >
              {report.tor.title}
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                {report.tor.projectCode && (
                  <span className="flex items-center gap-1">
                    <Hash size={11} />
                    {report.tor.projectCode}
                  </span>
                )}
                {report.tor.agency && (
                  <span className="flex min-w-0 items-center gap-1">
                    <Building2 size={11} className="shrink-0" />
                    <span className="truncate">{report.tor.agency}</span>
                  </span>
                )}
              </div>
              <Link
                href={`/tor/${report.tor.id}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-ink)]/40"
              >
                <ExternalLink size={13} />
                เปิดดู
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">TOR นี้ไม่ได้เปิดให้ดูแล้ว</p>
        )}
      </div>

      {report.resolution ? (
        <div className="rounded-2xl bg-[var(--color-success-bg)] px-4 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-success)]">
            <CheckCircle2 size={14} />
            ทีมงานแก้ไขแล้ว
            {report.resolution.resolvedAt && (
              <span className="font-normal opacity-80">· {formatThaiDate(report.resolution.resolvedAt.slice(0, 10))}</span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-ink-soft)]">
            {report.resolution.note || "ขอบคุณที่ช่วยแจ้ง ทีมงานตรวจสอบและแก้ไขข้อมูลแล้ว"}
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">ทีมงานจะตรวจสอบและแก้ไขข้อมูลให้เร็วที่สุด</p>
      )}
    </article>
  );
}

/** The caller's own error reports with their status and the admin's reply (FR-41). */
function ReportsSection() {
  const { reports, ready, error } = useMyReports();
  const [filter, setFilter] = useState<ReportFilter>("all");
  const count = (f: ReportFilter) => (f === "all" ? reports.length : reports.filter((r) => r.status === f).length);
  const shown = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
        รายงานข้อมูล TOR ไม่ถูกต้องที่คุณส่งให้ทีมงาน พร้อมสถานะและข้อความตอบกลับ
      </p>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)]">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      {!ready ? null : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--color-ink)] text-[var(--color-ink)]">
            <Flag size={32} strokeWidth={1.6} />
          </span>
          <p className="mt-2 text-lg font-bold text-[var(--color-text)]">ยังไม่มีรายงานที่ส่ง</p>
          <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
            ถ้าพบข้อมูล TOR ที่ไม่ถูกต้อง กด &ldquo;แจ้งข้อมูลคลาดเคลื่อน&rdquo; ในหน้ารายละเอียด TOR แล้วติดตามผลได้ที่นี่
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {REPORT_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f.id
                    ? "bg-[var(--color-ink)] text-white"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
                }`}
              >
                {f.label} <span className={filter === f.id ? "text-white/70" : "text-[var(--color-text-faint)]"}>{count(f.id)}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">ไม่มีรายงานในสถานะนี้</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Hidden TORs as a two-column card grid, each with an unhide button. */
function HiddenSection() {
  const { items, ready, error, unhide } = useHiddenTors();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
        TOR ที่คุณซ่อนไว้จะไม่แสดงในผลการค้นหาและ TOR ที่แนะนำสำหรับคุณ หน่วยงานเจ้าของโครงการจะไม่รู้ว่าคุณซ่อน
        {ready && items.length > 0 && <span className="font-semibold text-[var(--color-text)]"> · ซ่อนอยู่ {items.length} รายการ</span>}
      </p>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)]">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      {!ready ? null : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[var(--color-ink)] text-[var(--color-ink)]">
            <EyeOff size={34} strokeWidth={1.6} />
          </span>
          <p className="mt-2 text-lg font-bold text-[var(--color-text)]">ยังไม่มี TOR ที่ซ่อนไว้</p>
          <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
            กดไอคอนรูปตาขีดฆ่าบนการ์ด TOR ที่ไม่สนใจ เพื่อซ่อนจากผลการค้นหาและคำแนะนำ
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(({ tor, hiddenAt }) => (
            <AccountTorCard
              key={tor.id}
              tor={tor}
              timeLabel="ซ่อนเมื่อ"
              at={hiddenAt}
              boxLabel="TOR ที่ซ่อน"
              actions={<CardAction icon={<Eye size={15} />} label="เลิกซ่อน" onClick={() => unhide(tor.id)} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** "ออกจากระบบอุปกรณ์อื่นทั้งหมด": a confirm step, then every other session is signed out. */
function SessionsBlock() {
  const { logoutOthers } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const { pending, error, done, setDone, run } = useSubmit();

  return (
    <FieldBlock title="อุปกรณ์ที่เข้าสู่ระบบ">
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
            <MonitorSmartphone size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[var(--color-text)]">ออกจากระบบอุปกรณ์อื่นทั้งหมด</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              ใช้เมื่อลืมออกจากระบบบนเครื่องอื่น หรือสงสัยว่ามีคนอื่นเข้าบัญชีของคุณ อุปกรณ์นี้จะยังเข้าสู่ระบบอยู่
            </p>
          </div>
          {!confirming && (
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setConfirming(true);
              }}
              className="shrink-0 rounded-xl bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-border)]"
            >
              ออกจากระบบ
            </button>
          )}
        </div>

        {confirming && (
          <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface-alt)] p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-[var(--color-text)]">ออกจากระบบทุกอุปกรณ์ ยกเว้นเครื่องนี้?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void run(logoutOthers, () => setConfirming(false))}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                ยืนยัน
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)]">
            <AlertTriangle size={14} />
            {error}
          </p>
        ) : (
          done && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--color-success)]">
              <CheckCircle2 size={14} />
              ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว
            </p>
          )
        )}
      </div>
    </FieldBlock>
  );
}

function DeleteSection() {
  const { user, deleteAccount } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState("");
  const { pending, error, run } = useSubmit();
  const byPassword = user?.hasPassword ?? true;

  return (
    <form
      className="flex flex-col gap-9"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => deleteAccount(byPassword ? { currentPassword: value } : { confirmEmail: value }),
          () => router.push("/")
        );
      }}
    >
      <div className="rounded-3xl bg-[var(--color-blush-soft)] p-5">
        <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--color-rose-dark)]">
          <AlertTriangle size={16} />
          การลบบัญชีไม่สามารถย้อนกลับได้
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">
          <li>โปรไฟล์ธุรกิจและรายการที่บันทึกทั้งหมดจะถูกลบ</li>
          <li>การแจ้งเตือน ประวัติแชท และรูปโปรไฟล์จะถูกลบ</li>
          <li>รายงานข้อผิดพลาดที่เคยส่งจะยังอยู่ แต่ไม่ระบุชื่อผู้ส่ง</li>
        </ul>
      </div>

      <FieldBlock
        title={byPassword ? "ยืนยันด้วยรหัสผ่าน" : "ยืนยันด้วยอีเมล"}
        help={byPassword ? undefined : `พิมพ์ ${user?.email} เพื่อยืนยัน`}
      >
        <input
          type={byPassword ? "password" : "email"}
          required
          autoComplete={byPassword ? "current-password" : "off"}
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </FieldBlock>

      <SubmitBar pending={pending} disabled={!value} label="ลบบัญชีถาวร" error={error} done={false} doneText="" danger />
    </form>
  );
}

/* ---------------------------------- page ---------------------------------- */

function SettingsContent() {
  const { user } = useAuth();
  const param = useSearchParams().get("section");
  // Desktop opens on แก้ไขโปรไฟล์; phones show the menu until a section is picked.
  const vendorOnly = param === "delete" || param === "hidden" || param === "saved";
  const picked = isSectionId(param) && (!vendorOnly || user?.role === "vendor");
  const section: SectionId = picked ? param : "profile";

  return (
    <SettingsShell active={section} title={SECTION_TITLES[section]} showDetailOnMobile={picked} wide={section === "hidden" || section === "saved" || section === "reports"}>
      {/* key: a fresh form state per section, so switching back doesn't show stale input */}
      <div key={section}>
        {section === "profile" && <ProfileSection />}
        {section === "email" && <EmailSection />}
        {section === "password" && <PasswordSection />}
        {section === "saved" && <SavedSection />}
        {section === "hidden" && <HiddenSection />}
        {section === "reports" && <ReportsSection />}
        {section === "delete" && <DeleteSection />}
      </div>
    </SettingsShell>
  );
}

export default function AccountSettingsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
