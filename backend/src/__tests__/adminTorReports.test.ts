import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { ErrorReport, SystemLog, Tor, User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), User.deleteMany({}), ErrorReport.deleteMany({}), SystemLog.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentWithRole(role: "admin" | "vendor") {
  const email = `${role}@test.com`;
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "plum-orchard-ladder-17" });
  await User.updateOne({ email }, { role });
  await agent.post("/api/auth/login").send({ email, password: "plum-orchard-ladder-17" });
  return agent;
}

async function seed() {
  const [tor, other, hidden] = await Tor.create([
    { title: "ระบบสารบรรณ", agency: "สำนักการแพทย์", budget: 9_000_000, pipelineStatus: "enriched" },
    { title: "เว็บไซต์หน่วยงาน", agency: "สำนักอนามัย", pipelineStatus: "enriched" },
    { title: "ซ่อนอยู่", pipelineStatus: "rejected" },
  ]);
  const mk = (t: typeof tor, status: "open" | "resolved", description: string) =>
    ErrorReport.create({ torId: t!._id, status, description, reporterEmail: "anon@example.com" });
  await mk(tor, "open", "งบผิด");
  await mk(tor, "open", "วันที่ผิด");
  await mk(tor, "resolved", "เคยแก้แล้ว");
  await mk(other, "open", "ของ TOR อื่น");
  return { tor: String(tor!._id), other: String(other!._id), hidden: String(hidden!._id) };
}

describe("GET /api/admin/tors/:id", () => {
  it("is admin-only", async () => {
    const { tor } = await seed();
    expect((await request(app).get(`/api/admin/tors/${tor}`)).status).toBe(401);
    const vendor = await agentWithRole("vendor");
    expect((await vendor.get(`/api/admin/tors/${tor}`)).status).toBe(403);
  });

  it("returns one public TOR in the admin row shape", async () => {
    const { tor } = await seed();
    const admin = await agentWithRole("admin");
    const res = await admin.get(`/api/admin/tors/${tor}`);
    expect(res.status).toBe(200);
    expect(res.body.tor).toMatchObject({ _id: tor, title: "ระบบสารบรรณ", budget: 9_000_000 });
    expect(res.body.tor).toHaveProperty("fairnessFlags");
  });

  it("answers 404 for a TOR that is not public and 400 for a bad id", async () => {
    const { hidden } = await seed();
    const admin = await agentWithRole("admin");
    expect((await admin.get(`/api/admin/tors/${hidden}`)).status).toBe(404);
    expect((await admin.get("/api/admin/tors/not-an-id")).status).toBe(400);
  });
});

describe("GET /api/admin/reports?torId=", () => {
  it("keeps only that TOR's reports", async () => {
    const { tor } = await seed();
    const admin = await agentWithRole("admin");
    const res = await admin.get(`/api/admin/reports?status=open&torId=${tor}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { description: string }) => r.description).sort()).toEqual(["งบผิด", "วันที่ผิด"]);
    expect(res.body.totalCount).toBe(2);
  });

  it("rejects a malformed torId", async () => {
    const admin = await agentWithRole("admin");
    expect((await admin.get("/api/admin/reports?torId=nope")).status).toBe(400);
  });
});

describe("PATCH /api/admin/tors/:id — resolveReports", () => {
  it("resolves every open report of that TOR with the note and the admin, leaving others alone", async () => {
    const { tor, other } = await seed();
    const admin = await agentWithRole("admin");
    const adminUser = await User.findOne({ email: "admin@test.com" });

    const res = await admin
      .patch(`/api/admin/tors/${tor}`)
      .send({ budget: 900_000, resolveReports: true, resolutionNote: "  แก้งบตามเอกสาร  " });
    expect(res.status).toBe(200);

    const mine = await ErrorReport.find({ torId: tor }).lean();
    expect(mine.map((r) => r.status)).toEqual(["resolved", "resolved", "resolved"]);
    const justResolved = mine.filter((r) => r.resolutionNote);
    expect(justResolved).toHaveLength(2);
    expect(justResolved[0]).toMatchObject({ resolutionNote: "แก้งบตามเอกสาร" });
    expect(String(justResolved[0]!.resolvedBy)).toBe(String(adminUser!._id));
    // The report that was already resolved keeps its history.
    expect(mine.find((r) => r.description === "เคยแก้แล้ว")!.resolutionNote).toBeUndefined();

    expect((await ErrorReport.findOne({ torId: other }).lean())!.status).toBe("open");

    const queue = await admin.get("/api/admin/tors/reported");
    expect(queue.body.data.map((r: { tor: { id: string } }) => r.tor.id)).toEqual([other]);
  });

  it("resolves reports even when no field changed, and logs how many", async () => {
    const { tor } = await seed();
    const admin = await agentWithRole("admin");
    await SystemLog.deleteMany({});
    await admin.patch(`/api/admin/tors/${tor}`).send({ resolveReports: true });
    expect(await ErrorReport.countDocuments({ torId: tor, status: "open" })).toBe(0);
    const log = await SystemLog.findOne({ component: "admin.tor-edit" }).lean();
    expect(log?.context).toMatchObject({ torId: tor, changes: { "reports.open": { from: 2, to: 0 } } });
  });

  it("does not touch reports unless asked, and a resolutionNote alone is rejected", async () => {
    const { tor } = await seed();
    const admin = await agentWithRole("admin");
    await admin.patch(`/api/admin/tors/${tor}`).send({ budget: 1_000 });
    expect(await ErrorReport.countDocuments({ torId: tor, status: "open" })).toBe(2);
    expect((await admin.patch(`/api/admin/tors/${tor}`).send({ resolutionNote: "x" })).status).toBe(400);
  });
});
