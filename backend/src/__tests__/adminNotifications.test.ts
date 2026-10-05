import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { AdminNotification, User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([AdminNotification.deleteMany({}), User.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentFor(email: string, role: "admin" | "vendor") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  await User.updateOne({ email }, { role });
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  const user = await User.findOne({ email }).lean();
  return { agent, id: String(user!._id) };
}

function alert(adminId: string, message: string) {
  return AdminNotification.create({ adminId, type: "pipeline_run_failed", message });
}

describe("admin notifications", () => {
  it("is admin-only", async () => {
    const { agent } = await agentFor("vendor@test.com", "vendor");
    expect((await agent.get("/api/admin/notifications")).status).toBe(403);
  });

  it("lists only the caller's own alerts, newest first, with the unread count", async () => {
    const admin = await agentFor("admin@test.com", "admin");
    const other = await agentFor("other@test.com", "admin");
    await alert(admin.id, "first");
    const second = await alert(admin.id, "second");
    await alert(other.id, "someone else's");
    await AdminNotification.updateOne({ _id: second._id }, { read: true, readAt: new Date() });

    const res = await admin.agent.get("/api/admin/notifications");
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: { message: string }) => n.message)).toEqual(["second", "first"]);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.data[0]).toMatchObject({ read: true, type: "pipeline_run_failed" });
  });

  it("marks one of your own alerts read", async () => {
    const admin = await agentFor("admin@test.com", "admin");
    const n = await alert(admin.id, "run failed");

    const res = await admin.agent.patch(`/api/admin/notifications/${n._id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
    expect((await AdminNotification.findById(n._id).lean())?.read).toBe(true);
  });

  it("cannot mark another admin's alert read: 404, and it stays unread", async () => {
    const admin = await agentFor("admin@test.com", "admin");
    const other = await agentFor("other@test.com", "admin");
    const theirs = await alert(other.id, "not yours");

    const res = await admin.agent.patch(`/api/admin/notifications/${theirs._id}/read`);
    expect(res.status).toBe(404);
    expect((await AdminNotification.findById(theirs._id).lean())?.read).toBe(false);
  });

  it("rejects a malformed id", async () => {
    const admin = await agentFor("admin@test.com", "admin");
    expect((await admin.agent.patch("/api/admin/notifications/not-an-id/read")).status).toBe(400);
  });
});
