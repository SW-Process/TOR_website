import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { IngestionRun, Tor, User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), User.deleteMany({}), IngestionRun.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function adminAgent() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" });
  await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
  await agent.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
  return agent;
}

const DAY = 86_400_000;

describe("GET /api/admin/stats", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/stats")).status).toBe(401);
  });

  it("returns empty-safe numbers with no data", async () => {
    const res = await (await adminAgent()).get("/api/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      createdToday: 0,
      createdYesterday: 0,
      flaggedCount: 0,
      lastDiscovery: null,
      lastEnrichment: null,
      runs30d: { finished: 0, succeeded: 0 },
    });
    expect(res.body.monthly).toHaveLength(5);
    expect(res.body.monthly.every((m: { count: number }) => m.count === 0)).toBe(true);
  });

  it("counts today's TORs, open signals, runs, and TORs per month", async () => {
    const now = Date.now();
    await Tor.create([
      { title: "วันนี้ 1", pipelineStatus: "enriched", fairnessFlags: [{ field: "budget", message: "ควรตรวจสอบ", status: "open" }] },
      { title: "วันนี้ 2", pipelineStatus: "pending" },
      { title: "ตรวจแล้ว", pipelineStatus: "enriched", fairnessFlags: [{ field: "budget", message: "ควรตรวจสอบ", status: "acknowledged" }] },
    ]);
    // Backdate one row by two months to land in an earlier bucket.
    await Tor.collection.updateOne({ title: "ตรวจแล้ว" }, { $set: { createdAt: new Date(now - 62 * DAY) } });

    await IngestionRun.create([
      { trigger: "manual", phase: "discovery", status: "success", startedAt: new Date(now - DAY) },
      { trigger: "manual", phase: "discovery", status: "failed", startedAt: new Date(now - 2 * DAY) },
      { trigger: "scheduled", phase: "enrichment", status: "partial", startedAt: new Date(now - 3 * DAY) },
      { trigger: "manual", phase: "discovery", status: "success", startedAt: new Date(now - 40 * DAY) },
    ]);

    const res = await (await adminAgent()).get("/api/admin/stats?months=8");
    expect(res.body.createdToday).toBe(2);
    expect(res.body.flaggedCount).toBe(1);
    expect(res.body.lastDiscovery.status).toBe("success");
    expect(res.body.lastEnrichment.status).toBe("partial");
    expect(res.body.runs30d).toEqual({ finished: 3, succeeded: 1 });

    expect(res.body.monthly).toHaveLength(8);
    const counts = res.body.monthly.map((m: { count: number }) => m.count);
    expect(counts.at(-1)).toBe(2);
    expect(counts.reduce((a: number, b: number) => a + b, 0)).toBe(3);
  });
});
