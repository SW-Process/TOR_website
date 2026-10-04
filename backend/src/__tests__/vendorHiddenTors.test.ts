import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Tor, User, VendorProfile } from "../models";
import { MAX_HIDDEN_TORS } from "../controllers/hiddenTorController";

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
  const [a, b, pending] = await Tor.create([
    { title: "ระบบสารบรรณ", agency: "สำนักการแพทย์", pipelineStatus: "enriched", budget: 1_000_000 },
    { title: "เว็บไซต์หน่วยงาน", agency: "สำนักอนามัย", pipelineStatus: "enriched", budget: 500_000 },
    { title: "งานที่ยังไม่ enrich", pipelineStatus: "pending" },
  ]);
  return { a: String(a!._id), b: String(b!._id), pending: String(pending!._id) };
}

const ids = (rows: { _id?: string; tor?: { _id: string } }[]) => rows.map((r) => r.tor?._id ?? r._id);

describe("/api/vendor/hidden-tors", () => {
  it("requires a logged-in vendor", async () => {
    expect((await request(app).get("/api/vendor/hidden-tors")).status).toBe(401);
  });

  it("hides a TOR idempotently and lists it with the TOR, newest first", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();

    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.put(`/api/vendor/hidden-tors/${b}`).expect(204);

    const res = await agent.get("/api/vendor/hidden-tors").expect(200);
    expect(res.body.data.map((r: { torId: string }) => r.torId)).toEqual([b, a]);
    expect(res.body.data[0].tor).toMatchObject({ title: "เว็บไซต์หน่วยงาน" });
  });

  it("unhides a TOR (idempotent)", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);

    await agent.delete(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.delete(`/api/vendor/hidden-tors/${a}`).expect(204);
    expect((await agent.get("/api/vendor/hidden-tors")).body.data).toEqual([]);
  });

  it("404s for a TOR that is not public, 400s for a bad id", async () => {
    const { pending } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${pending}`).expect(404);
    await agent.put("/api/vendor/hidden-tors/not-an-id").expect(400);
  });

  it("keeps each vendor's hidden list separate", async () => {
    const { a } = await seedTors();
    const one = await vendorAgent("one@test.com");
    const two = await vendorAgent("two@test.com");
    await one.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    expect((await two.get("/api/vendor/hidden-tors")).body.data).toEqual([]);
  });

  it("does not let a profile save wipe the hidden list", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.put("/api/vendor/profile").send({ companyName: "Acme" }).expect(200);
    expect((await agent.get("/api/vendor/hidden-tors")).body.data).toHaveLength(1);
  });
});

describe("hidden TORs are left out of the vendor's lists", () => {
  it("search excludes them for that vendor only, totals included", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);

    const mine = await agent.get("/api/tors").expect(200);
    expect(ids(mine.body.data)).toEqual([b]);
    expect(mine.body.totalCount).toBe(1);

    const anonymous = await request(app).get("/api/tors").expect(200);
    expect(anonymous.body.totalCount).toBe(2);
  });

  it("recommendations exclude them", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);

    const res = await agent.get("/api/vendor/matches").expect(200);
    expect(ids(res.body.data)).toEqual([b]);
  });
});

describe("hiding edge cases", () => {
  /** Fill the vendor's hidden list with `n` placeholder TOR ids, straight in the DB. */
  async function fillHidden(email: string, n: number) {
    const user = (await User.findOne({ email }))!;
    const hiddenTors = Array.from({ length: n }, () => ({ torId: new mongoose.Types.ObjectId(), hiddenAt: new Date() }));
    await VendorProfile.updateOne({ userId: user._id }, { $set: { hiddenTors } }, { upsert: true });
  }

  it("stores a TOR once even when hidden by two requests at the same time", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.get("/api/vendor/hidden-tors"); // create the profile first
    await Promise.all([agent.put(`/api/vendor/hidden-tors/${a}`), agent.put(`/api/vendor/hidden-tors/${a}`)]);

    const profile = await VendorProfile.findOne({}).lean();
    expect(profile!.hiddenTors).toHaveLength(1);
  });

  it("refuses a new hide once the list is full, but re-hiding a listed TOR is still fine", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await fillHidden("vendor@test.com", MAX_HIDDEN_TORS - 1);
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204); // the last free slot

    await agent.put(`/api/vendor/hidden-tors/${b}`).expect(409);
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    const profile = await VendorProfile.findOne({}).lean();
    expect(profile!.hiddenTors).toHaveLength(MAX_HIDDEN_TORS);
  });

  it("never overshoots the cap under concurrent hides", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await fillHidden("vendor@test.com", MAX_HIDDEN_TORS - 1);

    const statuses = (
      await Promise.all([agent.put(`/api/vendor/hidden-tors/${a}`), agent.put(`/api/vendor/hidden-tors/${b}`)])
    ).map((r) => r.status);
    expect(statuses.sort()).toEqual([204, 409]);
    const profile = await VendorProfile.findOne({}).lean();
    expect(profile!.hiddenTors).toHaveLength(MAX_HIDDEN_TORS);
  });

  it("is a vendor feature: admins get 403", async () => {
    const { a } = await seedTors();
    await vendorAgent("admin@test.com");
    await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
    const admin = request.agent(app);
    await admin.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
    await admin.put(`/api/vendor/hidden-tors/${a}`).expect(403);
  });

  it("drops a hidden TOR from the list once it is no longer public", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await Tor.updateOne({ _id: a }, { pipelineStatus: "pending" });
    expect((await agent.get("/api/vendor/hidden-tors")).body.data).toEqual([]);
  });

  it("goes away with the account", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.delete("/api/auth/me").send({ currentPassword: "secret123" }).expect(200);
    expect(await VendorProfile.countDocuments({})).toBe(0);
  });
});

describe("hidden TORs and the public read API", () => {
  it("still applies the other search filters alongside the hidden list", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);

    expect((await agent.get("/api/tors").query({ q: "ระบบสารบรรณ" })).body.totalCount).toBe(0);
    expect(ids((await agent.get("/api/tors").query({ q: "เว็บไซต์" })).body.data)).toEqual([b]);
  });

  it("shows an unhidden TOR in search and recommendations again", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.delete(`/api/vendor/hidden-tors/${a}`).expect(204);

    expect((await agent.get("/api/tors")).body.totalCount).toBe(2);
    expect(ids((await agent.get("/api/vendor/matches")).body.data)).toContain(a);
  });

  it("does not filter for admins, anonymous callers, or a bad session cookie", async () => {
    const { a } = await seedTors();
    const vendor = await vendorAgent();
    await vendor.put(`/api/vendor/hidden-tors/${a}`).expect(204);

    await vendorAgent("admin@test.com");
    await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
    const admin = request.agent(app);
    await admin.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });

    expect((await admin.get("/api/tors")).body.totalCount).toBe(2);
    expect((await request(app).get("/api/tors")).body.totalCount).toBe(2);
    expect((await request(app).get("/api/tors").set("Cookie", "token=garbage")).body.totalCount).toBe(2);
  });

  it("keeps a hidden TOR reachable by its direct link", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/hidden-tors/${a}`).expect(204);
    await agent.get(`/api/tors/${a}`).expect(200);
  });
});
