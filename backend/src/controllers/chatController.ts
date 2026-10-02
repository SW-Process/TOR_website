import type { Request, Response } from "express";
import { ChatConversation } from "../models";
import { httpError } from "../utils/httpError";
import {
  afterQuerySchema,
  appendMessage,
  hashGuestToken,
  messageBodySchema,
  newGuestToken,
  readMessages,
} from "../services/chat";

/**
 * Visitor side of the site "chat with admin" widget. A logged-in caller's
 * thread is keyed by their account; an anonymous caller proves ownership with
 * the guest token handed out on their first message, sent back as
 * `X-Chat-Token`.
 */

export const GUEST_TOKEN_HEADER = "X-Chat-Token";

function findOwnConversation(req: Request) {
  if (req.user) return ChatConversation.findOne({ user: req.user.id });
  const token = req.get(GUEST_TOKEN_HEADER);
  if (!token) return null;
  return ChatConversation.findOne({ guestTokenHash: hashGuestToken(token) });
}

function conversationView(c: { _id: { toString(): string }; status: string; unreadByVisitor: number }) {
  return { id: c._id.toString(), status: c.status, unread: c.unreadByVisitor };
}

/** GET /api/chat/conversation?after=<messageId> — the caller's thread, or null before their first message. */
export async function getMyConversation(req: Request, res: Response): Promise<void> {
  const parsed = afterQuerySchema.safeParse(req.query);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  const conversation = await findOwnConversation(req);
  if (!conversation) {
    res.status(200).json({ conversation: null, messages: [] });
    return;
  }
  res.status(200).json({
    conversation: conversationView(conversation),
    messages: await readMessages(conversation._id, parsed.data.after),
  });
}

/**
 * POST /api/chat/messages — send a message to the admins, starting the thread
 * on the first one. An anonymous caller's first message returns `guestToken`,
 * which the client must keep to read the thread later.
 */
export async function sendMyMessage(req: Request, res: Response): Promise<void> {
  const parsed = messageBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join("; "));

  let conversation = await findOwnConversation(req);
  let guestToken: string | undefined;
  if (!conversation) {
    if (req.user) {
      // upsert so two first messages racing don't trip the unique index
      conversation = await ChatConversation.findOneAndUpdate(
        { user: req.user.id },
        { $setOnInsert: { user: req.user.id } },
        { upsert: true, returnDocument: "after" }
      );
    } else {
      const { token, hash } = newGuestToken();
      conversation = await ChatConversation.create({ guestTokenHash: hash });
      guestToken = token;
    }
  }

  const message = await appendMessage(conversation!._id, "visitor", req.user?.id ?? null, parsed.data.text);
  res.status(201).json({
    conversation: { id: conversation!._id.toString() },
    message,
    ...(guestToken ? { guestToken } : {}),
  });
}

/** POST /api/chat/read — the visitor has seen the admins' replies. */
export async function markMyConversationRead(req: Request, res: Response): Promise<void> {
  const conversation = await findOwnConversation(req);
  if (conversation && conversation.unreadByVisitor > 0) {
    conversation.unreadByVisitor = 0;
    await conversation.save();
  }
  res.status(204).end();
}
