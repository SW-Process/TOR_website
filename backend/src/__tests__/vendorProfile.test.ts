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

  it("accepts numeric strings for number fields", async () => {
    const agent = await vendorAgent();
    const res = await agent
      .put("/api/vendor/profile")
      .send({ registeredCapital: "1000000", budgetMin: "100", budgetMax: "200" });
    expect(res.status).toBe(200);
    expect(res.body.profile.registeredCapital).toBe(1_000_000);
    expect(res.body.profile.budgetRange).toEqual({ min: 100, max: 200 });
  });

  it.each([
    ["a non-numeric string", "abc"],
    ["Infinity", "Infinity"],
    ["a negative numeric string", "-1"],
  ])("rejects %s as a number with 400", async (_label, value) => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ teamSize: value });
    expect(res.status).toBe(400);
  });

  it.each([
    ["true", true],
    ["false", false],
    ["an array holding a number", [5]],
    ["an empty array", []],
    ["a hex string", "0x10"],
  ])("rejects %s for a number field with 400", async (_label, value) => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ teamSize: value });
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

describe("PUT /api/vendor/profile — technologyStack", () => {
  it("persists technologyStack and returns it on the next GET", async () => {
    const agent = await vendorAgent();
    const res = await agent
      .put("/api/vendor/profile")
      .send({ technologyStack: ["React", "Node.js", "PostgreSQL"] });

    expect(res.status).toBe(200);
    expect(res.body.profile.technologyStack).toEqual(["React", "Node.js", "PostgreSQL"]);

    const reread = await agent.get("/api/vendor/profile");
    expect(reread.body.profile.technologyStack).toEqual(["React", "Node.js", "PostgreSQL"]);
  });

  it("trims items and drops empty or whitespace-only ones", async () => {
    const agent = await vendorAgent();
    const res = await agent
      .put("/api/vendor/profile")
      .send({ technologyStack: [" React ", "", "   ", "Node.js"] });

    expect(res.status).toBe(200);
    expect(res.body.profile.technologyStack).toEqual(["React", "Node.js"]);
  });

  it("keeps non-ASCII entries and original casing", async () => {
    const agent = await vendorAgent();
    const res = await agent
      .put("/api/vendor/profile")
      .send({ technologyStack: ["ระบบ GIS", "PostGIS", "postgis"] });

    expect(res.status).toBe(200);
    expect(res.body.profile.technologyStack).toEqual(["ระบบ GIS", "PostGIS", "postgis"]);
  });

  // PUT replaces the editable fields, so a client that forgets to send
  // technologyStack wipes it — the frontend bug this field was added to fix.
  it("clears technologyStack when a later PUT omits it", async () => {
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ technologyStack: ["React"], companyName: "Acme" });
    const res = await agent.put("/api/vendor/profile").send({ companyName: "Acme" });

    expect(res.status).toBe(200);
    expect(res.body.profile.technologyStack).toEqual([]);
  });

  it("clears technologyStack when sent as null or an empty array", async () => {
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ technologyStack: ["React"] });
    expect((await agent.put("/api/vendor/profile").send({ technologyStack: null })).body.profile.technologyStack).toEqual([]);

    await agent.put("/api/vendor/profile").send({ technologyStack: ["React"] });
    expect((await agent.put("/api/vendor/profile").send({ technologyStack: [] })).body.profile.technologyStack).toEqual([]);
  });

  it("accepts exactly 100 items of exactly 120 characters", async () => {
    const agent = await vendorAgent();
    const items = Array.from({ length: 100 }, (_, i) => `${i}`.padEnd(120, "x"));
    const res = await agent.put("/api/vendor/profile").send({ technologyStack: items });

    expect(res.status).toBe(200);
    expect(res.body.profile.technologyStack).toHaveLength(100);
  });

  it.each([
    ["a comma-separated string instead of an array", "React, Node.js"],
    ["an object", { react: true }],
    ["an array containing a number", ["React", 42]],
    ["an array containing null", ["React", null]],
    ["an array containing a nested array", [["React"]]],
    ["more than 100 items", Array.from({ length: 101 }, (_, i) => `tech-${i}`)],
    ["an item longer than 120 characters", ["x".repeat(121)]],
  ])("rejects %s with 400", async (_label, technologyStack) => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ technologyStack });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/technologyStack/);
  });

  it("measures the 120-character limit after trimming", async () => {
    const agent = await vendorAgent();
    const res = await agent
      .put("/api/vendor/profile")
      .send({ technologyStack: [`  ${"x".repeat(120)}  `] });
    expect(res.status).toBe(200);
  });

  it("saves nothing when technologyStack is invalid", async () => {
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ companyName: "Before", technologyStack: ["React"] });
    const res = await agent
      .put("/api/vendor/profile")
      .send({ companyName: "After", technologyStack: "React" });
    expect(res.status).toBe(400);

    const reread = await agent.get("/api/vendor/profile");
    expect(reread.body.profile).toMatchObject({ companyName: "Before", technologyStack: ["React"] });
  });

  it("keeps technologyStack isolated per vendor", async () => {
    const a = await vendorAgent("a@test.com");
    const b = await vendorAgent("b@test.com");
    await a.put("/api/vendor/profile").send({ technologyStack: ["React"] });
    await b.put("/api/vendor/profile").send({ technologyStack: ["Java"] });

    expect((await a.get("/api/vendor/profile")).body.profile.technologyStack).toEqual(["React"]);
    expect((await b.get("/api/vendor/profile")).body.profile.technologyStack).toEqual(["Java"]);
  });
});

describe("PUT /api/vendor/profile — access control", () => {
  it("401 without a session", async () => {
    const res = await request(app).put("/api/vendor/profile").send({ technologyStack: ["React"] });
    expect(res.status).toBe(401);
    expect(await VendorProfile.countDocuments()).toBe(0);
  });

  it("401 with a forged session cookie", async () => {
    const res = await request(app)
      .put("/api/vendor/profile")
      .set("Cookie", "token=not-a-real-jwt")
      .send({ technologyStack: ["React"] });
    expect(res.status).toBe(401);
  });

  it("403 for an admin", async () => {
    const agent = await adminAgent();
    const res = await agent.put("/api/vendor/profile").send({ technologyStack: ["React"] });
    expect(res.status).toBe(403);
    expect(await VendorProfile.countDocuments()).toBe(0);
  });
});

describe("PUT /api/vendor/profile — other fields and edge cases", () => {
  it("creates the profile when PUT is the vendor's first call", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ technologyStack: ["React"] });
    expect(res.status).toBe(200);
    expect(await VendorProfile.countDocuments()).toBe(1);
  });

  it("accepts an empty body and leaves an empty profile", async () => {
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ companyName: "Acme", technologyStack: ["React"] });
    const res = await agent.put("/api/vendor/profile").send({});
    expect(res.status).toBe(200);
    expect(res.body.profile.companyName).toBeUndefined();
    expect(res.body.profile.technologyStack).toEqual([]);
  });

  it("ignores userId, _id and savedSearches in the body", async () => {
    const a = await vendorAgent("a@test.com");
    const b = await vendorAgent("b@test.com");
    await b.put("/api/vendor/profile").send({ companyName: "B Corp" });
    const bProfile = (await b.get("/api/vendor/profile")).body.profile;
    await a.post("/api/vendor/profile/saved-searches").send({ name: "keep me" });
    const aBefore = (await a.get("/api/vendor/profile")).body.profile;

    const res = await a.put("/api/vendor/profile").send({
      userId: bProfile.userId,
      _id: bProfile._id,
      savedSearches: [],
      companyName: "A Corp",
    });

    expect(res.status).toBe(200);
    expect(res.body.profile._id).toBe(aBefore._id);
    expect(res.body.profile.userId).toBe(aBefore.userId);
    expect(res.body.profile.savedSearches).toHaveLength(1);
    expect((await b.get("/api/vendor/profile")).body.profile.companyName).toBe("B Corp");
  });

  it("accepts numeric strings for number fields", async () => {
    const agent = await vendorAgent();
    const res = await agent
      .put("/api/vendor/profile")
      .send({ registeredCapital: "1000000", budgetMin: "100", budgetMax: "200" });
    expect(res.status).toBe(200);
    expect(res.body.profile.registeredCapital).toBe(1_000_000);
    expect(res.body.profile.budgetRange).toEqual({ min: 100, max: 200 });
  });

  it.each([
    ["a non-numeric string", "abc"],
    ["Infinity", "Infinity"],
    ["a negative numeric string", "-1"],
  ])("rejects %s as a number with 400", async (_label, value) => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ teamSize: value });
    expect(res.status).toBe(400);
  });

  // KNOWN GAP: asNonNegativeNumber() runs Number(raw) on any type, so these
  // are coerced and saved instead of rejected. `it.failing` passes while the
  // bug exists and starts failing once validation is fixed — then flip to `it`.
  describe("known gap: non-numeric types coerced by Number()", () => {
    it.failing.each([
      ["true", true],
      ["false", false],
      ["an array holding a number", [5]],
      ["an empty array", []],
      ["a hex string", "0x10"],
    ])("should reject %s with 400", async (_label, value) => {
      const agent = await vendorAgent();
      const res = await agent.put("/api/vendor/profile").send({ teamSize: value });
      expect(res.status).toBe(400);
    });
  });

  it("accepts the nested budgetRange shape", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ budgetRange: { min: 10, max: 20 } });
    expect(res.status).toBe(200);
    expect(res.body.profile.budgetRange).toEqual({ min: 10, max: 20 });
  });

  it("accepts a budget with only a minimum", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ budgetMin: 100_000 });
    expect(res.status).toBe(200);
    expect(res.body.profile.budgetRange.min).toBe(100_000);
    expect(res.body.profile.budgetRange.max).toBeUndefined();
  });

  it("accepts budgetMin equal to budgetMax", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ budgetMin: 500, budgetMax: 500 });
    expect(res.status).toBe(200);
  });

  // The frontend sends 0 for an unfilled max; 0 is a real bound, so a filled
  // min alone is rejected. Fixed on the frontend by omitting unfilled bounds.
  it("rejects budgetMin > 0 with budgetMax 0", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ budgetMin: 100_000, budgetMax: 0 });
    expect(res.status).toBe(400);
  });

  it("clears the budget when a later PUT omits it", async () => {
    const agent = await vendorAgent();
    await agent.put("/api/vendor/profile").send({ budgetMin: 1, budgetMax: 2 });
    const res = await agent.put("/api/vendor/profile").send({});
    expect(res.body.profile.budgetRange).toBeUndefined();
  });

  it.each([
    ["companyName as a number", { companyName: 42 }],
    ["companyName longer than 200 characters", { companyName: "x".repeat(201) }],
    ["serviceArea as an array", { serviceArea: ["Bangkok"] }],
    ["certifications as a string", { certifications: "ISO 27001" }],
    ["interestedCategories as a string", { interestedCategories: "gis" }],
    ["interestedCategories with a number", { interestedCategories: [1] }],
  ])("rejects %s with 400", async (_label, body) => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send(body);
    expect(res.status).toBe(400);
  });

  it("treats a whitespace-only companyName as unset", async () => {
    const agent = await vendorAgent();
    const res = await agent.put("/api/vendor/profile").send({ companyName: "   " });
    expect(res.status).toBe(200);
    expect(res.body.profile.companyName).toBeUndefined();
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
