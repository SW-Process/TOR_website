"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Minus, SendHorizontal } from "lucide-react";
import mascot from "./picture/adminpic.png";

// Mock: there's no chat backend yet, so the conversation lives in localStorage
// and the "admin" answers with a canned acknowledgement (same approach as the
// other use* mock hooks).
const STORAGE_KEY = "tor-insight:admin-chat";

type Sender = "user" | "admin";

interface ChatMessage {
  id: string;
  from: Sender;
  text: string;
  at: number;
}

const GREETING: ChatMessage = {
  id: "greeting",
  from: "admin",
  text: "สวัสดีค่ะ 👋 มีอะไรให้แอดมินช่วยไหมคะ? เลือกหัวข้อด้านล่าง หรือพิมพ์ข้อความมาได้เลย",
  at: 0,
};

const QUICK_TOPICS = [
  "ข้อมูล TOR ไม่ถูกต้อง",
  "ปัญหาการเข้าสู่ระบบ",
  "สอบถามการใช้งาน",
  "แนะนำ / ติชม",
];

const AUTO_REPLY =
  "ได้รับข้อความแล้วค่ะ ✨ แอดมินจะตรวจสอบและตอบกลับโดยเร็วที่สุด (ปกติภายใน 1 วันทำการ)";

function readStorage(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function makeMessage(from: Sender, text: string): ChatMessage {
  return { id: crypto.randomUUID(), from, text, at: Date.now() };
}

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminChatWidget() {
  const [open, setOpen] = useState(false);
  // null until the panel is first opened, then hydrated from storage.
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, open]);

  function persist(next: ChatMessage[]) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — keep the chat in memory only
    }
  }

  function append(msg: ChatMessage) {
    setMessages((prev) => {
      const next = [...(prev ?? []), msg];
      persist(next);
      return next;
    });
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    append(makeMessage("user", trimmed));
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      append(makeMessage("admin", AUTO_REPLY));
    }, 1200);
  }

  function toggle() {
    if (messages === null) setMessages(readStorage());
    setOpen((o) => !o);
    setShowHint(false);
  }

  const hasUserMessages = (messages ?? []).some((m) => m.from === "user");

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <section
          aria-label="แชทกับแอดมิน"
          className="animate-chat-pop flex h-[min(560px,calc(100dvh-8rem))] w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)] sm:w-[370px]"
        >
          {/* Header */}
          <header className="relative flex items-center gap-3 bg-gradient-to-br from-[var(--color-blush)] to-[var(--color-rose-light)] px-4 py-3.5">
            <div className="relative h-12 w-12 shrink-0 rounded-full bg-white shadow-[var(--shadow-sm)]">
              <Image src={mascot} alt="" fill sizes="48px" className="object-contain p-0.5" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[var(--color-success)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text)]">
                น้องทอร์ · แอดมิน
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">ออนไลน์ · พร้อมช่วยเหลือ</p>
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
            {[GREETING, ...(messages ?? [])].map((m) =>
              m.from === "admin" ? (
                <div key={m.id} className="flex items-end gap-2">
                  <div className="relative h-7 w-7 shrink-0 rounded-full bg-white">
                    <Image src={mascot} alt="" fill sizes="28px" className="object-contain" />
                  </div>
                  <div className="max-w-[78%]">
                    <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)]">
                      {m.text}
                    </p>
                    {m.at > 0 && (
                      <p className="mt-1 pl-1 text-[10px] text-[var(--color-text-faint)]">{formatTime(m.at)}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-end">
                  <p className="max-w-[78%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-ink)] px-3.5 py-2.5 text-sm text-white">
                    {m.text}
                  </p>
                  <p className="mt-1 pr-1 text-[10px] text-[var(--color-text-faint)]">{formatTime(m.at)}</p>
                </div>
              ),
            )}

            {!hasUserMessages && (
              <div className="flex flex-wrap gap-2 pl-9">
                {QUICK_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => send(topic)}
                    className="rounded-full border border-[var(--color-rose)]/40 bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-rose-dark)] transition-colors hover:bg-[var(--color-rose-light)]"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}

            {typing && (
              <div className="flex items-end gap-2">
                <div className="relative h-7 w-7 shrink-0 rounded-full bg-white">
                  <Image src={mascot} alt="" fill sizes="28px" className="object-contain" />
                </div>
                <div className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-[var(--shadow-sm)]">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-rose)]"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 border-t border-[var(--color-border)] bg-white px-3 py-3"
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder="พิมพ์ข้อความถึงแอดมิน..."
              className="max-h-28 flex-1 resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3.5 py-2.5 text-sm focus:border-[var(--color-ink)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="ส่งข้อความ"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose)] text-white shadow-[var(--shadow-glow)] transition-colors hover:bg-[var(--color-rose-dark)] disabled:opacity-40 disabled:shadow-none"
            >
              <SendHorizontal size={18} />
            </button>
          </form>
        </section>
      )}

      <div className="flex items-end gap-2">
        {showHint && !open && (
          <button
            onClick={toggle}
            className="animate-chat-pop mb-3 origin-bottom-right rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-text)] shadow-[var(--shadow-md)]"
          >
            มีอะไรให้ช่วยไหมคะ? 💬
          </button>
        )}
        <button
          onClick={toggle}
          aria-label={open ? "ปิดแชทกับแอดมิน" : "แชทกับแอดมิน"}
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
          {!open && (
            <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--color-rose)] animate-dot-pulse" />
          )}
        </button>
      </div>
    </div>
  );
}
