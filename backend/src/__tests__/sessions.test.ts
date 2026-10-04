import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Session, Tor, User, VendorProfile } from "../models";
import { parseUserAgent } from "../utils/userAgent";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Tor.deleteMany({}), VendorProfile.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const creds = { email: "vendor@test.com", password: "secret123" };

/** Two independent "devices" signed in to the same account. */
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1";

async function twoDevices() {
  const laptop = request.agent(app).set("User-Agent", MAC_SAFARI);
  await laptop.post("/api/auth/register").send(creds).expect(201);
  const phone = request.agent(app).set("User-Agent", IPHONE_CHROME);
  await phone.post("/api/auth/login").send(creds).expect(200);
  return { laptop, phone };
}

describe("POST /api/auth/logout-others", () => {
  it("signs out every other device but keeps this one signed in", async () => {
    const { laptop, phone } = await twoDevices();
    await laptop.post("/api/auth/logout-others").expect(200);

    await laptop.get("/api/auth/me").expect(200);
    await phone.get("/api/auth/me").expect(401);
    await phone.get("/api/vendor/bookmarks").expect(401);
  });

  it("lets a signed-out device sign in again", async () => {
    const { laptop, phone } = await twoDevices();
    await laptop.post("/api/auth/logout-others").expect(200);
    await phone.post("/api/auth/login").send(creds).expect(200);
    await phone.get("/api/auth/me").expect(200);
  });

  it("requires a session", async () => {
    await request(app).post("/api/auth/logout-others").expect(401);
  });
});

describe("changing the password", () => {
  it("signs out the other devices, not the one that changed it", async () => {
    const { laptop, phone } = await twoDevices();
    await laptop
      .put("/api/auth/password")
      .send({ currentPassword: creds.password, newPassword: "newsecret1" })
      .expect(200);

    await laptop.get("/api/auth/me").expect(200);
    await phone.get("/api/auth/me").expect(401);
  });

  it("leaves sessions alone when the change is rejected", async () => {
    const { laptop, phone } = await twoDevices();
    await laptop.put("/api/auth/password").send({ currentPassword: "wrongpass1", newPassword: "newsecret1" }).expect(401);
    await phone.get("/api/auth/me").expect(200);
  });
});

describe("session checks against the database", () => {
  it("keeps a token issued before token versions existed working until the first sign-out", async () => {
    const laptop = request.agent(app);
    await laptop.post("/api/auth/register").send(creds).expect(201);
    const user = (await User.findOne({ email: creds.email }))!;
    // a pre-upgrade cookie: no `tv` claim at all
    const legacy = jwt.sign({ role: "vendor" }, "test-secret", { subject: String(user._id), expiresIn: "7d" });

    await request(app).get("/api/auth/me").set("Cookie", `token=${legacy}`).expect(200);
    await laptop.post("/api/auth/logout-others").expect(200);
    await request(app).get("/api/auth/me").set("Cookie", `token=${legacy}`).expect(401);
  });

  it("rejects the token of a deleted account everywhere, not just on /me", async () => {
    const { laptop, phone } = await twoDevices();
    await laptop.delete("/api/auth/me").send({ currentPassword: creds.password }).expect(200);
    await phone.get("/api/vendor/bookmarks").expect(401);
  });

  it("applies a role change at once instead of trusting the role in the token", async () => {
    const admin = request.agent(app);
    await admin.post("/api/auth/register").send(creds).expect(201);
    await User.updateOne({ email: creds.email }, { role: "admin" });
    const session = request.agent(app);
    await session.post("/api/auth/login").send(creds).expect(200);
    await session.get("/api/admin/reports").expect(200);

    await User.updateOne({ email: creds.email }, { role: "vendor" });
    await session.get("/api/admin/reports").expect(403);
  });

  it("treats a signed-out session as anonymous on optional-auth routes", async () => {
    const tor = await Tor.create({ title: "ระบบสารบรรณ", pipelineStatus: "enriched" });
    const { laptop, phone } = await twoDevices();
    await phone.put(`/api/vendor/hidden-tors/${tor._id}`).expect(204);
    expect((await phone.get("/api/tors")).body.totalCount).toBe(0);

    await laptop.post("/api/auth/logout-others").expect(200);
    // the phone's stale cookie no longer identifies the vendor, so nothing is filtered
    expect((await phone.get("/api/tors").expect(200)).body.totalCount).toBe(1);
  });

  it("does not leak the token version in account JSON", async () => {
    const { laptop } = await twoDevices();
    const res = await laptop.get("/api/auth/me").expect(200);
    expect(res.body.user).not.toHaveProperty("tokenVersion");
  });
});

describe("GET /api/auth/sessions", () => {
  it("lists each signed-in device with the current one flagged", async () => {
    const { laptop } = await twoDevices();
    const { data } = (await laptop.get("/api/auth/sessions").expect(200)).body;

    expect(data).toHaveLength(2);
    const current = data.find((s: { current: boolean }) => s.current);
    const other = data.find((s: { current: boolean }) => !s.current);
    expect(current).toMatchObject({ active: true, method: "password", device: { type: "desktop", browser: "Safari", os: "macOS" } });
    expect(other.device).toEqual({ type: "mobile", browser: "Chrome", os: "iOS" });
    expect(current).not.toHaveProperty("userAgent");
  });

  it("only shows the caller's own sessions", async () => {
    await twoDevices();
    const stranger = request.agent(app);
    await stranger.post("/api/auth/register").send({ email: "other@test.com", password: "secret123" }).expect(201);
    expect((await stranger.get("/api/auth/sessions")).body.data).toHaveLength(1);
  });
});

describe("DELETE /api/auth/sessions/:id", () => {
  it("signs out just that device", async () => {
    const { laptop, phone } = await twoDevices();
    const { data } = (await laptop.get("/api/auth/sessions")).body;
    const phoneSession = data.find((s: { current: boolean }) => !s.current);

    await laptop.delete(`/api/auth/sessions/${phoneSession.id}`).expect(204);
    await phone.get("/api/auth/me").expect(401);
    await laptop.get("/api/auth/me").expect(200);
    expect((await laptop.get("/api/auth/sessions")).body.data).toHaveLength(1);
  });

  it("revoking the current session signs this device out", async () => {
    const { laptop } = await twoDevices();
    const mine = (await laptop.get("/api/auth/sessions")).body.data.find((s: { current: boolean }) => s.current);
    await laptop.delete(`/api/auth/sessions/${mine.id}`).expect(204);
    await laptop.get("/api/auth/me").expect(401);
  });

  it("will not touch another user's session", async () => {
    const { laptop } = await twoDevices();
    const stranger = request.agent(app);
    await stranger.post("/api/auth/register").send({ email: "other@test.com", password: "secret123" }).expect(201);
    const theirs = (await stranger.get("/api/auth/sessions")).body.data[0];

    await laptop.delete(`/api/auth/sessions/${theirs.id}`).expect(404);
    await stranger.get("/api/auth/me").expect(200);
  });

  it("400s for a malformed id", async () => {
    const { laptop } = await twoDevices();
    await laptop.delete("/api/auth/sessions/nope").expect(400);
  });
});

describe("session rows follow sign-in and sign-out", () => {
  it("logout removes this device from the list", async () => {
    const { laptop, phone } = await twoDevices();
    await phone.post("/api/auth/logout").expect(200);
    expect((await laptop.get("/api/auth/sessions")).body.data).toHaveLength(1);
  });

  it("log out others and password change leave only this device", async () => {
    const { laptop } = await twoDevices();
    await laptop.post("/api/auth/logout-others").expect(200);
    expect((await laptop.get("/api/auth/sessions")).body.data).toHaveLength(1);

    const phone = request.agent(app);
    await phone.post("/api/auth/login").send(creds).expect(200);
    await laptop.put("/api/auth/password").send({ currentPassword: creds.password, newPassword: "newsecret1" }).expect(200);
    const left = (await laptop.get("/api/auth/sessions")).body.data;
    expect(left).toHaveLength(1);
    expect(left[0].current).toBe(true);
  });

  it("deleting the account deletes its sessions", async () => {
    const { laptop } = await twoDevices();
    await laptop.delete("/api/auth/me").send({ currentPassword: creds.password }).expect(200);
    expect(await Session.countDocuments({})).toBe(0);
  });

  it("upgrades a pre-session cookie on its next signed-in request, without signing it out", async () => {
    const laptop = request.agent(app);
    await laptop.post("/api/auth/register").send(creds).expect(201);
    const user = (await User.findOne({ email: creds.email }))!;
    const legacy = jwt.sign({ role: "vendor", tv: 0 }, "test-secret", { subject: String(user._id), expiresIn: "7d" });

    const res = await request(app).get("/api/auth/me").set("Cookie", `token=${legacy}`).expect(200);
    const upgraded = String(res.headers["set-cookie"]).match(/token=([^;]+)/)![1]!;
    expect((jwt.decode(upgraded) as { sid?: string }).sid).toBeDefined();
    expect(await Session.countDocuments({ userId: user._id })).toBe(2);
  });

  it("does not mint sessions from optional-auth reads of a legacy cookie", async () => {
    const laptop = request.agent(app);
    await laptop.post("/api/auth/register").send(creds).expect(201);
    const user = (await User.findOne({ email: creds.email }))!;
    const legacy = jwt.sign({ role: "vendor", tv: 0 }, "test-secret", { subject: String(user._id), expiresIn: "7d" });

    await request(app).get("/api/tors").set("Cookie", `token=${legacy}`).expect(200);
    expect(await Session.countDocuments({ userId: user._id })).toBe(1);
  });

  it("rejects a token whose session row is gone (e.g. expired by TTL)", async () => {
    const { laptop } = await twoDevices();
    await Session.deleteMany({});
    await laptop.get("/api/auth/me").expect(401);
  });
});

describe("parseUserAgent", () => {
  it.each([
    [MAC_SAFARI, { type: "desktop", browser: "Safari", os: "macOS" }],
    [IPHONE_CHROME, { type: "mobile", browser: "Chrome", os: "iOS" }],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0",
      { type: "desktop", browser: "Edge", os: "Windows" },
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
      { type: "mobile", browser: "Samsung Internet", os: "Android" },
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      { type: "tablet", browser: "Safari", os: "iPadOS" },
    ],
    ["", { type: "desktop", browser: null, os: null }],
  ])("%s", (ua, expected) => {
    expect(parseUserAgent(ua)).toEqual(expected);
  });
});
