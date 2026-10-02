import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { ErrorReport, Tor, User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([
    ErrorReport.deleteMany({}),
    Tor.deleteMany({}),
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentWithRole(email: string, role: "admin" | "vendor") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  await User.updateOne({ email }, { role });
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  return agent;
}

async function seed() {
  const tor = await Tor.create({
    title: "ระบบสารบรรณ",
    agency: "สำนักการแพทย์",
    projectCode: "69049037828",
    pipelineStatus: "enriched",
  });
  const torId = String(tor._id);

  const vendor = await agentWithRole("vendor@test.com", "vendor");
  await vendor.put("/api/vendor/profile").send({ companyName: "บริษัท ตัวอย่าง จำกัด" });
  await vendor.post(`/api/tors/${torId}/report`).send({ description: "งบประมาณในระบบไม่ตรงกับเอกสาร PDF" });

  await request(app)
    .post(`/api/tors/${torId}/report`)
    .send({ description: "วันปิดรับน่าจะผิดปี", reporterEmail: "anon@example.com" });

  return { torId };
}

describe("/api/admin/reports", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/reports")).status).toBe(401);
    const vendor = await agentWithRole("v2@test.com", "vendor");
    expect((await vendor.get("/api/admin/reports")).status).toBe(403);
  });

  it("lists open reports newest first with reporter profile and TOR", async () => {
    const { torId } = await seed();
    const admin = await agentWithRole("admin@test.com", "admin");

    const res = await admin.get("/api/admin/reports");
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ open: 2, resolved: 0 });
    expect(res.body.data).toHaveLength(2);

    const [anon, fromVendor] = res.body.data;
    expect(anon).toMatchObject({
      description: "วันปิดรับน่าจะผิดปี",
      reporter: null,
      reporterEmail: "anon@example.com",
      tor: { id: torId, title: "ระบบสารบรรณ", projectCode: "69049037828", isPublic: true },
    });
    expect(fromVendor).toMatchObject({
      description: "งบประมาณในระบบไม่ตรงกับเอกสาร PDF",
      reporterEmail: null,
      reporter: {
        email: "vendor@test.com",
        displayName: "บริษัท ตัวอย่าง จำกัด",
        companyName: "บริษัท ตัวอย่าง จำกัด",
        role: "vendor",
        avatarUrl: null,
      },
    });
  });

  it("resolves with a note, filters by status, and reopens", async () => {
    await seed();
    const admin = await agentWithRole("admin@test.com", "admin");
    const [first] = (await admin.get("/api/admin/reports")).body.data;

    const resolved = await admin
      .patch(`/api/admin/reports/${first.id}`)
      .send({ status: "resolved", resolutionNote: "แก้วันปิดรับแล้ว" });
    expect(resolved.status).toBe(200);

    const done = await admin.get("/api/admin/reports?status=resolved");
    expect(done.body.counts).toEqual({ open: 1, resolved: 1 });
    expect(done.body.data[0].resolution).toMatchObject({
      note: "แก้วันปิดรับแล้ว",
      resolvedBy: { email: "admin@test.com", role: "admin" },
    });

    await admin.patch(`/api/admin/reports/${first.id}`).send({ status: "open" });
    const reopened = await ErrorReport.findById(first.id).lean();
    expect(reopened).toMatchObject({ status: "open", resolvedBy: null, resolvedAt: null });
    expect(reopened!.resolutionNote).toBeUndefined();

    expect((await admin.get("/api/admin/reports?status=all")).body.totalCount).toBe(2);
  });

  it("rejects bad input", async () => {
    const admin = await agentWithRole("admin@test.com", "admin");
    expect((await admin.get("/api/admin/reports?status=bogus")).status).toBe(400);
    expect((await admin.patch("/api/admin/reports/not-an-id").send({ status: "resolved" })).status).toBe(400);
    const missing = new mongoose.Types.ObjectId();
    expect((await admin.patch(`/api/admin/reports/${missing}`).send({ status: "resolved" })).status).toBe(404);
    expect((await admin.patch(`/api/admin/reports/${missing}`).send({ status: "done" })).status).toBe(400);
  });
});
