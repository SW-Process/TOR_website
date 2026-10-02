"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  MessagesSquare,
  RotateCcw,
  SendHorizontal,
  UserRound,
} from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { API_BASE } from "@/lib/api";
import { formatThaiDateTime, timeAgo } from "@/lib/adminStats";
import {
  CHAT_POLL_ACTIVE_MS,
  fetchAdminChatMessages,
  fetchAdminChats,
  formatChatTime,
  markChatRead,
  mergeMessages,
  replyToChat,
  setChatStatus,
  type AdminChatList,
  type AdminChatSummary,
  type ChatMessage,
  type ChatStatus,
  type ChatVisitor,
} from "@/lib/chat";

type Tab = ChatStatus | "all";

/** Re-check the thread list this often while the inbox is open. */
const LIST_REFRESH_MS = 10_000;

const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "กำลังคุย" },
  { value: "closed", label: "ปิดแล้ว" },
  { value: "all", label: "ทั้งหมด" },
];

const ROLE_LABELS: Record<ChatVisitor["role"], string> = {
  vendor: "ผู้ประกอบการ",
  admin: "ผู้ดูแลระบบ",
};

function visitorName(chat: AdminChatSummary) {
  return chat.visitor ? chat.visitor.displayName : "บัญชีที่ถูกลบแล้ว";
}

function Avatar({ visitor, size = 40 }: { visitor: ChatVisitor | null; size?: number }) {
  const style = { width: size, height: size };
  if (visitor?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`${API_BASE}${visitor.avatarUrl}`} alt="" style={style} className="shrink-0 rounded-full object-cover" />
    );
  }
  if (!visitor) {
    return (
      <span
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-faint)]"
      >
        <UserRound size={size * 0.45} />
      </span>
    );
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-sm font-bold text-white"
    >
      {visitor.displayName.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function ChatListItem({
  chat,
  active,
  onSelect,
}: {
  chat: AdminChatSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
        active ? "bg-[var(--color-rose-light)]" : "hover:bg-[var(--color-surface-alt)]"
      }`}
    >
      <Avatar visitor={chat.visitor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={`min-w-0 flex-1 truncate text-sm ${
              chat.unread > 0 ? "font-bold text-[var(--color-text)]" : "font-semibold text-[var(--color-text)]"
            }`}
          >
            {visitorName(chat)}
          </p>
          <span className="shrink-0 text-[10px] text-[var(--color-text-faint)]">{timeAgo(chat.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={`min-w-0 flex-1 truncate text-xs ${
              chat.unread > 0 ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
            }`}
          >
            {chat.lastMessageFrom === "admin" ? "คุณ: " : ""}
            {chat.lastMessagePreview}
          </p>
          {chat.unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-rose)] px-1.5 text-[10px] font-bold text-white">
              {chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatThread({
  chat,
  onBack,
  onChanged,
}: {
  chat: AdminChatSummary;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastIdRef = useRef<string | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const closed = chat.status === "closed";

  const sync = useCallback(async () => {
    const after = lastIdRef.current;
    const incoming = await fetchAdminChatMessages(chat.id, after);
    setLoadError(false);
    if (!after) setMessages(incoming);
    else if (incoming.length) setMessages((prev) => mergeMessages(prev ?? [], incoming));
    if (incoming.length) {
      lastIdRef.current = incoming[incoming.length - 1].id;
      // Seen as soon as it's on screen.
      if (incoming.some((m) => m.from === "visitor")) {
        await markChatRead(chat.id);
        onChanged();
      }
    }
  }, [chat.id, onChanged]);

  useEffect(() => {
    const tick = () =>
      void sync().catch(() => {
        if (!lastIdRef.current) setLoadError(true);
      });
    tick();
    const timer = setInterval(tick, CHAT_POLL_ACTIVE_MS);
    return () => clearInterval(timer);
  }, [sync]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await replyToChat(chat.id, text);
      setDraft("");
      setMessages((prev) => mergeMessages(prev ?? [], [message]));
      onChanged();
    } catch {
      setError("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    try {
      await setChatStatus(chat.id, closed ? "open" : "closed");
      onChanged();
    } catch {
      setError("บันทึกสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="กลับไปที่รายการแชท"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-surface-alt)] lg:hidden"
        >
          <ArrowLeft size={16} />
        </button>
        <Avatar visitor={chat.visitor} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-[family-name:var(--font-heading)] text-[15px] font-bold text-[var(--color-text)]">
              {visitorName(chat)}
            </p>
            <span
              className={`badge text-[11px] ${
                chat.visitor
                  ? "bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]"
                  : "bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]"
              }`}
            >
              {chat.visitor ? ROLE_LABELS[chat.visitor.role] : "ไม่พบบัญชี"}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--color-text-muted)]">
            <Mail size={12} className="shrink-0" />
            {chat.visitor?.email ?? "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleStatus()}
          disabled={busy}
          className={`btn-pill shrink-0 px-3.5 py-2 text-xs font-semibold disabled:opacity-50 ${
            closed
              ? "border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-ink)]/40"
              : "btn-pill-primary"
          }`}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : closed ? (
            <RotateCcw size={13} />
          ) : (
            <CheckCircle2 size={13} />
          )}
          {closed ? "เปิดแชทอีกครั้ง" : "ปิดเรื่อง"}
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-surface-alt)] px-4 py-5 sm:px-6">
        {loadError ? (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">โหลดข้อความไม่สำเร็จ</p>
        ) : !messages ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            กำลังโหลดข้อความ...
          </p>
        ) : (
          <>
            <p className="text-center text-[11px] text-[var(--color-text-faint)]">
              เริ่มแชท {formatThaiDateTime(chat.createdAt)}
            </p>
            {messages.map((m) => {
              const mine = m.from === "admin";
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <p
                    className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                      mine
                        ? "rounded-br-md bg-[var(--color-ink)] text-white"
                        : "rounded-bl-md bg-white text-[var(--color-text)] shadow-[var(--shadow-sm)]"
                    }`}
                  >
                    {m.text}
                  </p>
                  <p className="mt-1 px-1 text-[10px] text-[var(--color-text-faint)]" title={formatThaiDateTime(m.createdAt)}>
                    {formatChatTime(m.createdAt)}
                  </p>
                </div>
              );
            })}
            {closed && (
              <p className="text-center text-[11px] text-[var(--color-text-faint)]">
                ปิดเรื่องแล้ว — ถ้าผู้ใช้ส่งข้อความใหม่ แชทจะกลับมาอยู่ใน “กำลังคุย” อัตโนมัติ
              </p>
            )}
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="border-t border-[var(--color-border)] bg-white px-4 py-3 sm:px-5"
      >
        {error && (
          <p role="alert" className="mb-2 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="พิมพ์คำตอบถึงผู้ใช้... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
            className="max-h-36 flex-1 resize-none rounded-2xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm focus:border-[var(--color-ink)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="ส่งคำตอบ"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Admin inbox for the site's "chat with admin" widget. */
export default function AdminChats() {
  const [tab, setTab] = useState<Tab>("open");
  const [result, setResult] = useState<AdminChatList | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<AdminChatSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchAdminChats(tab)
        .then((body) => {
          if (cancelled) return;
          setResult(body);
          setError(false);
          // Keep the open thread's header (status, visitor) current.
          setSelected((s) => (s ? (body.data.find((c) => c.id === s.id) ?? s) : s));
        })
        .catch(() => !cancelled && setError(true));
    void load();
    const timer = setInterval(load, LIST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tab, reloadKey]);

  const counts = result?.counts;
  const countFor = (t: Tab) => (!counts ? null : t === "all" ? counts.open + counts.closed : counts[t]);

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Live Chat"
        title="แชทจากผู้ใช้"
        description="ข้อความที่ผู้ใช้ส่งผ่านปุ่มแชทมุมขวาล่างของเว็บไซต์ ตอบกลับได้จากที่นี่ แล้วปิดเรื่องเมื่อช่วยเหลือเสร็จ"
        action={
          counts && counts.unread > 0 ? (
            <span className="badge bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
              ยังไม่ได้อ่าน {counts.unread} แชท
            </span>
          ) : undefined
        }
      />

      <div className="mt-7 px-5 sm:px-8">
        <div className="card grid h-[min(720px,calc(100svh-12rem))] min-h-[480px] overflow-hidden lg:grid-cols-[340px_1fr]">
          {/* List */}
          <div
            className={`min-h-0 flex-col border-[var(--color-border)] lg:flex lg:border-r ${selected ? "hidden" : "flex"}`}
          >
            <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] p-3">
              {TABS.map((t) => {
                const active = tab === t.value;
                const n = countFor(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={`btn-pill px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "btn-pill-primary"
                        : "border border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:border-[var(--color-ink)]/30"
                    }`}
                  >
                    {t.label}
                    {n !== null && (
                      <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-[var(--color-surface-alt)]"}`}>
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {error ? (
                <p className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                  โหลดแชทไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
                </p>
              ) : !result ? (
                <p className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--color-text-muted)]">
                  <Loader2 size={16} className="animate-spin" />
                  กำลังโหลด...
                </p>
              ) : result.data.length === 0 ? (
                <p className="p-6 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {tab === "open" ? "ไม่มีแชทที่รอตอบ" : "ยังไม่มีแชท"}
                </p>
              ) : (
                result.data.map((c) => (
                  <ChatListItem key={c.id} chat={c} active={selected?.id === c.id} onSelect={() => setSelected(c)} />
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={`min-h-0 lg:block ${selected ? "block" : "hidden"}`}>
            {selected ? (
              <ChatThread key={selected.id} chat={selected} onBack={() => setSelected(null)} onChanged={reload} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]">
                  <MessagesSquare size={24} />
                </span>
                <p className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">เลือกแชทเพื่อเริ่มตอบ</p>
                <p className="max-w-xs text-xs leading-relaxed text-[var(--color-text-muted)]">
                  แชทใหม่และแชทที่ยังไม่ได้อ่านจะอยู่ด้านบนสุดของรายการ
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
