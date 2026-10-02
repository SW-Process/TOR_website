"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Minus, SendHorizontal } from "lucide-react";
import mascot from "./picture/adminpic.png";
import { useAuth } from "@/lib/useAuth";
import {
  CHAT_POLL_ACTIVE_MS,
  CHAT_POLL_IDLE_MS,
  fetchMyConversation,
  formatChatTime,
  markMyConversationRead,
  mergeMessages,
  sendMyMessage,
  type ChatMessage,
  type VisitorConversation,
} from "@/lib/chat";

// Shown above the thread; client-side only, never stored as a message.
const GREETING =
  "สวัสดีค่ะ 👋 มีอะไรให้แอดมินช่วยไหมคะ? เลือกหัวข้อด้านล่าง หรือพิมพ์ข้อความมาได้เลย";

const QUICK_TOPICS = [
  "ข้อมูล TOR ไม่ถูกต้อง",
  "ปัญหาการเข้าสู่ระบบ",
  "สอบถามการใช้งาน",
  "แนะนำ / ติชม",
];

function MascotAvatar({ size }: { size: number }) {
  return (
    <div className="relative shrink-0 rounded-full bg-white" style={{ width: size, height: size }}>
      <Image src={mascot} alt="" fill sizes={`${size}px`} className="object-contain" />
    </div>
  );
}

function AdminBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex items-end gap-2">
      <MascotAvatar size={28} />
      <div className="max-w-[78%]">
        <p className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)]">
          {text}
        </p>
        {time && <p className="mt-1 pl-1 text-[10px] text-[var(--color-text-faint)]">{time}</p>}
      </div>
    </div>
  );
}

export default function AdminChatWidget() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<VisitorConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** Fetch the thread, or only what's new since the last message seen. */
  const sync = useCallback(async () => {
    const after = lastIdRef.current;
    const data = await fetchMyConversation(after);
    setConversation(data.conversation);
    if (data.messages.length) {
      setMessages((prev) => (after ? mergeMessages(prev, data.messages) : data.messages));
      lastIdRef.current = data.messages[data.messages.length - 1].id;
    }
  }, []);

  // Chat is for logged-in vendors only; admins answer from the admin panel.
  const canChat = ready && user?.role === "vendor";

  // Poll for admin replies: often while the window is open, rarely otherwise
  // (to light the unread badge).
  useEffect(() => {
    if (!canChat) return;
    const tick = () => void sync().catch(() => {});
    tick();
    const timer = setInterval(tick, open ? CHAT_POLL_ACTIVE_MS : CHAT_POLL_IDLE_MS);
    return () => clearInterval(timer);
  }, [canChat, open, sync]);

  const unread = conversation?.unread ?? 0;
  useEffect(() => {
    if (!open || unread === 0) return;
    void markMyConversationRead()
      .then(() => setConversation((c) => (c ? { ...c, unread: 0 } : c)))
      .catch(() => {});
  }, [open, unread]);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      const message = await sendMyMessage(trimmed);
      setMessages((prev) => mergeMessages(prev, [message]));
      await sync();
    } catch {
      setDraft(trimmed);
      setError("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  }

  function toggle() {
    setOpen((o) => !o);
    setShowHint(false);
  }

  if (!canChat) return null;

  const last = messages[messages.length - 1];
  const awaitingReply = last?.from === "visitor";

  return (
    // Pinned with inline styles so the corner placement never depends on a
    // (possibly stale, during dev HMR) stylesheet having the utility classes.
    <div
      className="flex flex-col items-end gap-3"
      style={{ position: "fixed", right: "clamp(16px, 2vw, 24px)", bottom: "clamp(16px, 2vw, 24px)", zIndex: 40 }}
    >
      {open && (
        <section
          aria-label="แชทกับแอดมิน"
          className="animate-chat-pop flex h-[min(560px,calc(100dvh-8rem))] w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)] sm:w-[370px]"
        >
          {/* Header */}
          <header className="relative flex items-center gap-3 bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-rose-light)] px-4 py-3.5">
            <div className="relative h-12 w-12 shrink-0 rounded-full bg-white shadow-[var(--shadow-sm)]">
              <Image src={mascot} alt="" fill sizes="48px" className="object-contain p-0.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text)]">
                น้องทอร์ · แอดมิน
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">ทีมงานจะตอบกลับในแชทนี้โดยเร็วที่สุด</p>
            </div>
            <button
              onClick={toggle}
              aria-label="ย่อหน้าต่างแชท"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-white/70"
            >
              <Minus size={18} />
            </button>
          </header>

          {/* Messages */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-surface-alt)] px-4 py-4">
            <AdminBubble text={GREETING} />

            {messages.map((m) =>
              m.from === "admin" ? (
                <AdminBubble key={m.id} text={m.text} time={formatChatTime(m.createdAt)} />
              ) : (
                <div key={m.id} className="flex flex-col items-end">
                  <p className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--color-ink)] px-3.5 py-2.5 text-sm text-white">
                    {m.text}
                  </p>
                  <p className="mt-1 pr-1 text-[10px] text-[var(--color-text-faint)]">{formatChatTime(m.createdAt)}</p>
                </div>
              ),
            )}

            {messages.length === 0 && !sending && (
              <div className="flex flex-wrap gap-2 pl-9">
                {QUICK_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => void send(topic)}
                    className="rounded-full border border-[var(--color-rose)]/40 bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-rose-dark)] transition-colors hover:bg-[var(--color-rose-light)]"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}

            {sending && <p className="text-right text-[11px] text-[var(--color-text-faint)]">กำลังส่ง…</p>}

            {awaitingReply && !sending && (
              <p className="mx-auto max-w-[85%] text-center text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                ส่งถึงแอดมินแล้ว ✨ ทีมงานจะตอบกลับในแชทนี้
              </p>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="border-t border-[var(--color-border)] bg-white px-3 py-3"
          >
            {error && <p className="mb-2 px-1 text-xs text-[var(--color-danger)]">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="พิมพ์ข้อความถึงแอดมิน..."
                className="max-h-28 flex-1 resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3.5 py-2.5 text-sm focus:border-[var(--color-ink)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="ส่งข้อความ"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose)] text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-[var(--color-rose-dark)] disabled:opacity-40 disabled:shadow-none"
              >
                <SendHorizontal size={18} />
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="flex items-end gap-2">
        {(showHint || unread > 0) && !open && (
          <button
            onClick={toggle}
            className="animate-chat-pop mb-3 origin-bottom-right rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-text)] shadow-[var(--shadow-md)]"
          >
            {unread > 0 ? "แอดมินตอบกลับแล้ว 💬" : "มีอะไรให้ช่วยไหมคะ? 💬"}
          </button>
        )}
        <button
          onClick={toggle}
          aria-label={
            open ? "ปิดแชทกับแอดมิน" : unread > 0 ? `แชทกับแอดมิน (ข้อความใหม่ ${unread})` : "แชทกับแอดมิน"
          }
          aria-expanded={open}
          className="group relative h-16 w-16 shrink-0 rounded-full border-2 border-white bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-rose-light)] shadow-[var(--shadow-glow)] transition-transform hover:scale-105 active:scale-95 sm:h-[72px] sm:w-[72px]"
        >
          <span className={`absolute inset-0 ${open ? "" : "animate-mascot-bob"}`}>
            <Image
              src={mascot}
              alt=""
              fill
              sizes="72px"
              className="object-contain p-1 transition-transform group-hover:rotate-[-6deg]"
            />
          </span>
          {!open &&
            (unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--color-rose)] px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : (
              <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--color-rose)] animate-dot-pulse" />
            ))}
        </button>
      </div>
    </div>
  );
}
