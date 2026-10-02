"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Loader2, MessageCircle, Search, SendHorizontal } from "lucide-react";
import AdminPageHeader from "./AdminPageHeader";
import { API_BASE } from "@/lib/api";
import { formatThaiDateTime } from "@/lib/adminStats";
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

/*
 * LINE-style inbox: thread list on the left, conversation on the right.
 * The two-pane layout (sizes, which pane shows on narrow screens) is driven by
 * inline styles and a media query in JS on purpose, so it never depends on a
 * (possibly stale, during dev HMR) stylesheet having a one-off utility class.
 */

type Tab = ChatStatus | "all";

/** Re-check the thread list this often while the inbox is open. */
const LIST_REFRESH_MS = 10_000;
/** Consecutive messages from one side closer than this share one timestamp. */
const GROUP_GAP_MS = 5 * 60_000;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "open", label: "กำลังคุย" },
  { value: "closed", label: "ปิดแล้ว" },
];

const ROLE_LABELS: Record<ChatVisitor["role"], string> = {
  vendor: "ผู้ประกอบการ",
  admin: "ผู้ดูแลระบบ",
};

const LIST_WIDTH = 320;
const THREAD_BG = "#f4f1f0";

// Side-by-side panes from this width up; one pane at a time below it.
const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const useIsWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );

function visitorName(chat: AdminChatSummary) {
  return chat.visitor ? chat.visitor.displayName : "บัญชีที่ถูกลบแล้ว";
}

const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });

/** "14:05" today, otherwise a short date — like LINE's list. */
function listTime(iso: string) {
  return dayKey(iso) === new Date().toDateString()
    ? formatChatTime(iso)
    : new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function Avatar({ visitor, size }: { visitor: ChatVisitor | null; size: number }) {
  if (visitor?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${API_BASE}${visitor.avatarUrl}`}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: visitor ? "#4a3d3a" : "#b3a7a3" }}
    >
      {visitor ? visitor.displayName.trim().slice(0, 1).toUpperCase() : "?"}
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
  const unread = chat.unread > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-alt)]"
      style={active ? { background: "var(--color-blush-soft)" } : undefined}
    >
      <Avatar visitor={chat.visitor} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)]">
            {visitorName(chat)}
          </p>
          <span className="shrink-0 text-xs text-[var(--color-text-faint)]">{listTime(chat.lastMessageAt)}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate text-xs"
            style={{ color: unread ? "var(--color-text)" : "var(--color-text-muted)" }}
          >
            {chat.lastMessageFrom === "admin" ? "คุณ: " : ""}
            {chat.lastMessagePreview}
          </p>
          {unread && (
            <span
              className="flex shrink-0 items-center justify-center rounded-full px-1.5 font-bold text-white"
              style={{ minWidth: 20, height: 20, fontSize: 11, background: "var(--color-rose)" }}
            >
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatThread({
  chat,
  showBack,
  onBack,
  onChanged,
}: {
  chat: AdminChatSummary;
  showBack: boolean;
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
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 py-3">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="กลับไปที่รายการแชท"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-surface-alt)]"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <Avatar visitor={chat.visitor} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">{visitorName(chat)}</p>
          <p className="truncate text-xs text-[var(--color-text-muted)]">
            {chat.visitor ? `${ROLE_LABELS[chat.visitor.role]} · ${chat.visitor.email}` : "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleStatus()}
          disabled={busy}
          className="shrink-0 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)] disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : closed ? "เปิดแชทอีกครั้ง" : "ปิดเรื่อง"}
        </button>
      </header>

      {/* Messages */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ background: THREAD_BG }}>
        {loadError ? (
          <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">โหลดข้อความไม่สำเร็จ</p>
        ) : !messages ? (
          <div className="flex justify-center py-10 text-[var(--color-text-faint)]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const startsGroup =
                newDay || prev.from !== m.from || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > GROUP_GAP_MS;
              const endsGroup =
                !next ||
                next.from !== m.from ||
                dayKey(next.createdAt) !== dayKey(m.createdAt) ||
                Date.parse(next.createdAt) - Date.parse(m.createdAt) > GROUP_GAP_MS;
              const mine = m.from === "admin";
              const time = endsGroup ? (
                <span className="shrink-0 pb-0.5 text-[var(--color-text-faint)]" style={{ fontSize: 10 }}>
                  {formatChatTime(m.createdAt)}
                </span>
              ) : null;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center">
                      <span
                        className="rounded-full px-3 py-0.5 text-white"
                        style={{ fontSize: 11, background: "rgba(34,26,24,0.25)" }}
                      >
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    className="flex items-end gap-2"
                    style={{ justifyContent: mine ? "flex-end" : "flex-start", marginTop: startsGroup ? 12 : 4 }}
                  >
                    {!mine && (
                      <span className="shrink-0 self-start" style={{ width: 32 }}>
                        {startsGroup && <Avatar visitor={chat.visitor} size={32} />}
                      </span>
                    )}
                    {mine && time}
                    <p
                      title={formatThaiDateTime(m.createdAt)}
                      className="whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                      style={{
                        maxWidth: "70%",
                        background: mine ? "var(--color-ink)" : "#ffffff",
                        color: mine ? "#ffffff" : "var(--color-text)",
                      }}
                    >
                      {m.text}
                    </p>
                    {!mine && time}
                  </div>
                </Fragment>
              );
            })}
            {closed && (
              <p className="mt-6 text-center text-xs text-[var(--color-text-muted)]">
                ปิดเรื่องแล้ว · ถ้าผู้ใช้ทักมาใหม่ แชทจะกลับไปอยู่ใน “กำลังคุย” เอง
              </p>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="border-t border-[var(--color-border)] bg-white px-3 py-3"
      >
        {error && (
          <p role="alert" className="mb-2 px-1 text-xs text-[var(--color-danger)]">
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
            rows={1}
            maxLength={2000}
            placeholder="พิมพ์ข้อความ"
            className="flex-1 resize-none rounded-2xl bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm focus:outline-none"
            style={{ maxHeight: 140 }}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="ส่งข้อความ"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-30"
            style={{ background: "var(--color-ink)" }}
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <SendHorizontal size={17} />}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Admin inbox for the site's "chat with admin" widget. */
export default function AdminChats() {
  const isWide = useIsWide();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<AdminChatList | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        })
        .catch(() => !cancelled && setError(true));
    void load();
    const timer = setInterval(load, LIST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tab, reloadKey]);

  const visibleChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = result?.data ?? [];
    if (!q) return all;
    return all.filter((c) =>
      [visitorName(c), c.visitor?.email ?? "", c.lastMessagePreview].some((v) => v.toLowerCase().includes(q)),
    );
  }, [result, search]);

  // The open thread always comes from the current list, so switching tabs (or
  // a thread moving to another tab) never leaves a stale thread on screen.
  const selected = result?.data.find((c) => c.id === selectedId) ?? null;

  function changeTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setSelectedId(null);
    setResult(null);
  }

  const showList = isWide || !selected;
  const showThread = isWide || selected !== null;
  const unreadCount = result?.counts.unread ?? 0;

  return (
    <div className="pb-12">
      <AdminPageHeader
        eyebrow="Live Chat"
        title="แชทจากผู้ใช้"
        description="ตอบคำถามที่ผู้ใช้ส่งผ่านปุ่มแชทบนเว็บไซต์ แล้วปิดเรื่องเมื่อช่วยเหลือเสร็จ"
      />

      <div className="mt-6 px-5 sm:px-8">
        <div
          className="flex overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white"
          style={{ height: "calc(100svh - 17rem)", minHeight: 480, maxHeight: 820 }}
        >
          {/* Thread list */}
          {showList && (
            <aside
              className="flex min-h-0 shrink-0 flex-col"
              style={{
                width: isWide ? LIST_WIDTH : "100%",
                borderRight: isWide ? "1px solid var(--color-border)" : undefined,
              }}
            >
              <nav className="flex gap-5 border-b border-[var(--color-border)] px-4 pt-3">
                {TABS.map((t) => {
                  const active = tab === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => changeTab(t.value)}
                      className="relative pb-2.5 text-sm transition-colors"
                      style={{
                        marginBottom: -1,
                        fontWeight: active ? 700 : 400,
                        color: active ? "var(--color-text)" : "var(--color-text-faint)",
                        borderBottom: `2px solid ${active ? "var(--color-ink)" : "transparent"}`,
                      }}
                    >
                      {t.label}
                      {t.value === "open" && unreadCount > 0 && (
                        <span
                          className="absolute rounded-full"
                          style={{ top: 0, right: -8, width: 6, height: 6, background: "var(--color-rose)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="px-3 py-3">
                <label className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-alt)] px-3 py-2">
                  <Search size={15} className="shrink-0 text-[var(--color-text-faint)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาชื่อหรือข้อความ"
                    className="w-full bg-transparent text-sm focus:outline-none"
                  />
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {error ? (
                  <p className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                    โหลดแชทไม่สำเร็จ — ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
                  </p>
                ) : !result ? (
                  <div className="flex justify-center p-6 text-[var(--color-text-faint)]">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                ) : visibleChats.length === 0 ? (
                  <p className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                    {search.trim()
                      ? "ไม่พบแชทที่ตรงกับคำค้น"
                      : tab === "closed"
                        ? "ยังไม่มีแชทที่ปิดแล้ว"
                        : tab === "open"
                          ? "ไม่มีแชทที่รอตอบ"
                          : "ยังไม่มีแชท"}
                  </p>
                ) : (
                  visibleChats.map((c) => (
                    <ChatListItem key={c.id} chat={c} active={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
                  ))
                )}
              </div>
            </aside>
          )}

          {/* Conversation */}
          {showThread && (
            <section className="min-h-0 min-w-0 flex-1">
              {selected ? (
                <ChatThread
                  key={selected.id}
                  chat={selected}
                  showBack={!isWide}
                  onBack={() => setSelectedId(null)}
                  onChanged={reload}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <span
                    className="flex items-center justify-center rounded-full text-[var(--color-text-faint)]"
                    style={{ width: 88, height: 88, background: "var(--color-surface-alt)" }}
                  >
                    <MessageCircle size={40} />
                  </span>
                  <p className="text-sm text-[var(--color-text-muted)]">เลือกแชทเพื่อเริ่มสนทนา</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
