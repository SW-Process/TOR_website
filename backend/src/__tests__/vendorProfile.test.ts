import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
  await VendorProfile.deleteMany({});
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

async function adminAgent() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" });
  await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
  await agent.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
  return agent;
}

describe("access control", () => {
  it("401 without a session", async () => {
    const res = await request(app).get("/api/vendor/profile");
    expect(res.status).toBe(401);
  });

  it("403 for an admin", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/vendor/profile");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/vendor/profile", () => {
  it("creates an empty profile on first access", async () => {
    const agent = await vendorAgent();
    const res = await agent.get("/api/vendor/profile");

    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      certifications: [],
      technologyStack: [],
      interestedCategories: [],
      savedSearches: [],
    });
    expect(res.body.profile.userId).toBeDefined();
    expect(await VendorProfile.countDocuments()).toBe(1);
  });

  it("returns the same profile on repeat access", async () => {
    const agent = await vendorAgent();
    const first = await agent.get("/api/vendor/profile");
    const second = await agent.get("/api/vendor/profile");
    expect(second.body.profile._id).toBe(first.body.profile._id);
    expect(await VendorProfile.countDocuments()).toBe(1);
  });
});

describe("PUT /api/vendor/profile", () => {
  it("persists the editable fields", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({
      companyName: "  Acme Co  ",
      businessType: "software",
      registeredCapital: 1_000_000,
      yearsExperience: 5,
      teamSize: 12,
      certifications: ["ISO 27001", " PMP "],
      interestedCategories: ["ระบบสารสนเทศ"],
      budgetMin: 100_000,
      budgetMax: 500_000,
      serviceArea: "Bangkok",
    });

    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      companyName: "Acme Co",
      businessType: "software",
      registeredCapital: 1_000_000,
      yearsExperience: 5,
      teamSize: 12,
      certifications: ["ISO 27001", "PMP"],
      interestedCategories: ["ระบบสารสนเทศ"],
      budgetRange: { min: 100_000, max: 500_000 },
      serviceArea: "Bangkok",
    });

    const reread = await agent.get("/api/vendor/profile");
    expect(reread.body.profile.companyName).toBe("Acme Co");
  });

  it("accepts the frontend's experienceYears alias", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ experienceYears: 7 });
    expect(res.status).toBe(200);
    expect(res.body.profile.yearsExperience).toBe(7);
  });

  it("rejects a negative number with 400", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ registeredCapital: -5 });
    expect(res.status).toBe(400);
  });

  it("rejects budgetMin greater than budgetMax with 400", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ budgetMin: 900, budgetMax: 100 });
    expect(res.status).toBe(400);
  });

  it("keeps profiles isolated per vendor", async () => {
    const a = await vendorAgent("a@test.com");
    const b = await vendorAgent("b@test.com");
    await a.put("/api/vendor/profile").send({ companyName: "A Corp" });
    await b.put("/api/vendor/profile").send({ companyName: "B Corp" });

    expect((await a.get("/api/vendor/profile")).body.profile.companyName).toBe("A Corp");
    expect((await b.get("/api/vendor/profile")).body.profile.companyName).toBe("B Corp");
  });
});

describe("saved searches", () => {
  it("adds, lists, edits, and deletes", async () => {
    const agent = await vendorAgent();

    const created = await agent
      .post("/api/vendor/profile/saved-searches")
      .send({ name: "Software TORs", filters: { category: "software" } });
    expect(created.status).toBe(201);
    const id = created.body.savedSearch._id;
    expect(created.body.savedSearch.alertsEnabled).toBe(false);

    const list = await agent.get("/api/vendor/profile/saved-searches");
    expect(list.status).toBe(200);
    expect(list.body.savedSearches).toHaveLength(1);

    const patched = await agent
      .patch(`/api/vendor/profile/saved-searches/${id}`)
      .send({ alertsEnabled: true, name: "SW alerts" });
    expect(patched.status).toBe(200);
    expect(patched.body.savedSearch).toMatchObject({ name: "SW alerts", alertsEnabled: true });

    const removed = await agent.delete(`/api/vendor/profile/saved-searches/${id}`);
    expect(removed.status).toBe(204);
    expect((await agent.get("/api/vendor/profile/saved-searches")).body.savedSearches).toHaveLength(0);
  });

  it("rejects a saved search with no name", async () => {
    const agent = await vendorAgent();
    const res = await agent.post("/api/vendor/profile/saved-searches").send({ filters: {} });
    expect(res.status).toBe(400);
  });

  it("404 for an unknown saved-search id", async () => {
    const agent = await vendorAgent();
    const id = new mongoose.Types.ObjectId().toString();
    expect((await agent.patch(`/api/vendor/profile/saved-searches/${id}`).send({ name: "x" })).status).toBe(404);
    expect((await agent.delete(`/api/vendor/profile/saved-searches/${id}`)).status).toBe(404);
  });
});
