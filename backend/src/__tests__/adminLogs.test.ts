import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { SystemLog, User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([SystemLog.deleteMany({}), User.deleteMany({})]);
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

async function seed() {
  const t = (min: number) => new Date(Date.UTC(2026, 8, 30, 12, min));
  await SystemLog.create([
    { source: "ingestion", component: "runIngestion", severity: "info", message: "run started", timestamp: t(0) },
    { source: "ingestion", component: "fetchAndStoreTorPdf", severity: "error", message: "PDF download failed (a+b)", context: { torId: "x" }, timestamp: t(1) },
    { source: "ai-pipeline", component: "classifier.gemini", severity: "warning", message: "low confidence", timestamp: t(2) },
  ]);
}

describe("GET /api/admin/logs", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/logs")).status).toBe(401);
  });

  it("lists newest first with per-severity counts and context", async () => {
    await seed();
    const res = await (await adminAgent()).get("/api/admin/logs");
    expect(res.status).toBe(200);
    expect(res.body.data.map((l: { message: string }) => l.message)).toEqual([
      "low confidence",
      "PDF download failed (a+b)",
      "run started",
    ]);
    expect(res.body.counts).toEqual({ info: 1, warning: 1, error: 1 });
    expect(res.body.data[1].context).toEqual({ torId: "x" });
  });

  it("filters by severity, source, and a literal search over component + message", async () => {
    await seed();
    const admin = await adminAgent();
    const msgs = async (qs: string) =>
      (await admin.get(`/api/admin/logs?${qs}`)).body.data.map((l: { message: string }) => l.message);

    expect(await msgs("severity=error")).toEqual(["PDF download failed (a+b)"]);
    expect(await msgs("source=ai-pipeline")).toEqual(["low confidence"]);
    expect(await msgs("q=gemini")).toEqual(["low confidence"]);
    expect(await msgs("q=" + encodeURIComponent("(a+b)"))).toEqual(["PDF download failed (a+b)"]);

    // Counts ignore the severity tab but respect search/source.
    const res = await admin.get("/api/admin/logs?severity=error&source=ingestion");
    expect(res.body.counts).toEqual({ info: 1, warning: 0, error: 1 });

    expect((await admin.get("/api/admin/logs?severity=debug")).status).toBe(400);
  });
});
