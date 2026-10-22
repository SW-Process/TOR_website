import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Bookmark, Tor, User, VendorProfile } from "../models";
import { MAX_SAVED_SEARCHES } from "../controllers/vendorProfileController";
import { MAX_BOOKMARKS } from "../controllers/bookmarkController";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), VendorProfile.deleteMany({}), Bookmark.deleteMany({}), Tor.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function vendor() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "v@test.com", password: "plum-orchard-ladder-17" }).expect(201);
  return agent;
}

describe("saved search filters (ASVS 2.2.1, 15.3.3, 15.3.6)", () => {
  it("keeps a filter made of the search's own fields", async () => {
    const agent = await vendor();
    await agent
      .post("/api/vendor/profile/saved-searches")
      .send({ name: "Web", filters: { category: ["web-application"], budgetMin: 100000, q: "เว็บไซต์" } })
      .expect(201);
  });

  it.each([
    ['{"name":"x","filters":{"__proto__":{"isAdmin":true}}}', /unknown fields: __proto__/],
    ['{"name":"x","filters":{"$where":"sleep(1000)"}}', /unknown fields: \$where/],
    ['{"name":"x","filters":{"page":3}}', /unknown fields: page/],
    ['{"name":"x","filters":{"budgetMin":500,"budgetMax":100}}', /not a valid search/],
    ['{"name":"x","filters":{"status":["nonsense"]}}', /not a valid search/],
    ['{"name":"x","filters":[1,2]}', /must be an object/],
  ])("refuses %s", async (body, message) => {
    const agent = await vendor();
    const res = await agent.post("/api/vendor/profile/saved-searches").set("Content-Type", "application/json").send(body).expect(400);
    expect(res.body.message).toMatch(message);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("refuses a filter bigger than 4 KB", async () => {
    const agent = await vendor();
    const res = await agent
      .post("/api/vendor/profile/saved-searches")
      .send({ name: "big", filters: { tech: Array.from({ length: 20 }, () => "x".repeat(100)), agency: Array.from({ length: 60 }, () => "y".repeat(60)) } })
      .expect(400);
    expect(res.body.message).toMatch(/too large/);
  });
});

describe("per-vendor limits (ASVS 2.3.2)", () => {
  it(`keeps at most ${MAX_SAVED_SEARCHES} saved searches`, async () => {
    const agent = await vendor();
    const user = await User.findOne({ email: "v@test.com" });
    await VendorProfile.create({
      userId: user!._id,
      savedSearches: Array.from({ length: MAX_SAVED_SEARCHES }, (_, i) => ({ name: `s${i}`, filters: {} })),
    });
    const res = await agent.post("/api/vendor/profile/saved-searches").send({ name: "one more" }).expect(400);
    expect(res.body.message).toMatch(/at most 50/);
  });

  it(`keeps at most ${MAX_BOOKMARKS} bookmarks, but still lets existing ones be updated`, async () => {
    const agent = await vendor();
    const user = await User.findOne({ email: "v@test.com" });
    const profile = await VendorProfile.create({ userId: user!._id });
    const tor = await Tor.create({ title: "T", pipelineStatus: "enriched" });
    await Bookmark.create({ vendorId: profile._id, torId: tor._id });
    await Bookmark.insertMany(
      Array.from({ length: MAX_BOOKMARKS - 1 }, () => ({ vendorId: profile._id, torId: new mongoose.Types.ObjectId() }))
    );

    const other = await Tor.create({ title: "U", pipelineStatus: "enriched" });
    expect((await agent.put(`/api/vendor/bookmarks/${other._id}`).send({}).expect(400)).body.message).toMatch(/at most 1000/);
    await agent.put(`/api/vendor/bookmarks/${tor._id}`).send({ applicationStatus: "preparing" }).expect(200);
  });
});

describe("support chat flood control (ASVS 2.4.1)", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_ENABLED;
  });

  it("allows 30 messages per 5 minutes per account", async () => {
    const agent = await vendor();
    process.env.RATE_LIMIT_ENABLED = "true";
    for (let i = 0; i < 30; i++) await agent.post("/api/chat/messages").send({ text: `hello ${i}` }).expect(201);
    await agent.post("/api/chat/messages").send({ text: "one too many" }).expect(429);
  });
});
