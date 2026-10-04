"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { ALL_SHORTCUTS, SHORTCUT_GROUPS, canUse, keyLabel, type Shortcut } from "@/lib/shortcuts";

/** Time allowed between "G" and the next key of a sequence. */
const SEQUENCE_MS = 1500;
/** How long to wait for a search box after navigating to /tor for "/". */
const FOCUS_WAIT_MS = 3000;

/** Physical key → the key name used in lib/shortcuts (layout-independent). */
function keyName(e: KeyboardEvent): string | null {
  if (e.code === "Escape") return "esc";
  if (e.code === "Slash") return e.shiftKey ? "?" : "/";
  if (e.shiftKey) return null; // no other shortcut uses Shift
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1]!.toLowerCase() : null;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(target.type);
  }
  return false;
}

function focusSearchBox(): boolean {
  const box = document.querySelector<HTMLInputElement>("[data-shortcut-search]");
  if (!box) return false;
  box.focus();
  box.select();
  return true;
}

/** Keycaps for one shortcut: "G แล้ว H". */
export function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-[var(--color-text-faint)]">แล้ว</span>}
          <kbd className="inline-flex min-w-[2rem] items-center justify-center rounded-lg border border-[var(--color-border-strong)] border-b-[3px] bg-white px-2 py-0.5 font-sans text-xs font-semibold text-[var(--color-text)]">
            {keyLabel(k)}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/** The shortcut list as LINE draws it: a bold group title, then label ↔ keys rows. */
export function ShortcutTable({ role }: { role: "vendor" | "admin" | null }) {
  return (
    <div className="flex flex-col gap-8">
      {SHORTCUT_GROUPS.map((group) => {
        const rows = group.shortcuts.filter((s) => canUse(s.audience, role));
        if (!rows.length) return null;
        return (
          <section key={group.title}>
            <h3 className="text-[15px] font-bold text-[var(--color-text)]">{group.title}</h3>
            {group.note && <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">{group.note}</p>}
            <dl className="mt-3 flex flex-col">
              {rows.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-3 last:border-0">
                  <dt className="text-sm text-[var(--color-text-muted)]">{s.label}</dt>
                  <dd>
                    <ShortcutKeys keys={s.keys} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Global key handler for the public site, plus the "?" cheat-sheet dialog. Mounted
 * once in the (site) layout.
 */
export default function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role ?? null;
  const [helpOpen, setHelpOpen] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);
  const focusAfterNav = useRef<number | null>(null);

  // "/" pressed on a page without a search box: we went to /tor; focus its box once it renders.
  useEffect(() => {
    if (focusAfterNav.current === null) return;
    const deadline = focusAfterNav.current;
    const timer = setInterval(() => {
      if (focusSearchBox() || Date.now() > deadline) {
        focusAfterNav.current = null;
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname]);

  const run = useCallback(
    (s: Shortcut) => {
      const a = s.action;
      switch (a.type) {
        case "navigate":
          router.push(a.href);
          break;
        case "help":
          setHelpOpen(true);
          break;
        case "focusSearch":
          if (!focusSearchBox()) {
            focusAfterNav.current = Date.now() + FOCUS_WAIT_MS;
            router.push("/tor");
          }
          break;
        case "click":
          document.querySelector<HTMLElement>(`[data-shortcut="${a.target}"]`)?.click();
          break;
        case "escape":
          break;
      }
    },
    [router]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = keyName(e);
      if (!key) return;

      if (key === "esc") {
        if (helpOpen) setHelpOpen(false);
        else if (isTyping(e.target)) (e.target as HTMLElement).blur();
        pending.current = null;
        return;
      }
      if (isTyping(e.target)) return;

      const now = Date.now();
      const prev = pending.current && now - pending.current.at < SEQUENCE_MS ? pending.current.key : null;
      pending.current = null;

      const usable = ALL_SHORTCUTS.filter((s) => canUse(s.audience, role));
      const match = prev
        ? usable.find((s) => s.keys.length === 2 && s.keys[0] === prev && s.keys[1] === key)
        : usable.find((s) => s.keys.length === 1 && s.keys[0] === key);

      if (match) {
        e.preventDefault();
        setHelpOpen(false);
        run(match);
      } else if (!prev && usable.some((s) => s.keys.length === 2 && s.keys[0] === key)) {
        pending.current = { key, at: now }; // first key of a sequence, e.g. "g"
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, role, run]);

  if (!helpOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10"
      onClick={() => setHelpOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ปุ่มลัดบนคีย์บอร์ด"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-[var(--shadow-lg)] sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 font-[family-name:var(--font-heading)] text-xl font-extrabold text-[var(--color-text)]">
            <Keyboard size={22} className="text-[var(--color-rose-dark)]" />
            ปุ่มลัดบนคีย์บอร์ด
          </h2>
          <button type="button" onClick={() => setHelpOpen(false)} aria-label="ปิด" className="rounded-full p-2 hover:bg-[var(--color-surface-alt)]">
            <X size={18} />
          </button>
        </div>
        <ShortcutTable role={role} />
        <p className="mt-6 text-xs text-[var(--color-text-faint)]">
          ปุ่มลัดใช้ได้เมื่อไม่ได้พิมพ์อยู่ในช่องข้อความ
          {user && (
            <>
              {" · "}
              <Link href="/account/settings?section=shortcuts" onClick={() => setHelpOpen(false)} className="font-semibold text-[var(--color-rose-dark)] hover:underline">
                ดูในหน้าตั้งค่า
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
