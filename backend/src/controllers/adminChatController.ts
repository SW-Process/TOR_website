import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { ChatConversation, User, VendorProfile } from "../models";
import { httpError } from "../utils/httpError";
import { key, person, type UserLite } from "../utils/personView";
import { afterQuerySchema, appendMessage, messageBodySchema, readMessages } from "../services/chat";

/**
 * Admin inbox for the site "chat with admin" widget: every visitor thread,
 * newest activity first, with the visitor's account (or "guest") and unread
 * counts; admins read, reply, and close/reopen threads.
 */

const listQuerySchema = z.object({
  status: z.enum(["open", "closed", "all"]).default("open"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const updateSchema = z.object({ status: z.enum(["open", "closed"]) }).strict();

function conversationId(req: Request): string {
  const id = String(req.params.id);
  if (!isValidObjectId(id)) throw httpError(400, "Invalid conversation id");
  return id;
}

/** GET /api/admin/chats?status=open|closed|all — threads by latest message, with visitor. */
export async function listChats(req: Request, res: Response): Promise<void> {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const q = parsed.data;
  const filter = q.status === "all" ? {} : { status: q.status };

  const [chats, totalCount, openCount, closedCount, unreadCount] = await Promise.all([
    ChatConversation.find(filter)
      .sort({ lastMessageAt: -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    ChatConversation.countDocuments(filter),
    ChatConversation.countDocuments({ status: "open" }),
    ChatConversation.countDocuments({ status: "closed" }),
    ChatConversation.countDocuments({ unreadByAdmin: { $gt: 0 } }),
  ]);

  const userIds = [...new Set(chats.map((c) => key(c.user)).filter(Boolean))];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("email role avatarKey").lean<UserLite[]>(),
    VendorProfile.find({ userId: { $in: userIds } }).select("userId companyName").lean(),
  ]);
  const userById = new Map(users.map((u) => [key(u._id), u]));
  const companyByUser = new Map(profiles.map((p) => [key(p.userId), p.companyName ?? undefined]));

  const data = chats.map((c) => ({
    id: key(c._id),
    status: c.status,
    // null for an anonymous (guest) visitor
    visitor: c.user ? person(userById.get(key(c.user)), companyByUser.get(key(c.user))) : null,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageFrom: c.lastMessageFrom,
    unread: c.unreadByAdmin,
    createdAt: c.createdAt,
  }));

  res.status(200).json({
    data,
    page: q.page,
    pageSize: q.pageSize,
    totalCount,
    counts: { open: openCount, closed: closedCount, unread: unreadCount },
    hasNextPage: q.page * q.pageSize < totalCount,
  });
}

/** GET /api/admin/chats/:id/messages?after=<messageId> — a thread's messages, oldest first. */
export async function getChatMessages(req: Request, res: Response): Promise<void> {
  const id = conversationId(req);
  const parsed = afterQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  const exists = await ChatConversation.exists({ _id: id });
  if (!exists) throw httpError(404, "Conversation not found");
  res.status(200).json({ messages: await readMessages(id, parsed.data.after) });
}

/** POST /api/admin/chats/:id/messages — reply to the visitor. */
export async function replyToChat(req: Request, res: Response): Promise<void> {
  const id = conversationId(req);
  const parsed = messageBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  const message = await appendMessage(id, "admin", req.user!.id, parsed.data.text);
  res.status(201).json({ message });
}

/** POST /api/admin/chats/:id/read — an admin has seen the visitor's messages. */
export async function markChatRead(req: Request, res: Response): Promise<void> {
  const id = conversationId(req);
  const updated = await ChatConversation.updateOne({ _id: id }, { $set: { unreadByAdmin: 0 } });
  if (updated.matchedCount === 0) throw httpError(404, "Conversation not found");
  res.status(204).end();
}

/** PATCH /api/admin/chats/:id — close or reopen a thread. */
export async function updateChat(req: Request, res: Response): Promise<void> {
  const id = conversationId(req);
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  const chat = await ChatConversation.findByIdAndUpdate(
    id,
    { $set: { status: parsed.data.status } },
    { returnDocument: "after" }
  ).lean();
  if (!chat) throw httpError(404, "Conversation not found");
  res.status(200).json({ chat: { id: key(chat._id), status: chat.status } });
}
