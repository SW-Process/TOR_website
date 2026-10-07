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
  it("401s without a session, 200 for an admin", async () => {
    expect((await request(app).get("/api/vendor/matches")).status).toBe(401);

    const adminAgentReq = request.agent(app);
    await adminAgentReq.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" });
    await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
    await adminAgentReq.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
    expect((await adminAgentReq.get("/api/vendor/matches")).status).toBe(200);
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

  // Regression: PUT-ing without budgetMin/budgetMax (as the frontend does when
  // the vendor leaves the budget fields empty) must not save an explicit
  // {min:0,max:0} range — that would apply and penalize every TOR's score.
  it("does not penalize the match score when the budget fields are left empty", async () => {
    await seedTors();
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({
      interestedCategories: ["web-application"],
      technologyStack: ["React", "Node.js"],
      // no budgetMin / budgetMax at all
    });

    const res = await agent.get("/api/vendor/matches");
    expect(res.status).toBe(200);
    const top = res.body.data.find((m: { tor: { title: string } }) => m.tor.title === "เว็บแอปพลิเคชันสารบรรณ");
    expect(top.matchScore).toBe(100);
    expect(top.matchedCriteria.sort()).toEqual(["category", "technologyStack"]);
  });

  it("gives partial technologyStack credit through the API, case-insensitively", async () => {
    await seedTors();
    const agent = await vendorAgent();
    // Covers 1 of the web TOR's 2 required technologies; only this signal is set.
    await agent.put("/api/vendor/profile").send({ technologyStack: ["react"] });

    const res = await agent.get("/api/vendor/matches");
    const web = res.body.data.find((m: { tor: { title: string } }) => m.tor.title === "เว็บแอปพลิเคชันสารบรรณ");
    const cctv = res.body.data.find((m: { tor: { title: string } }) => m.tor.title === "ระบบกล้องวงจรปิด");
    expect(web.matchScore).toBe(50);
    expect(web.matchedCriteria).toEqual(["technologyStack"]);
    expect(cctv.matchScore).toBe(0);
    expect(cctv.matchedCriteria).toEqual([]);
  });

  it("drops technologyStack from the score once the vendor clears it", async () => {
    await seedTors();
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ interestedCategories: ["web-application"], technologyStack: ["C++"] });
    const before = await agent.get("/api/vendor/matches");
    const webBefore = before.body.data.find((m: { tor: { title: string } }) => m.tor.title === "เว็บแอปพลิเคชันสารบรรณ");
    // category 40/40 + stack 0/35 → 53
    expect(webBefore.matchScore).toBe(53);

    await agent.put("/api/vendor/profile").send({ interestedCategories: ["web-application"], technologyStack: [] });
    const after = await agent.get("/api/vendor/matches");
    const webAfter = after.body.data.find((m: { tor: { title: string } }) => m.tor.title === "เว็บแอปพลิเคชันสารบรรณ");
    // stack no longer applicable → rescaled over category only
    expect(webAfter.matchScore).toBe(100);
  });

  it("scores 0 for a vendor with no profile filled in yet", async () => {
    await seedTors();
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/matches");
    expect(res.status).toBe(200);
    expect(res.body.data.every((m: { matchScore: number }) => m.matchScore === 0)).toBe(true);
  });
});

describe("GET /api/vendor/matches — candidates and response shape", () => {
  it("includes closing_soon TORs and excludes every non-enriched pipeline state", async () => {
    await Tor.create([
      { title: "closing", pipelineStatus: "enriched", status: "closing_soon", category: "gis" },
      { title: "processing", pipelineStatus: "processing", status: "open", category: "gis" },
      { title: "rejected", pipelineStatus: "rejected", status: "open", category: "gis" },
      { title: "failed", pipelineStatus: "failed", status: "open", category: "gis" },
    ]);
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/matches");
    expect(res.body.data.map((m: { tor: { title: string } }) => m.tor.title)).toEqual(["closing"]);
  });

  it("returns an empty page when there are no candidate TORs", async () => {
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/matches");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], totalCount: 0, hasNextPage: false });
  });

  it("returns only the projected TOR fields, never pipeline internals", async () => {
    await Tor.create({
      title: "t",
      pipelineStatus: "enriched",
      status: "open",
      category: "gis",
      technologyStack: ["QGIS"],
      budget: 1,
      sourceContentHash: "secret-hash",
    });
    const agent = await vendorAgent();
    const { tor } = (await agent.get("/api/vendor/matches")).body.data[0];
    expect(tor).toMatchObject({ title: "t", category: "gis", technologyStack: ["QGIS"], budget: 1 });
    expect(tor).not.toHaveProperty("pipelineStatus");
    expect(tor).not.toHaveProperty("sourceContentHash");
    expect(tor).not.toHaveProperty("aiSummary");
  });

  it("uses the TOR's referencePrice for the budget signal", async () => {
    await Tor.create({
      title: "priced",
      pipelineStatus: "enriched",
      status: "open",
      budget: 9_000_000,
      referencePrice: 150_000,
    });
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ budgetMin: 100_000, budgetMax: 200_000 });
    const [match] = (await agent.get("/api/vendor/matches")).body.data;
    expect(match.matchScore).toBe(100);
    expect(match.matchedCriteria).toEqual(["budgetRange"]);
  });

  it("scores each vendor against their own profile", async () => {
    await seedTors();
    const web = await vendorAgent("web@test.com");
    const cctv = await vendorAgent("cctv@test.com");
    await web.put("/api/vendor/profile").send({ technologyStack: ["React", "Node.js"] });
    await cctv.put("/api/vendor/profile").send({ technologyStack: ["C++"] });

    expect((await web.get("/api/vendor/matches")).body.data[0].tor.title).toBe("เว็บแอปพลิเคชันสารบรรณ");
    expect((await cctv.get("/api/vendor/matches")).body.data[0].tor.title).toBe("ระบบกล้องวงจรปิด");
  });
});

describe("GET /api/vendor/matches — pagination", () => {
  async function seedMany(n: number) {
    await Tor.create(
      Array.from({ length: n }, (_, i) => ({
        title: `tor-${i}`,
        pipelineStatus: "enriched" as const,
        status: "open" as const,
        // i React techs out of n required → strictly decreasing score by index
        technologyStack: ["React", ...Array.from({ length: i }, (_, j) => `extra-${j}`)],
      }))
    );
  }

  it("defaults to page 1 with 20 per page", async () => {
    await seedMany(25);
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/matches");
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, totalCount: 25, hasNextPage: true });
    expect(res.body.data).toHaveLength(20);
  });

  it("pages through the ranked list without overlap or gaps", async () => {
    await seedMany(5);
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ technologyStack: ["React"] });

    const p1 = (await agent.get("/api/vendor/matches?page=1&pageSize=2")).body;
    const p2 = (await agent.get("/api/vendor/matches?page=2&pageSize=2")).body;
    const p3 = (await agent.get("/api/vendor/matches?page=3&pageSize=2")).body;
    const titles = [...p1.data, ...p2.data, ...p3.data].map((m: { tor: { title: string } }) => m.tor.title);

    expect(titles).toEqual(["tor-0", "tor-1", "tor-2", "tor-3", "tor-4"]);
    expect([p1.hasNextPage, p2.hasNextPage, p3.hasNextPage]).toEqual([true, true, false]);
    const scores = [...p1.data, ...p2.data, ...p3.data].map((m: { matchScore: number }) => m.matchScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("returns an empty page past the end", async () => {
    await seedMany(3);
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/matches?page=9&pageSize=2");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], totalCount: 3, hasNextPage: false });
  });

  it("accepts the maximum pageSize of 100", async () => {
    const agent = await vendorAgent();
    expect((await agent.get("/api/vendor/matches?pageSize=100")).status).toBe(200);
  });

  it.each(["page=0", "page=-1", "page=abc", "page=1.5", "pageSize=0", "pageSize=101", "pageSize=abc"])(
    "rejects %s with 400",
    async (query) => {
      const agent = await vendorAgent();
      expect((await agent.get(`/api/vendor/matches?${query}`)).status).toBe(400);
    }
  );

  it("only ranks TORs a vendor can still act on, and keeps TORs with no procurement yet", async () => {
    const stage = (s: string) => ({ stage: s, announcements: [], lastCheckedAt: new Date() });
    const inviting = (daysAhead: number) => ({
      ...stage("inviting"),
      bidDeadline: { date: new Date(Date.now() + daysAhead * 86_400_000), source: "admin", extractedAt: new Date() },
    });
    await Tor.insertMany([
      { title: "ร่าง", pipelineStatus: "enriched", category: "gis", procurement: stage("draft") },
      { title: "ยังไม่มีข้อมูลสถานะ", pipelineStatus: "enriched", category: "gis" },
      { title: "เปิดรับ", pipelineStatus: "enriched", category: "gis", procurement: inviting(30) },
      { title: "ใกล้ปิด", pipelineStatus: "enriched", category: "gis", procurement: inviting(2) },
      { title: "ประกาศผู้ชนะแล้ว", pipelineStatus: "enriched", category: "gis", procurement: stage("awarded") },
      { title: "ยกเลิก", pipelineStatus: "enriched", category: "gis", procurement: stage("cancelled") },
      { title: "เลยกำหนด", pipelineStatus: "enriched", category: "gis", procurement: inviting(-2) },
      { title: "แอดมินปิดแล้ว", pipelineStatus: "enriched", status: "closed", category: "gis", procurement: inviting(30) },
    ]);
    const agent = await vendorAgent();

    const res = await agent.get("/api/vendor/matches?pageSize=100");

    const titles = res.body.data.map((m: { tor: { title: string } }) => m.tor.title).sort();
    expect(titles).toEqual(["ใกล้ปิด", "ร่าง", "เปิดรับ", "ยังไม่มีข้อมูลสถานะ"].sort());
    const closing = res.body.data.find((m: { tor: { title: string } }) => m.tor.title === "ใกล้ปิด");
    expect(closing.tor.displayStatus).toBe("closing_soon");
    expect(closing.tor.procurement).not.toHaveProperty("announcements");
  });
});
