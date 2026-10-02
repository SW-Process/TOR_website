import { Schema, model, type Types } from "mongoose";
import type { ChatSender } from "./ChatConversation";

export interface IChatMessage {
  conversation: Types.ObjectId;
  from: ChatSender;
  // the account that wrote it: the admin for replies, the visitor's account
  // when logged in, null for an anonymous visitor
  sender: Types.ObjectId | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * chatmessages — messages of a ChatConversation, read in `_id` order (the
 * polling cursor is the last seen message id).
 */
const chatMessageSchema = new Schema<IChatMessage>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: "ChatConversation", required: true },
    from: { type: String, enum: ["visitor", "admin"], required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", default: null },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversation: 1, _id: 1 });

export const ChatMessage = model<IChatMessage>("ChatMessage", chatMessageSchema);
export default ChatMessage;
