"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Building2, Clock, ExternalLink, Eye, EyeOff, Hash, Sparkles } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";
import StatusBadge from "@/components/StatusBadge";
import SettingsShell from "@/components/account/SettingsShell";
import { AvatarCard, FieldBlock, SubmitBar, inputClass, useSubmit } from "@/components/account/ui";
import { formatBudget, formatThaiDate, type TOR } from "@/lib/mockData";
import { statusNote } from "@/lib/torStatus";
import { useAuth } from "@/lib/useAuth";
import { useHiddenTors } from "@/lib/useHiddenTors";

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 60;

type SectionId = "profile" | "email" | "password" | "hidden" | "delete";

const SECTION_TITLES: Record<SectionId, string> = {
  profile: "แก้ไขโปรไฟล์",
  email: "อีเมล",
  password: "รหัสผ่านและความปลอดภัย",
  hidden: "TOR ที่ซ่อนไว้",
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
        <FieldBlock title="รหัสผ่านใหม่" help="อย่างน้อย 8 ตัวอักษร">
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

/** One hidden TOR as a card, laid out like the admin report cards: meta, AI summary, TOR box, action. */
function HiddenTorCard({ tor, hiddenAt, onUnhide }: { tor: TOR; hiddenAt: string; onUnhide: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge status={tor.status} />
          <span className="badge bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">{tor.category}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-text-faint)]">
          <Clock size={12} />
          ซ่อนเมื่อ {formatThaiDate(hiddenAt.slice(0, 10))}
        </span>
      </div>

      {/* aiSummary.summary is a model-written summary, never the agency's own text — label it so. */}
      <div className="rounded-2xl bg-[var(--color-surface-alt)] px-4 py-3">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-rose-dark)]">
          <Sparkles size={11} />
          สรุปโดย AI
        </p>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          {tor.description || "ยังไม่มีสรุปสำหรับ TOR นี้"}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-[var(--color-border)] p-4">
        <p className="text-[11px] font-semibold text-[var(--color-text-faint)]">TOR ที่ซ่อน</p>
        <Link
          href={`/tor/${tor.id}`}
          className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-text)] hover:text-[var(--color-rose-dark)]"
        >
          {tor.title}
        </Link>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
          {tor.projectCode && (
            <span className="flex items-center gap-1">
              <Hash size={11} />
              {tor.projectCode}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-1">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{tor.agency}</span>
          </span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <p className="text-base font-extrabold text-[var(--color-rose-dark)]">{formatBudget(tor.budget)}</p>
            <p className="text-[11px] text-[var(--color-text-faint)]">{statusNote(tor)}</p>
          </div>
          <Link
            href={`/tor/${tor.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-ink)]/40"
          >
            <ExternalLink size={13} />
            เปิดดู
          </Link>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          disabled={pending}
          onClick={() => {
            setPending(true);
            // On success the card unmounts; on failure it stays, so re-enable the button.
            void onUnhide().finally(() => setPending(false));
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
        >
          <Eye size={15} />
          เลิกซ่อน
        </button>
      </div>
    </article>
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
            <HiddenTorCard key={tor.id} tor={tor} hiddenAt={hiddenAt} onUnhide={() => unhide(tor.id)} />
          ))}
        </div>
      )}
    </div>
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
  const vendorOnly = param === "delete" || param === "hidden";
  const picked = isSectionId(param) && (!vendorOnly || user?.role === "vendor");
  const section: SectionId = picked ? param : "profile";

  return (
    <SettingsShell active={section} title={SECTION_TITLES[section]} showDetailOnMobile={picked} wide={section === "hidden"}>
      {/* key: a fresh form state per section, so switching back doesn't show stale input */}
      <div key={section}>
        {section === "profile" && <ProfileSection />}
        {section === "email" && <EmailSection />}
        {section === "password" && <PasswordSection />}
        {section === "hidden" && <HiddenSection />}
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
