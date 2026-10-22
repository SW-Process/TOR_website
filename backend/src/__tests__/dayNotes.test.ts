import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), VendorProfile.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function vendor(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "vendor-test-pass-17" }).expect(201);
  return agent;
}

describe("/api/vendor/day-notes (ASVS 14.3.1)", () => {
  it("needs a session", async () => {
    await request(app).get("/api/vendor/day-notes").expect(401);
  });

  it("sets, reads and clears a note", async () => {
    const agent = await vendor("a@test.com");
    await agent.put("/api/vendor/day-notes/2026-11-20").send({ note: "ยื่นซอง 10:00" }).expect(204);
    expect((await agent.get("/api/vendor/day-notes").expect(200)).body.notes).toEqual({ "2026-11-20": "ยื่นซอง 10:00" });

    await agent.put("/api/vendor/day-notes/2026-11-20").send({ note: "   " }).expect(204);
    expect((await agent.get("/api/vendor/day-notes").expect(200)).body.notes).toEqual({});
  });

  it("keeps each vendor's notes to themselves", async () => {
    const a = await vendor("a@test.com");
    const b = await vendor("b@test.com");
    await a.put("/api/vendor/day-notes/2026-11-20").send({ note: "secret plan" }).expect(204);
    expect((await b.get("/api/vendor/day-notes").expect(200)).body.notes).toEqual({});
  });

  it("rejects a malformed date key", async () => {
    const agent = await vendor("a@test.com");
    await agent.put("/api/vendor/day-notes/2026-11-20.x").send({ note: "x" }).expect(400);
    await agent.put("/api/vendor/day-notes/$where").send({ note: "x" }).expect(400);
  });

  it("rejects a note over 2,000 characters", async () => {
    const agent = await vendor("a@test.com");
    await agent.put("/api/vendor/day-notes/2026-11-20").send({ note: "x".repeat(2001) }).expect(400);
  });
});
