import { Schema, model, type Types } from "mongoose";

export type ChatConversationStatus = "open" | "closed";
export type ChatSender = "visitor" | "admin";

export interface IChatConversation {
  user: Types.ObjectId;
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
 * chatconversations — one "chat with admin" thread per account (site chat
 * widget; login required).
 */
const chatConversationSchema = new Schema<IChatConversation>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
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

// One thread per account.
chatConversationSchema.index({ user: 1 }, { unique: true });
chatConversationSchema.index({ lastMessageAt: -1 });

export const ChatConversation = model<IChatConversation>("ChatConversation", chatConversationSchema);
export default ChatConversation;
