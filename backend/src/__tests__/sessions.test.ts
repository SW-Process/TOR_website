import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Session, Tor, User, VendorProfile } from "../models";
import { parseUserAgent } from "../utils/userAgent";
import { parseTrustProxy } from "../utils/trustProxy";

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

const creds = { email: "vendor@test.com", password: "vendor-test-pass-17" };

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
  it("refuses a token without a session id, or one that is not a session token (ASVS 9.2.2, 9.2.3)", async () => {
    const laptop = request.agent(app);
    await laptop.post("/api/auth/register").send(creds).expect(201);
    const user = (await User.findOne({ email: creds.email }))!;
    const sid = String((await Session.findOne({ userId: user._id }))!._id);
    const sign = (claims: object, opts: jwt.SignOptions = {}) =>
      jwt.sign({ role: "vendor", tv: 0, ...claims }, "test-secret", { subject: String(user._id), expiresIn: "1h", ...opts });
    const ok = { issuer: "tor-checker-api", audience: "tor-checker-session" };

    // the pre-session cookie format, with no sid, issuer or audience
    await request(app).get("/api/auth/me").set("Cookie", `token=${sign({})}`).expect(401);
    // right claims but meant for something else
    await request(app).get("/api/auth/me").set("Cookie", `token=${sign({ sid, use: "mfa" }, ok)}`).expect(401);
    // wrong audience
    await request(app).get("/api/auth/me").set("Cookie", `token=${sign({ sid, use: "session" }, { ...ok, audience: "x" })}`).expect(401);
    // the real thing
    await request(app).get("/api/auth/me").set("Cookie", `token=${sign({ sid, use: "session" }, ok)}`).expect(200);
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
    await stranger.post("/api/auth/register").send({ email: "other@test.com", password: "vendor-test-pass-17" }).expect(201);
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
    await stranger.post("/api/auth/register").send({ email: "other@test.com", password: "vendor-test-pass-17" }).expect(201);
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

describe("session lifetime (ASVS 7.3)", () => {
  it("ends a session after 30 minutes without a request, and deletes it", async () => {
    const { laptop, phone } = await twoDevices();
    const mine = (await laptop.get("/api/auth/sessions")).body.data.find((s: { current: boolean }) => s.current);
    await Session.updateOne({ _id: mine.id }, { lastSeenAt: new Date(Date.now() - 31 * 60_000) });

    await laptop.get("/api/auth/me").expect(401);
    expect(await Session.exists({ _id: mine.id })).toBeNull();
    await phone.get("/api/auth/me").expect(200); // other devices are unaffected
  });

  it("keeps an active session alive", async () => {
    const { laptop } = await twoDevices();
    const mine = (await laptop.get("/api/auth/sessions")).body.data.find((s: { current: boolean }) => s.current);
    await Session.updateOne({ _id: mine.id }, { lastSeenAt: new Date(Date.now() - 20 * 60_000) });
    await laptop.get("/api/auth/me").expect(200);
    const row = await Session.findById(mine.id).lean();
    expect(Date.now() - row!.lastSeenAt.getTime()).toBeLessThan(5_000);
  });

  it("does not count background polling as activity", async () => {
    const { laptop } = await twoDevices();
    const mine = (await laptop.get("/api/auth/sessions")).body.data.find((s: { current: boolean }) => s.current);
    const idleSince = new Date(Date.now() - 20 * 60_000);
    await Session.updateOne({ _id: mine.id }, { lastSeenAt: idleSince });
    await laptop.get("/api/auth/me").set("X-Background-Request", "1").expect(200);
    expect((await Session.findById(mine.id).lean())!.lastSeenAt.getTime()).toBe(idleSince.getTime());
  });

  it("ends every session 12 hours after sign-in, however active", async () => {
    const { laptop } = await twoDevices();
    const row = await Session.findOne({}).sort({ createdAt: 1 }).lean();
    expect(Math.abs(row!.expiresAt.getTime() - row!.createdAt.getTime() - 12 * 60 * 60 * 1000)).toBeLessThan(1000);
    const mine = (await laptop.get("/api/auth/sessions")).body.data.find((s: { current: boolean }) => s.current);
    await Session.updateOne({ _id: mine.id }, { expiresAt: new Date(Date.now() - 1000) });
    await laptop.get("/api/auth/me").expect(401);
  });

  it("never extends a session when its cookie is re-issued", async () => {
    const { laptop } = await twoDevices();
    const mine = (await laptop.get("/api/auth/sessions")).body.data.find((s: { current: boolean }) => s.current);
    const end = new Date(Date.now() + 60 * 60_000);
    await Session.updateOne({ _id: mine.id }, { expiresAt: end });
    const res = await laptop.post("/api/auth/logout-others").expect(200);

    expect((await Session.findById(mine.id).lean())!.expiresAt.getTime()).toBe(end.getTime());
    const token = String(res.headers["set-cookie"]).match(/token=([^;]+)/)![1]!;
    const exp = (jwt.decode(token) as { exp: number }).exp * 1000;
    expect(Math.abs(exp - end.getTime())).toBeLessThan(2_000);
  });
});

describe("concurrent sessions (ASVS 7.1.2)", () => {
  it("keeps at most 10 sessions per account, ending the least recently used", async () => {
    const first = request.agent(app);
    await first.post("/api/auth/register").send(creds).expect(201);
    const user = (await User.findOne({ email: creds.email }))!;
    await Session.updateOne({ userId: user._id }, { lastSeenAt: new Date(Date.now() - 10 * 60_000) });
    for (let i = 0; i < 10; i++) await request(app).post("/api/auth/login").send(creds).expect(200);

    expect(await Session.countDocuments({ userId: user._id })).toBe(10);
    await first.get("/api/auth/me").expect(401); // the oldest one went
  });
});

describe("parseTrustProxy", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["  ", undefined],
    ["1", 1],
    ["2", 2],
    ["true", true],
    ["false", false],
    ["loopback, 10.0.0.0/8", "loopback, 10.0.0.0/8"],
  ])("%p → %p", (raw, expected) => {
    expect(parseTrustProxy(raw)).toEqual(expected);
  });
});
