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

async function seedTor() {
  return Tor.create({
    title: "ระบบสารบรรณ",
    agency: "สำนักการแพทย์",
    pipelineStatus: "enriched",
  });
}

async function vendorAgent(email = "vendor@test.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  return agent;
}

describe("POST /api/tors/:id/report", () => {
  it("saves an anonymous report with an optional contact email", async () => {
    const tor = await seedTor();
    const res = await request(app)
      .post(`/api/tors/${tor.id}/report`)
      .send({ description: "งบประมาณในประกาศไม่ตรงกับเอกสารแนบ", reporterEmail: "citizen@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.report.status).toBe("open");

    const saved = await ErrorReport.findOne({ torId: tor._id }).lean();
    expect(saved?.reportedBy).toBeNull();
    expect(saved?.reporterEmail).toBe("citizen@example.com");
    expect(saved?.description).toBe("งบประมาณในประกาศไม่ตรงกับเอกสารแนบ");
  });

  it("attributes the report to a logged-in user and ignores a supplied reporterEmail", async () => {
    const tor = await seedTor();
    const agent = await vendorAgent();
    const user = await User.findOne({ email: "vendor@test.com" }).lean();

    const res = await agent
      .post(`/api/tors/${tor.id}/report`)
      .send({ description: "ชื่อหน่วยงานสะกดผิด", reporterEmail: "someone-else@example.com" });

    expect(res.status).toBe(201);
    const saved = await ErrorReport.findOne({ torId: tor._id }).lean();
    expect(String(saved?.reportedBy)).toBe(String(user!._id));
    expect(saved?.reporterEmail).toBeUndefined();
  });

  it("404s for a TOR that doesn't exist, 400 for a malformed id", async () => {
    const missing = await request(app)
      .post(`/api/tors/${new mongoose.Types.ObjectId()}/report`)
      .send({ description: "รายละเอียดที่ผิดพลาดอย่างน้อยห้าตัวอักษร" });
    expect(missing.status).toBe(404);

    const badId = await request(app)
      .post("/api/tors/not-an-id/report")
      .send({ description: "รายละเอียดที่ผิดพลาดอย่างน้อยห้าตัวอักษร" });
    expect(badId.status).toBe(400);
  });

  it("400s on a missing or too-short description", async () => {
    const tor = await seedTor();
    const empty = await request(app).post(`/api/tors/${tor.id}/report`).send({});
    expect(empty.status).toBe(400);

    const short = await request(app).post(`/api/tors/${tor.id}/report`).send({ description: "สั้น" });
    expect(short.status).toBe(400);
  });

  it("400s on a malformed reporterEmail", async () => {
    const tor = await seedTor();
    const res = await request(app)
      .post(`/api/tors/${tor.id}/report`)
      .send({ description: "รายละเอียดที่ผิดพลาดอย่างน้อยห้าตัวอักษร", reporterEmail: "not-an-email" });
    expect(res.status).toBe(400);
  });
});
