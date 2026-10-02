import { apiFetch } from "./api";

/**
 * Client for the site "chat with admin" feature. Logged-in visitors use
 * /api/chat (identified by the session cookie); admins use /api/admin/chats.
 */

export type ChatSender = "visitor" | "admin";

export interface ChatMessage {
  id: string;
  from: ChatSender;
  text: string;
  createdAt: string;
}

export interface VisitorConversation {
  id: string;
  status: "open" | "closed";
  /** Admin replies the visitor hasn't seen yet. */
  unread: number;
}

/** How often an open chat window / admin thread checks for new messages. */
export const CHAT_POLL_ACTIVE_MS = 4_000;
/** How often a closed widget or the admin inbox list checks for activity. */
export const CHAT_POLL_IDLE_MS = 30_000;

export async function fetchMyConversation(
  after?: string
): Promise<{ conversation: VisitorConversation | null; messages: ChatMessage[] }> {
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";
  const res = await apiFetch(`/api/chat/conversation${qs}`);
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json();
}

export async function sendMyMessage(text: string): Promise<ChatMessage> {
  const res = await apiFetch("/api/chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return ((await res.json()) as { message: ChatMessage }).message;
}

export async function markMyConversationRead(): Promise<void> {
  await apiFetch("/api/chat/read", { method: "POST" });
}

/**
 * Add polled/sent messages, dropping ones already shown, in send order
 * (ids are Mongo ObjectIds, whose hex form sorts by creation time).
 */
export function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  if (!fresh.length) return prev;
  return [...prev, ...fresh].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

// ── Admin inbox ──────────────────────────────────────────────────────────────

export type ChatStatus = "open" | "closed";

export interface ChatVisitor {
  id: string;
  email: string;
  displayName: string;
  companyName: string | null;
  role: "vendor" | "admin";
  avatarUrl: string | null;
}

export interface AdminChatSummary {
  id: string;
  status: ChatStatus;
  /** null only if the account has since been deleted. */
  visitor: ChatVisitor | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFrom: ChatSender;
  /** Visitor messages no admin has seen yet. */
  unread: number;
  createdAt: string;
}

export interface AdminChatList {
  data: AdminChatSummary[];
  totalCount: number;
  counts: { open: number; closed: number; unread: number };
  hasNextPage: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchAdminChats(status: ChatStatus | "all", pageSize = 50): Promise<AdminChatList> {
  const params = new URLSearchParams({ status, pageSize: String(pageSize) });
  return json(await apiFetch(`/api/admin/chats?${params}`));
}

export async function fetchAdminChatMessages(id: string, after?: string): Promise<ChatMessage[]> {
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";
  const body = await json<{ messages: ChatMessage[] }>(await apiFetch(`/api/admin/chats/${id}/messages${qs}`));
  return body.messages;
}

export async function replyToChat(id: string, text: string): Promise<ChatMessage> {
  const res = await apiFetch(`/api/admin/chats/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return (await json<{ message: ChatMessage }>(res)).message;
}

export async function markChatRead(id: string): Promise<void> {
  await apiFetch(`/api/admin/chats/${id}/read`, { method: "POST" });
}

export async function setChatStatus(id: string, status: ChatStatus): Promise<void> {
  await json(
    await apiFetch(`/api/admin/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  );
}
