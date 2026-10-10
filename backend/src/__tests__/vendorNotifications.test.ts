import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Notification, Tor, User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([
    Notification.deleteMany({}),
    Tor.deleteMany({}),
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function vendorAgent(email = "vendor@test.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  const user = await User.findOne({ email });
  const profile = await VendorProfile.findOneAndUpdate(
    { userId: user!._id },
    { $setOnInsert: { userId: user!._id } },
    { upsert: true, returnDocument: "after" }
  );
  return { agent, vendorId: profile!._id };
}

describe("/api/vendor/notifications", () => {
  it("requires a logged-in vendor", async () => {
    const res = await request(app).get("/api/vendor/notifications");
    expect(res.status).toBe(401);
  });

  it("lists only the caller's own notifications, newest first, with the unread count", async () => {
    const mine = await vendorAgent("vendor@test.com");
    const other = await vendorAgent("other@test.com");
    const tor = await Tor.create({ title: "ระบบสารบรรณ", agency: "สำนักการแพทย์", pipelineStatus: "enriched" });

    const older = await Notification.create({
      vendorId: mine.vendorId,
      torId: tor._id,
      type: "profile_match",
      message: "first",
    });
    await Notification.collection.updateOne({ _id: older._id }, { $set: { createdAt: new Date(Date.now() - 1000) } });
    const newer = await Notification.create({
      vendorId: mine.vendorId,
      torId: tor._id,
      type: "profile_match",
      message: "second",
    });
    await Notification.updateOne({ _id: newer._id }, { $set: { read: true } });
    await Notification.create({ vendorId: other.vendorId, torId: tor._id, type: "profile_match", message: "not yours" });

    const res = await mine.agent.get("/api/vendor/notifications");
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: { message: string }) => n.message)).toEqual(["second", "first"]);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.totalCount).toBe(2);
    expect(res.body.data[0]).toMatchObject({
      type: "profile_match",
      read: true,
      tor: { title: "ระบบสารบรรณ", agency: "สำนักการแพทย์", isPublic: true },
    });
  });

  it("flags a TOR that is no longer public but keeps the notification", async () => {
    const { agent, vendorId } = await vendorAgent();
    const tor = await Tor.create({ title: "ถูกซ่อน", pipelineStatus: "rejected" });
    await Notification.create({ vendorId, torId: tor._id, type: "profile_match", message: "m" });

    const res = await agent.get("/api/vendor/notifications");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tor).toMatchObject({ isPublic: false });
  });

  it("keeps the notification even if its TOR no longer exists", async () => {
    const { agent, vendorId } = await vendorAgent();
    await Notification.create({
      vendorId,
      torId: new mongoose.Types.ObjectId(),
      type: "profile_match",
      message: "m",
    });

    const res = await agent.get("/api/vendor/notifications");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tor).toBeNull();
  });

  it("pages the list and reports whether there is a next page", async () => {
    const { agent, vendorId } = await vendorAgent();
    const tor = await Tor.create({ title: "ระบบ", pipelineStatus: "enriched" });
    for (let i = 0; i < 3; i++) {
      await Notification.create({ vendorId, torId: tor._id, type: "profile_match", message: `m${i}` });
    }

    const first = await agent.get("/api/vendor/notifications?pageSize=2");
    expect(first.body).toMatchObject({ totalCount: 3, page: 1, pageSize: 2, hasNextPage: true });
    expect(first.body.data).toHaveLength(2);

    const second = await agent.get("/api/vendor/notifications?pageSize=2&page=2");
    expect(second.body).toMatchObject({ totalCount: 3, page: 2, hasNextPage: false });
    expect(second.body.data).toHaveLength(1);
  });

  it("rejects an invalid page size", async () => {
    const { agent } = await vendorAgent();
    expect((await agent.get("/api/vendor/notifications?pageSize=500")).status).toBe(400);
  });
});

describe("PATCH /api/vendor/notifications/:id/read", () => {
  it("marks one of your own notifications read", async () => {
    const { agent, vendorId } = await vendorAgent();
    const tor = await Tor.create({ title: "ระบบ", pipelineStatus: "enriched" });
    const n = await Notification.create({ vendorId, torId: tor._id, type: "profile_match", message: "m" });

    const res = await agent.patch(`/api/vendor/notifications/${n._id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
    expect((await Notification.findById(n._id).lean())?.read).toBe(true);
  });

  it("cannot mark another vendor's notification read: 404, and it stays unread", async () => {
    const mine = await vendorAgent("vendor@test.com");
    const other = await vendorAgent("other@test.com");
    const tor = await Tor.create({ title: "ระบบ", pipelineStatus: "enriched" });
    const theirs = await Notification.create({ vendorId: other.vendorId, torId: tor._id, type: "profile_match", message: "m" });

    const res = await mine.agent.patch(`/api/vendor/notifications/${theirs._id}/read`);
    expect(res.status).toBe(404);
    expect((await Notification.findById(theirs._id).lean())?.read).toBe(false);
  });

  it("rejects a malformed id", async () => {
    const { agent } = await vendorAgent();
    expect((await agent.patch("/api/vendor/notifications/not-an-id/read")).status).toBe(400);
  });

  it("404s for a notification id that does not exist", async () => {
    const { agent } = await vendorAgent();
    const res = await agent.patch(`/api/vendor/notifications/${new mongoose.Types.ObjectId()}/read`);
    expect(res.status).toBe(404);
  });
});
