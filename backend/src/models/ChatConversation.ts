import { Schema, model, type Types } from "mongoose";

export type ChatConversationStatus = "open" | "closed";
export type ChatSender = "visitor" | "admin";

export interface IChatConversation {
  user: Types.ObjectId | null;
  guestTokenHash: string | null;
  status: ChatConversationStatus;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastMessageFrom: ChatSender;
  unreadByAdmin: number;
  unreadByVisitor: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * chatconversations — one "chat with admin" thread per visitor (site chat
 * widget). Owned either by a logged-in account (`user`) or, for anonymous
 * visitors, by a random guest token whose SHA-256 is stored here — the raw
 * token only ever lives in the visitor's browser.
 */
const chatConversationSchema = new Schema<IChatConversation>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    guestTokenHash: { type: String, default: null },
    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    // denormalized from the newest ChatMessage so the admin inbox is one query
    lastMessageAt: { type: Date, default: () => new Date() },
    lastMessagePreview: { type: String, default: "" },
    lastMessageFrom: { type: String, enum: ["visitor", "admin"], default: "visitor" },
    unreadByAdmin: { type: Number, default: 0 },
    unreadByVisitor: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One thread per owner.
chatConversationSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: "objectId" } } }
);
chatConversationSchema.index(
  { guestTokenHash: 1 },
  { unique: true, partialFilterExpression: { guestTokenHash: { $type: "string" } } }
);
chatConversationSchema.index({ lastMessageAt: -1 });

export const ChatConversation = model<IChatConversation>("ChatConversation", chatConversationSchema);
export default ChatConversation;
