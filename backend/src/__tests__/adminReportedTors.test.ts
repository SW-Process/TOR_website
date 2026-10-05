import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { ErrorReport, Tor, User } from "../models";
import type { Types } from "mongoose";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), User.deleteMany({}), ErrorReport.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentWithRole(role: "admin" | "vendor") {
  const email = `${role}@test.com`;
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  await User.updateOne({ email }, { role });
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  return agent;
}

/** A report whose createdAt is `daysAgo` days in the past, so ordering is deterministic. */
async function report(tor: { _id: Types.ObjectId }, status: "open" | "resolved", daysAgo: number, description: string) {
  const r = await ErrorReport.create({ torId: tor._id, status, description, reporterEmail: "anon@example.com" });
  await ErrorReport.collection.updateOne(
    { _id: r._id },
    { $set: { createdAt: new Date(Date.now() - daysAgo * 86_400_000) } }
  );
  return r;
}

describe("GET /api/admin/tors/reported", () => {
  it("is admin-only", async () => {
    const vendor = await agentWithRole("vendor");
    expect((await vendor.get("/api/admin/tors/reported")).status).toBe(403);
  });

  it("lists each TOR once with its open count and newest open report, most recent first", async () => {
    const [older, newer, resolvedOnly] = await Tor.create([
      { title: "ระบบเก่า", agency: "สำนักอนามัย", pipelineStatus: "enriched" },
      { title: "ระบบใหม่", agency: "สำนักการแพทย์", pipelineStatus: "enriched" },
      { title: "แก้ไปแล้ว", agency: "สำนักสิ่งแวดล้อม", pipelineStatus: "enriched" },
    ]);
    await report(older!, "open", 10, "งบประมาณผิด");
    await report(older!, "open", 3, "ระยะเวลาผิด");
    await report(older!, "resolved", 30, "เคยแก้แล้ว");
    await report(newer!, "open", 1, "ชื่อหน่วยงานผิด");
    await report(resolvedOnly!, "resolved", 2, "แก้ไปแล้ว");

    const admin = await agentWithRole("admin");
    const res = await admin.get("/api/admin/tors/reported");
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(2);
    expect(res.body.data.map((row: { tor: { title: string } }) => row.tor.title)).toEqual(["ระบบใหม่", "ระบบเก่า"]);

    const [newest, older2] = res.body.data;
    expect(newest.openReportCount).toBe(1);
    expect(newest.latestReport.description).toBe("ชื่อหน่วยงานผิด");
    expect(newest.latestReport.reporterEmail).toBe("anon@example.com");
    expect(older2.openReportCount).toBe(2);
    expect(older2.latestReport.description).toBe("ระยะเวลาผิด");
    expect(older2.tor.isPublic).toBe(true);
  });

  it("flags a TOR that is no longer public", async () => {
    const hidden = await Tor.create({ title: "ถูกซ่อน", pipelineStatus: "rejected" });
    await report(hidden, "open", 1, "ข้อมูลไม่ถูกต้อง");

    const admin = await agentWithRole("admin");
    const res = await admin.get("/api/admin/tors/reported");
    expect(res.body.data[0].tor.isPublic).toBe(false);
  });

  it("pages the queue and reports whether there is a next page", async () => {
    const tors = await Tor.create([
      { title: "หนึ่ง", pipelineStatus: "enriched" },
      { title: "สอง", pipelineStatus: "enriched" },
      { title: "สาม", pipelineStatus: "enriched" },
    ]);
    for (const [i, t] of tors.entries()) await report(t, "open", i + 1, `รายงาน ${i}`);

    const admin = await agentWithRole("admin");
    const first = await admin.get("/api/admin/tors/reported?pageSize=2");
    expect(first.body).toMatchObject({ totalCount: 3, page: 1, pageSize: 2, hasNextPage: true });
    expect(first.body.data).toHaveLength(2);

    const second = await admin.get("/api/admin/tors/reported?pageSize=2&page=2");
    expect(second.body).toMatchObject({ totalCount: 3, page: 2, hasNextPage: false });
    expect(second.body.data).toHaveLength(1);
  });

  it("returns an empty queue when nothing is open", async () => {
    const admin = await agentWithRole("admin");
    const res = await admin.get("/api/admin/tors/reported");
    expect(res.body).toMatchObject({ data: [], totalCount: 0, hasNextPage: false });
  });

  it("rejects an invalid page size", async () => {
    const admin = await agentWithRole("admin");
    expect((await admin.get("/api/admin/tors/reported?pageSize=500")).status).toBe(400);
  });
});
