import type { Request, Response } from "express";
import { ChatConversation } from "../models";
import { httpError } from "../utils/httpError";
import { afterQuerySchema, appendMessage, messageBodySchema, readMessages } from "../services/chat";

/**
 * Visitor side of the site "chat with admin" widget. Login required: each
 * account has one thread, so admins always know who they're talking to.
 */

function conversationView(c: { _id: { toString(): string }; status: string; unreadByVisitor: number }) {
  return { id: c._id.toString(), status: c.status, unread: c.unreadByVisitor };
}

/** GET /api/chat/conversation?after=<messageId> — the caller's thread, or null before their first message. */
export async function getMyConversation(req: Request, res: Response): Promise<void> {
  const parsed = afterQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  const conversation = await ChatConversation.findOne({ user: req.user!.id });
  if (!conversation) {
    res.status(200).json({ conversation: null, messages: [] });
    return;
  }
  res.status(200).json({
    conversation: conversationView(conversation),
    messages: await readMessages(conversation._id, parsed.data.after),
  });
}

/** POST /api/chat/messages — send a message to the admins, starting the thread on the first one. */
export async function sendMyMessage(req: Request, res: Response): Promise<void> {
  const parsed = messageBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  const userId = req.user!.id;
  // upsert so two first messages racing don't trip the unique index
  const conversation = await ChatConversation.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, returnDocument: "after" }
  );

  const message = await appendMessage(conversation!._id, "visitor", userId, parsed.data.text);
  res.status(201).json({ conversation: { id: conversation!._id.toString() }, message });
}

/** POST /api/chat/read — the visitor has seen the admins' replies. */
export async function markMyConversationRead(req: Request, res: Response): Promise<void> {
  await ChatConversation.updateOne({ user: req.user!.id }, { $set: { unreadByVisitor: 0 } });
  res.status(204).end();
}
