import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Tor, User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Tor.deleteMany({}), VendorProfile.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const creds = { email: "vendor@test.com", password: "secret123" };

/** Two independent "devices" signed in to the same account. */
async function twoDevices() {
  const laptop = request.agent(app);
  await laptop.post("/api/auth/register").send(creds).expect(201);
  const phone = request.agent(app);
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
