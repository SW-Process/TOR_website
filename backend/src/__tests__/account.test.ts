import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Bookmark, ChatConversation, ChatMessage, ErrorReport, User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all(
    [User, VendorProfile, Bookmark, ChatConversation, ChatMessage, ErrorReport].map((m) =>
      (m as unknown as mongoose.Model<unknown>).deleteMany({})
    )
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const creds = { email: "vendor@test.com", password: "secret123" };

/** Register `creds` and return an agent carrying its session cookie. */
async function signedIn() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds).expect(201);
  return agent;
}

/** A Google-only account (no password) with a session cookie. */
async function googleOnly() {
  const user = await User.create({ email: "g@test.com", role: "vendor", googleOAuthId: "gid-1" });
  const { signToken } = await import("../utils/token");
  const agent = request.agent(app);
  agent.set("Cookie", `token=${signToken(user)}`);
  return { agent, user };
}

describe("GET /api/auth/me", () => {
  it("reports the account flags without leaking the hash", async () => {
    const agent = await signedIn();
    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body.user).toMatchObject({ email: creds.email, hasPassword: true, googleLinked: false, displayName: null });
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });
});

describe("PATCH /api/auth/me", () => {
  it("sets and trims the display name; blank resets it", async () => {
    const agent = await signedIn();
    const set = await agent.patch("/api/auth/me").send({ displayName: "  Somchai  " }).expect(200);
    expect(set.body.user.displayName).toBe("Somchai");

    const reset = await agent.patch("/api/auth/me").send({ displayName: "   " }).expect(200);
    expect(reset.body.user.displayName).toBeNull();
  });

  it("rejects an over-long name", async () => {
    const agent = await signedIn();
    await agent.patch("/api/auth/me").send({ displayName: "x".repeat(61) }).expect(400);
  });

  it("requires a session", async () => {
    await request(app).patch("/api/auth/me").send({ displayName: "x" }).expect(401);
  });
});

describe("PUT /api/auth/password", () => {
  it("changes the password when the current one is right", async () => {
    const agent = await signedIn();
    await agent
      .put("/api/auth/password")
      .send({ currentPassword: creds.password, newPassword: "newsecret1" })
      .expect(200);

    await request(app).post("/api/auth/login").send(creds).expect(401);
    await request(app).post("/api/auth/login").send({ ...creds, password: "newsecret1" }).expect(200);
  });

  it("rejects a wrong current password", async () => {
    const agent = await signedIn();
    await agent
      .put("/api/auth/password")
      .send({ currentPassword: "wrongpass1", newPassword: "newsecret1" })
      .expect(401);
  });

  it("rejects a short new password", async () => {
    const agent = await signedIn();
    await agent.put("/api/auth/password").send({ currentPassword: creds.password, newPassword: "short" }).expect(400);
  });

  it("lets a Google-only account set its first password", async () => {
    const { agent } = await googleOnly();
    const res = await agent.put("/api/auth/password").send({ newPassword: "firstpass1" }).expect(200);
    expect(res.body.user.hasPassword).toBe(true);
    await request(app).post("/api/auth/login").send({ email: "g@test.com", password: "firstpass1" }).expect(200);
  });
});

describe("PUT /api/auth/email", () => {
  it("changes the email with the current password", async () => {
    const agent = await signedIn();
    const res = await agent
      .put("/api/auth/email")
      .send({ email: "New@Test.com", currentPassword: creds.password })
      .expect(200);
    expect(res.body.user.email).toBe("new@test.com");
    await request(app).post("/api/auth/login").send({ email: "new@test.com", password: creds.password }).expect(200);
  });

  it("rejects an email another account uses", async () => {
    await User.create({ email: "taken@test.com", role: "vendor" });
    const agent = await signedIn();
    await agent.put("/api/auth/email").send({ email: "taken@test.com", currentPassword: creds.password }).expect(409);
  });

  it("rejects a wrong password", async () => {
    const agent = await signedIn();
    await agent.put("/api/auth/email").send({ email: "new@test.com", currentPassword: "wrongpass1" }).expect(401);
  });

  it("asks a Google-only account to set a password first", async () => {
    const { agent } = await googleOnly();
    await agent.put("/api/auth/email").send({ email: "new@test.com" }).expect(400);
  });
});

describe("DELETE /api/auth/me", () => {
  it("deletes the account and its data, anonymising error reports", async () => {
    const agent = await signedIn();
    const user = (await User.findOne({ email: creds.email }))!;
    const profile = await VendorProfile.create({ userId: user._id });
    await Bookmark.create({ vendorId: profile._id, torId: new mongoose.Types.ObjectId() });
    const convo = await ChatConversation.create({ user: user._id });
    await ChatMessage.create({ conversation: convo._id, sender: user._id, from: "visitor", text: "hi" });
    const report = await ErrorReport.create({
      torId: new mongoose.Types.ObjectId(),
      reportedBy: user._id,
      description: "wrong budget",
    });

    const res = await agent.delete("/api/auth/me").send({ currentPassword: creds.password }).expect(200);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/token=;/);

    expect(await User.exists({ _id: user._id })).toBeNull();
    expect(await VendorProfile.exists({ _id: profile._id })).toBeNull();
    expect(await Bookmark.countDocuments({ vendorId: profile._id })).toBe(0);
    expect(await ChatMessage.countDocuments({ conversation: convo._id })).toBe(0);
    expect(await ChatConversation.exists({ _id: convo._id })).toBeNull();
    expect((await ErrorReport.findById(report._id))?.reportedBy).toBeNull();
  });

  it("keeps the account on a wrong password", async () => {
    const agent = await signedIn();
    await agent.delete("/api/auth/me").send({ currentPassword: "wrongpass1" }).expect(401);
    expect(await User.exists({ email: creds.email })).not.toBeNull();
  });

  it("confirms a Google-only account by its email", async () => {
    const { agent, user } = await googleOnly();
    await agent.delete("/api/auth/me").send({ confirmEmail: "other@test.com" }).expect(400);
    await agent.delete("/api/auth/me").send({ confirmEmail: "G@test.com" }).expect(200);
    expect(await User.exists({ _id: user._id })).toBeNull();
  });

  it("refuses to delete an admin account", async () => {
    await signedIn();
    await User.updateOne({ email: creds.email }, { role: "admin" });
    const login = request.agent(app);
    await login.post("/api/auth/login").send(creds).expect(200);
    await login.delete("/api/auth/me").send({ currentPassword: creds.password }).expect(403);
  });
});
