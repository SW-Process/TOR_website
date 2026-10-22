import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Session, User } from "../models";

let mongod: MongoMemoryServer;
const PASSWORD = "plum-orchard-ladder-17";

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function signIn(email: string, role: "admin" | "vendor" = "vendor") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: PASSWORD }).expect(201);
  if (role === "admin") {
    await User.updateOne({ email }, { role });
    await agent.post("/api/auth/login").send({ email, password: PASSWORD }).expect(200);
  }
  return agent;
}

describe("admins ending sessions (ASVS 7.4.5)", () => {
  it("finds users by email with their signed-in device count", async () => {
    const admin = await signIn("admin@test.com", "admin");
    await signIn("vendor@test.com");
    const res = await admin.get("/api/admin/users").query({ email: "vendor" }).expect(200);
    expect(res.body.data).toEqual([expect.objectContaining({ email: "vendor@test.com", role: "vendor", sessions: 1 })]);
  });

  it("signs one user out everywhere", async () => {
    const admin = await signIn("admin@test.com", "admin");
    const vendor = await signIn("vendor@test.com");
    const id = String((await User.findOne({ email: "vendor@test.com" }))!._id);

    expect((await admin.post(`/api/admin/users/${id}/sessions/revoke`).expect(200)).body.ended).toBe(1);
    await vendor.get("/api/auth/me").expect(401);
    await admin.get("/api/auth/me").expect(200);
  });

  it("signs everyone out except the admin doing it", async () => {
    const admin = await signIn("admin@test.com", "admin");
    const a = await signIn("a@test.com");
    const b = await signIn("b@test.com");

    await admin.post("/api/admin/sessions/revoke-all").expect(200);
    await a.get("/api/auth/me").expect(401);
    await b.get("/api/auth/me").expect(401);
    await admin.get("/api/auth/me").expect(200);
  });

  it("asks for re-authentication before signing everyone out", async () => {
    const admin = await signIn("admin@test.com", "admin");
    await Session.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    expect((await admin.post("/api/admin/sessions/revoke-all").expect(401)).body.code).toBe("reauth_required");
  });

  it("is admin-only", async () => {
    const vendor = await signIn("vendor@test.com");
    await vendor.post("/api/admin/sessions/revoke-all").expect(403);
    await vendor.get("/api/admin/users").query({ email: "vendor" }).expect(403);
  });
});
