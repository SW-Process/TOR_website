import mongoose from "mongoose";
import request from "supertest";
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
  await Promise.all([Tor.deleteMany({}), User.deleteMany({}), VendorProfile.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function vendorAgent(email = "vendor@test.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  return agent;
}

async function seedTors() {
  await Tor.create([
    {
      title: "เว็บแอปพลิเคชันสารบรรณ",
      pipelineStatus: "enriched",
      status: "open",
      category: "web-application",
      technologyStack: ["React", "Node.js"],
      budget: 500_000,
    },
    {
      title: "ระบบกล้องวงจรปิด",
      pipelineStatus: "enriched",
      status: "open",
      category: "cctv-its",
      technologyStack: ["C++"],
      budget: 9_000_000,
    },
    { title: "ปิดรับแล้ว", pipelineStatus: "enriched", status: "closed", category: "web-application" },
    { title: "ยังไม่ enrich", pipelineStatus: "pending", category: "web-application" },
  ]);
}

describe("GET /api/vendor/matches", () => {
  it("401s without a session, 403s for an admin", async () => {
    expect((await request(app).get("/api/vendor/matches")).status).toBe(401);

    const adminAgentReq = request.agent(app);
    await adminAgentReq.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" });
    await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
    await adminAgentReq.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
    expect((await adminAgentReq.get("/api/vendor/matches")).status).toBe(403);
  });

  it("ranks open, enriched TORs by match score against the caller's profile", async () => {
    await seedTors();
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({
      interestedCategories: ["web-application"],
      technologyStack: ["React", "Node.js"],
      budgetMin: 100_000,
      budgetMax: 1_000_000,
    });

    const res = await agent.get("/api/vendor/matches");
    expect(res.status).toBe(200);
    // only the two enriched, non-closed TORs are candidates
    expect(res.body.totalCount).toBe(2);
    expect(res.body.data[0].tor.title).toBe("เว็บแอปพลิเคชันสารบรรณ");
    expect(res.body.data[0].matchScore).toBe(100);
    expect(res.body.data[0].matchedCriteria.sort()).toEqual(["budgetRange", "category", "technologyStack"]);
    expect(res.body.data[1].tor.title).toBe("ระบบกล้องวงจรปิด");
    expect(res.body.data[1].matchScore).toBeLessThan(res.body.data[0].matchScore);
  });

  it("scores 0 for a vendor with no profile filled in yet", async () => {
    await seedTors();
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/matches");
    expect(res.status).toBe(200);
    expect(res.body.data.every((m: { matchScore: number }) => m.matchScore === 0)).toBe(true);
  });
});
