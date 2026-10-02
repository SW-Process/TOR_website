import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { ChatConversation, ChatMessage, User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await ChatConversation.syncIndexes();
});

afterEach(async () => {
  await Promise.all([
    ChatConversation.deleteMany({}),
    ChatMessage.deleteMany({}),
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentWithRole(email: string, role: "admin" | "vendor") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  await User.updateOne({ email }, { role });
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  return agent;
}

describe("/api/chat (visitor)", () => {
  it("returns no conversation before the first message", async () => {
    const res = await request(app).get("/api/chat/conversation");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversation: null, messages: [] });
  });

  it("gives an anonymous visitor a guest token that unlocks only their thread", async () => {
    const first = await request(app).post("/api/chat/messages").send({ text: "สวัสดีครับ" });
    expect(first.status).toBe(201);
    const token = first.body.guestToken as string;
    expect(token).toEqual(expect.any(String));

    // The raw token is never stored.
    const stored = await ChatConversation.findById(first.body.conversation.id).lean();
    expect(stored?.guestTokenHash).not.toBe(token);

    const again = await request(app).post("/api/chat/messages").set("X-Chat-Token", token).send({ text: "ขอสอบถาม" });
    expect(again.status).toBe(201);
    expect(again.body.guestToken).toBeUndefined();
    expect(again.body.conversation.id).toBe(first.body.conversation.id);

    const mine = await request(app).get("/api/chat/conversation").set("X-Chat-Token", token);
    expect(mine.body.messages.map((m: { text: string }) => m.text)).toEqual(["สวัสดีครับ", "ขอสอบถาม"]);

    const stranger = await request(app).get("/api/chat/conversation").set("X-Chat-Token", "not-the-token");
    expect(stranger.body.conversation).toBeNull();
  });

  it("keys a logged-in visitor's thread by account", async () => {
    const vendor = await agentWithRole("vendor@test.com", "vendor");
    const a = await vendor.post("/api/chat/messages").send({ text: "ข้อความแรก" });
    const b = await vendor.post("/api/chat/messages").send({ text: "ข้อความสอง" });
    expect(a.body.guestToken).toBeUndefined();
    expect(b.body.conversation.id).toBe(a.body.conversation.id);
    expect(await ChatConversation.countDocuments()).toBe(1);
  });

  it("rejects empty messages", async () => {
    const res = await request(app).post("/api/chat/messages").send({ text: "   " });
    expect(res.status).toBe(400);
  });

  it("polls only messages after the cursor", async () => {
    const first = await request(app).post("/api/chat/messages").send({ text: "หนึ่ง" });
    const token = first.body.guestToken as string;
    await request(app).post("/api/chat/messages").set("X-Chat-Token", token).send({ text: "สอง" });

    const res = await request(app)
      .get(`/api/chat/conversation?after=${first.body.message.id}`)
      .set("X-Chat-Token", token);
    expect(res.body.messages.map((m: { text: string }) => m.text)).toEqual(["สอง"]);
  });
});

describe("/api/admin/chats", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/chats")).status).toBe(401);
    const vendor = await agentWithRole("v2@test.com", "vendor");
    expect((await vendor.get("/api/admin/chats")).status).toBe(403);
  });

  it("lists threads with visitor and unread counts, and round-trips a reply", async () => {
    const vendor = await agentWithRole("vendor@test.com", "vendor");
    await vendor.put("/api/vendor/profile").send({ companyName: "บริษัท ตัวอย่าง จำกัด" });
    await vendor.post("/api/chat/messages").send({ text: "เข้าสู่ระบบไม่ได้" });
    const guest = await request(app).post("/api/chat/messages").send({ text: "ข้อมูล TOR ผิด" });
    const token = guest.body.guestToken as string;

    const admin = await agentWithRole("admin@test.com", "admin");
    const list = await admin.get("/api/admin/chats");
    expect(list.status).toBe(200);
    expect(list.body.counts).toEqual({ open: 2, closed: 0, unread: 2 });
    const [guestChat, vendorChat] = list.body.data;
    expect(guestChat).toMatchObject({ visitor: null, lastMessagePreview: "ข้อมูล TOR ผิด", unread: 1 });
    expect(vendorChat.visitor).toMatchObject({ email: "vendor@test.com", displayName: "บริษัท ตัวอย่าง จำกัด" });

    // Admin reads and replies to the guest.
    expect((await admin.post(`/api/admin/chats/${guestChat.id}/read`)).status).toBe(204);
    const reply = await admin.post(`/api/admin/chats/${guestChat.id}/messages`).send({ text: "รับทราบครับ" });
    expect(reply.status).toBe(201);
    expect(reply.body.message).toMatchObject({ from: "admin", text: "รับทราบครับ" });

    const thread = await admin.get(`/api/admin/chats/${guestChat.id}/messages`);
    expect(thread.body.messages.map((m: { from: string }) => m.from)).toEqual(["visitor", "admin"]);

    // The guest sees the reply as unread until they mark it read.
    const seen = await request(app).get("/api/chat/conversation").set("X-Chat-Token", token);
    expect(seen.body.conversation.unread).toBe(1);
    expect(seen.body.messages.at(-1)).toMatchObject({ from: "admin", text: "รับทราบครับ" });
    await request(app).post("/api/chat/read").set("X-Chat-Token", token);
    const after = await request(app).get("/api/chat/conversation").set("X-Chat-Token", token);
    expect(after.body.conversation.unread).toBe(0);

    const relisted = await admin.get("/api/admin/chats?status=all");
    expect(relisted.body.counts.unread).toBe(1);
  });

  it("closes a thread and reopens it when the visitor writes again", async () => {
    const guest = await request(app).post("/api/chat/messages").send({ text: "ขอบคุณครับ" });
    const id = guest.body.conversation.id as string;
    const admin = await agentWithRole("admin@test.com", "admin");

    const closed = await admin.patch(`/api/admin/chats/${id}`).send({ status: "closed" });
    expect(closed.body.chat.status).toBe("closed");
    expect((await admin.get("/api/admin/chats")).body.data).toHaveLength(0);

    await request(app).post("/api/chat/messages").set("X-Chat-Token", guest.body.guestToken).send({ text: "อีกเรื่องครับ" });
    expect((await ChatConversation.findById(id).lean())?.status).toBe("open");
  });

  it("404s on an unknown thread and 400s on a bad id", async () => {
    const admin = await agentWithRole("admin@test.com", "admin");
    const missing = new mongoose.Types.ObjectId().toString();
    expect((await admin.post(`/api/admin/chats/${missing}/messages`).send({ text: "hi" })).status).toBe(404);
    expect((await admin.get("/api/admin/chats/nope/messages")).status).toBe(400);
  });
});
