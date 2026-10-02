import { createHash, randomBytes } from "node:crypto";
import { isValidObjectId, type Types } from "mongoose";
import { z } from "zod";
import { ChatConversation, ChatMessage } from "../models";
import type { ChatSender, IChatMessage } from "../models";
import { httpError } from "../utils/httpError";

/**
 * Shared pieces of the site "chat with admin" feature, used by both the
 * visitor endpoints (/api/chat) and the admin inbox (/api/admin/chats).
 */

/** Messages returned per read; older history beyond this is not paged yet. */
export const MESSAGE_PAGE_SIZE = 100;
const PREVIEW_LENGTH = 120;

export const messageBodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const afterQuerySchema = z.object({
  // polling cursor: only messages newer than this id
  after: z
    .string()
    .refine((v) => isValidObjectId(v), "Invalid cursor")
    .optional(),
});

/** New random guest token (kept by the browser) and the hash we store. */
export function newGuestToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashGuestToken(token) };
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type MessageLike = Pick<IChatMessage, "from" | "text" | "createdAt"> & { _id: Types.ObjectId };

export function serializeMessage(m: MessageLike) {
  return { id: m._id.toString(), from: m.from, text: m.text, createdAt: m.createdAt };
}

/**
 * Messages of a conversation: newer than `after` when polling, otherwise the
 * latest page. Always oldest first.
 */
export async function readMessages(conversationId: Types.ObjectId | string, after?: string) {
  const messages = after
    ? await ChatMessage.find({ conversation: conversationId, _id: { $gt: after } })
        .sort({ _id: 1 })
        .limit(MESSAGE_PAGE_SIZE)
        .lean()
    : (
        await ChatMessage.find({ conversation: conversationId })
          .sort({ _id: -1 })
          .limit(MESSAGE_PAGE_SIZE)
          .lean()
      ).reverse();
  return messages.map(serializeMessage);
}

/**
 * Append a message and keep the conversation's denormalized inbox fields in
 * step: last-message preview, the other side's unread count, and reopening a
 * closed thread when the visitor writes again.
 */
export async function appendMessage(
  conversationId: Types.ObjectId | string,
  from: ChatSender,
  sender: string | null,
  text: string
) {
  const message = await ChatMessage.create({ conversation: conversationId, from, sender, text });
  const updated = await ChatConversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: text.slice(0, PREVIEW_LENGTH),
        lastMessageFrom: from,
        ...(from === "visitor" ? { status: "open" } : {}),
      },
      $inc: from === "visitor" ? { unreadByAdmin: 1 } : { unreadByVisitor: 1 },
    }
  );
  if (updated.matchedCount === 0) throw httpError(404, "Conversation not found");
  return serializeMessage(message);
}
