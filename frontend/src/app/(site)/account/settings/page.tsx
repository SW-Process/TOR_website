"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Bookmark, BookmarkX, Building2, CheckCircle2, ChevronDown, ChevronRight, Clock, ExternalLink, Eye, EyeOff, Flag, Hash, KanbanSquare, Loader2, Monitor, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";
import AccountTorCard, { CardAction } from "@/components/account/AccountTorCard";
import SettingsShell from "@/components/account/SettingsShell";
import { AvatarCard, FieldBlock, SubmitBar, inputClass, useSubmit } from "@/components/account/ui";
import { formatThaiDate } from "@/lib/mockData";
import { useAuth } from "@/lib/useAuth";
import { useMyReports, type MyReport } from "@/lib/useMyReports";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, useBookmarks, type ApplicationStatus } from "@/lib/useBookmarks";
import { useHiddenTors } from "@/lib/useHiddenTors";
import { useSessions, type AccountSession } from "@/lib/useSessions";

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 60;

type SectionId = "profile" | "email" | "password" | "sessions" | "saved" | "hidden" | "reports" | "delete";

const SECTION_TITLES: Record<SectionId, string> = {
  profile: "แก้ไขโปรไฟล์",
  email: "อีเมล",
  password: "รหัสผ่านและความปลอดภัย",
  sessions: "อุปกรณ์ที่เข้าสู่ระบบ",
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

      <Link
        href="/account/settings?section=sessions"
        scroll={false}
        className="flex items-center gap-4 rounded-3xl border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-surface-alt)] sm:p-5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
          <MonitorSmartphone size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--color-text)]">อุปกรณ์ที่เข้าสู่ระบบ</span>
          <span className="block text-xs text-[var(--color-text-muted)]">ดูว่าบัญชีนี้เข้าสู่ระบบอยู่ที่ไหนบ้าง และออกจากระบบอุปกรณ์ที่ไม่รู้จัก</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-[var(--color-text-faint)]" />
      </Link>

      <GoogleConnection />
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
          ส่งเมื่อ {formatThaiDate(report.createdAt)}
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
              <span className="font-normal opacity-80">· {formatThaiDate(report.resolution.resolvedAt)}</span>
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

/** What the link round trip reported back in `?google=` (see authController LINK_RETURN_PATH). */
const GOOGLE_LINK_OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  linked: { ok: true, text: "เชื่อมต่อ Google แล้ว ครั้งหน้าเข้าสู่ระบบด้วย Google ได้เลย" },
  taken: { ok: false, text: "บัญชี Google นี้เชื่อมต่อกับบัญชี TOR Checker อื่นอยู่แล้ว" },
  session: { ok: false, text: "เซสชันหมดอายุระหว่างเชื่อมต่อ กรุณาเข้าสู่ระบบแล้วลองใหม่" },
  error: { ok: false, text: "เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่" },
};

/** Google sign-in: connect (any Google account) or disconnect (only with a password set). */
function GoogleConnection() {
  const { user, linkGoogle, unlinkGoogle } = useAuth();
  const outcome = GOOGLE_LINK_OUTCOMES[useSearchParams().get("google") ?? ""];
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useSubmit();
  const linked = user?.googleLinked ?? false;
  const canUnlink = user?.hasPassword ?? false;

  return (
    <FieldBlock title="การเชื่อมต่อบัญชี">
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)]">
            <GoogleIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
              Google
              {linked && (
                <span className="badge bg-[var(--color-success-bg)] text-[var(--color-success)]">เชื่อมต่อแล้ว</span>
              )}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {!linked
                ? "เชื่อมต่อเพื่อเข้าสู่ระบบด้วยบัญชี Google ได้ ใช้อีเมล Google ต่างจากบัญชีนี้ก็ได้"
                : canUnlink
                  ? "เข้าสู่ระบบด้วยบัญชี Google ได้"
                  : "ตั้งรหัสผ่านด้านบนก่อน จึงจะยกเลิกการเชื่อมต่อได้ — ตอนนี้ Google เป็นทางเดียวที่ใช้เข้าสู่ระบบ"}
            </p>
          </div>
          {!linked ? (
            <button
              type="button"
              onClick={linkGoogle}
              className="shrink-0 rounded-xl bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              เชื่อมต่อ
            </button>
          ) : (
            canUnlink &&
            !confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="shrink-0 rounded-xl bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-border)]"
              >
                ยกเลิกการเชื่อมต่อ
              </button>
            )
          )}
        </div>

        {confirming && linked && (
          <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface-alt)] p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-[var(--color-text)]">
              ยกเลิกการเชื่อมต่อ Google? หลังจากนี้ต้องเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ไม่ใช่ตอนนี้
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void run(unlinkGoogle, () => setConfirming(false))}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-rose-dark)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-rose)] disabled:opacity-50"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                ยกเลิกการเชื่อมต่อ
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
          outcome &&
          // The banner matches the current state, so a stale ?google=linked after unlinking stays hidden.
          (outcome.ok ? linked : true) && (
            <p
              className={`flex items-center gap-1.5 text-sm ${
                outcome.ok ? "text-[var(--color-success)]" : "text-[var(--color-rose-dark)]"
              }`}
            >
              {outcome.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {outcome.text}
            </p>
          )
        )}
      </div>
    </FieldBlock>
  );
}

const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;

const relativeTime = new Intl.RelativeTimeFormat("th", { numeric: "auto" });

/** "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "เมื่อวาน", falling back to a date after a week. */
function timeAgo(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (seconds > -60) return "เมื่อสักครู่";
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relativeTime.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (days > -7) return relativeTime.format(days, "day");
  return formatThaiDate(iso);
}

function deviceName(s: AccountSession): string {
  const { browser, os, type } = s.device;
  if (browser && os) return `${browser} บน ${os}`;
  if (browser || os) return (browser ?? os)!;
  return type === "desktop" ? "คอมพิวเตอร์" : type === "tablet" ? "แท็บเล็ต" : "โทรศัพท์มือถือ";
}

/** One device row, GitHub "Web sessions"-style: icon, name, status, when, and a sign-out action. */
function SessionRow({ session, onRevoke }: { session: AccountSession; onRevoke: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = DEVICE_ICONS[session.device.type];
  const revokeButton = (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="shrink-0 rounded-xl bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-border)]"
    >
      ออกจากระบบ
    </button>
  );

  async function revoke() {
    setPending(true);
    setFailed(false);
    const ok = await onRevoke();
    setPending(false);
    if (!ok) setFailed(true);
  }

  return (
    <li className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
            {deviceName(session)}
            {session.current && (
              <span className="badge bg-[var(--color-ink)] text-white">อุปกรณ์นี้</span>
            )}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${session.active ? "bg-[var(--color-success)]" : "bg-[var(--color-text-faint)]"}`}
            />
            <span className={session.active ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>
              {session.current ? "กำลังใช้งาน" : session.active ? "ใช้งานอยู่" : "ไม่ได้ใช้งานช่วงนี้"}
            </span>
            {!session.current && (
              <span className="text-[var(--color-text-muted)]">· ใช้งานล่าสุด {timeAgo(session.lastSeenAt)}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            เข้าสู่ระบบ{session.method === "google" ? "ด้วย Google" : "ด้วยรหัสผ่าน"} เมื่อ{" "}
            {formatThaiDate(session.createdAt)}
            {session.ip && <> · IP {session.ip.replace(/^::ffff:/, "")}</>}
          </p>
        </div>
        {!session.current && !confirming && <span className="hidden sm:block">{revokeButton}</span>}
      </div>
      {/* On phones the button gets its own line under the details instead of squeezing them. */}
      {!session.current && !confirming && <div className="ml-15 sm:hidden">{revokeButton}</div>}

      {confirming && (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface-alt)] p-4 sm:ml-15 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-[var(--color-text)]">ออกจากระบบ {deviceName(session)}?</p>
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
              onClick={() => void revoke()}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
      {failed && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)] sm:ml-15">
          <AlertTriangle size={14} />
          ออกจากระบบไม่สำเร็จ กรุณาลองใหม่
        </p>
      )}
    </li>
  );
}

/** Every signed-in device, like GitHub's "Web sessions", plus "log out all other devices". */
function SessionsSection() {
  const { sessions, ready, error, revoke, reload } = useSessions();
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
          รายการอุปกรณ์ที่เข้าสู่ระบบบัญชีนี้อยู่ ถ้าพบอุปกรณ์ที่ไม่รู้จัก ให้กดออกจากระบบ แล้วเปลี่ยนรหัสผ่าน
        </p>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--color-rose-dark)]">
            <AlertTriangle size={14} />
            {error}
          </p>
        )}
        {ready && sessions.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} onRevoke={() => revoke(s)} />
            ))}
          </ul>
        )}
      </div>

      {ready && others > 0 && <SessionsBlock onDone={reload} />}
    </div>
  );
}

/** "ออกจากระบบอุปกรณ์อื่นทั้งหมด": a confirm step, then every other session is signed out. */
function SessionsBlock({ onDone }: { onDone: () => void }) {
  const { logoutOthers } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const { pending, error, done, setDone, run } = useSubmit();

  return (
    <FieldBlock title="ออกจากระบบทุกอุปกรณ์">
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
            <MonitorSmartphone size={20} />
          </span>
          {/* basis-0 + min width: the text keeps the row on wide screens, wraps the button below on phones */}
          <div className="min-w-[14rem] flex-1 basis-0">
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
              className="ml-15 shrink-0 rounded-xl sm:ml-0 bg-[var(--color-surface-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-border)]"
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
                onClick={() =>
                  void run(logoutOthers, () => {
                    setConfirming(false);
                    onDone();
                  })
                }
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
        {section === "sessions" && <SessionsSection />}
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
