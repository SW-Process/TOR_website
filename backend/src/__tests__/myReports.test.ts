import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { ErrorReport, Tor, User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([ErrorReport.deleteMany({}), Tor.deleteMany({}), User.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentFor(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  return agent;
}

async function seedTor(overrides: Record<string, unknown> = {}) {
  const tor = await Tor.create({
    title: "ระบบสารบรรณ",
    agency: "สำนักการแพทย์",
    projectCode: "69079331703",
    pipelineStatus: "enriched",
    ...overrides,
  });
  return String(tor._id);
}

describe("GET /api/auth/reports", () => {
  it("requires a session", async () => {
    await request(app).get("/api/auth/reports").expect(401);
  });

  it("lists only the caller's reports, newest first, with their TOR", async () => {
    const torId = await seedTor();
    const me = await agentFor("me@test.com");
    const other = await agentFor("other@test.com");

    await me.post(`/api/tors/${torId}/report`).send({ description: "งบประมาณไม่ตรง" }).expect(201);
    await me.post(`/api/tors/${torId}/report`).send({ description: "วันปิดรับผิด" }).expect(201);
    await other.post(`/api/tors/${torId}/report`).send({ description: "ของคนอื่น" }).expect(201);
    await request(app).post(`/api/tors/${torId}/report`).send({ description: "ไม่ระบุตัวตน" }).expect(201);

    const res = await me.get("/api/auth/reports").expect(200);
    expect(res.body.data.map((r: { description: string }) => r.description)).toEqual(["วันปิดรับผิด", "งบประมาณไม่ตรง"]);
    expect(res.body.data[0]).toMatchObject({
      status: "open",
      resolution: null,
      tor: { id: torId, title: "ระบบสารบรรณ", projectCode: "69079331703" },
    });
  });

  it("shows the admin's note once resolved, but not who resolved it", async () => {
    const torId = await seedTor();
    const me = await agentFor("me@test.com");
    await me.post(`/api/tors/${torId}/report`).send({ description: "งบประมาณไม่ตรง" }).expect(201);
    const admin = await User.create({ email: "admin@test.com", role: "admin" });
    await ErrorReport.updateOne(
      {},
      { status: "resolved", resolutionNote: "แก้งบแล้ว", resolvedBy: admin._id, resolvedAt: new Date() }
    );

    const [row] = (await me.get("/api/auth/reports").expect(200)).body.data;
    expect(row.status).toBe("resolved");
    expect(row.resolution.note).toBe("แก้งบแล้ว");
    expect(row.resolution).not.toHaveProperty("resolvedBy");
    expect(JSON.stringify(row)).not.toContain(String(admin._id));
  });

  it("returns tor: null for a TOR that is no longer public", async () => {
    const torId = await seedTor();
    const me = await agentFor("me@test.com");
    await me.post(`/api/tors/${torId}/report`).send({ description: "งบประมาณไม่ตรง" }).expect(201);
    await Tor.updateOne({ _id: torId }, { pipelineStatus: "pending" });

    const [row] = (await me.get("/api/auth/reports").expect(200)).body.data;
    expect(row.tor).toBeNull();
    expect(row.description).toBe("งบประมาณไม่ตรง");
  });
});
