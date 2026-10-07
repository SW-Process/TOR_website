import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Bookmark, Tor, User, VendorProfile } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([
    Bookmark.deleteMany({}),
    Tor.deleteMany({}),
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
  ]);
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

async function adminAgent(email = "admin@test.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  await User.updateOne({ email }, { role: "admin" });
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  return agent;
}

async function seedTors() {
  const [a, b, hidden] = await Tor.create([
    { title: "ระบบสารบรรณ", agency: "สำนักการแพทย์", pipelineStatus: "enriched", budget: 1_000_000 },
    { title: "เว็บไซต์หน่วยงาน", agency: "สำนักอนามัย", pipelineStatus: "enriched", budget: 500_000 },
    { title: "งานที่ยังไม่ enrich", pipelineStatus: "pending" },
  ]);
  return { a: String(a!._id), b: String(b!._id), hidden: String(hidden!._id) };
}

describe("/api/vendor/bookmarks", () => {
  it("requires a logged-in vendor", async () => {
    const res = await request(app).get("/api/vendor/bookmarks");
    expect(res.status).toBe(401);
  });

  it("bookmarks a TOR as 'interested', lists it with the TOR, and is idempotent", async () => {
    const { a } = await seedTors();
    const agent = await vendorAgent();

    const put = await agent.put(`/api/vendor/bookmarks/${a}`);
    expect(put.status).toBe(200);
    expect(put.body.bookmark).toMatchObject({ torId: a, applicationStatus: "interested" });

    await agent.patch(`/api/vendor/bookmarks/${a}`).send({ applicationStatus: "preparing" });
    // Re-bookmarking must not reset the status the vendor already set.
    const again = await agent.put(`/api/vendor/bookmarks/${a}`);
    expect(again.body.bookmark.applicationStatus).toBe("preparing");

    const list = await agent.get("/api/vendor/bookmarks");
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      torId: a,
      applicationStatus: "preparing",
      tor: { _id: a, title: "ระบบสารบรรณ", agency: "สำนักการแพทย์", displayStatus: "draft" },
    });
  });

  it("returns a bookmarked TOR's real status, e.g. awarded", async () => {
    const tor = await Tor.create({
      title: "ได้ผู้ชนะแล้ว",
      pipelineStatus: "enriched",
      procurement: { stage: "awarded", announcements: [], lastCheckedAt: new Date() },
    });
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/bookmarks/${tor.id}`);
    const list = await agent.get("/api/vendor/bookmarks");
    const row = list.body.data.find((b: { torId: string }) => b.torId === tor.id);
    expect(row.tor.displayStatus).toBe("awarded");
    expect(row.tor.procurement.stage).toBe("awarded");
  });

  it("persists application status changes (FR-31)", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/bookmarks/${a}`);
    await agent.put(`/api/vendor/bookmarks/${b}`).send({ applicationStatus: "submitted" });

    const patch = await agent.patch(`/api/vendor/bookmarks/${a}`).send({ applicationStatus: "missed" });
    expect(patch.status).toBe(200);
    expect(patch.body.bookmark.applicationStatus).toBe("missed");

    const list = await agent.get("/api/vendor/bookmarks");
    const byTor = Object.fromEntries(
      list.body.data.map((d: { torId: string; applicationStatus: string }) => [d.torId, d.applicationStatus])
    );
    expect(byTor).toEqual({ [a]: "missed", [b]: "submitted" });
  });

  it("rejects bad input", async () => {
    const { a, hidden } = await seedTors();
    const agent = await vendorAgent();

    expect((await agent.put("/api/vendor/bookmarks/not-an-id")).status).toBe(400);
    expect((await agent.put(`/api/vendor/bookmarks/${hidden}`)).status).toBe(404);
    expect((await agent.put(`/api/vendor/bookmarks/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
    expect((await agent.patch(`/api/vendor/bookmarks/${a}`).send({ applicationStatus: "preparing" })).status).toBe(404);

    await agent.put(`/api/vendor/bookmarks/${a}`);
    expect((await agent.patch(`/api/vendor/bookmarks/${a}`).send({ applicationStatus: "won" })).status).toBe(400);
    expect((await agent.patch(`/api/vendor/bookmarks/${a}`).send({ vendorId: "x" })).status).toBe(400);
    expect((await agent.patch(`/api/vendor/bookmarks/${a}`).send({})).status).toBe(400);
  });

  it("deletes a bookmark (idempotently) and keeps vendors isolated", async () => {
    const { a } = await seedTors();
    const alice = await vendorAgent("alice@test.com");
    const bob = await vendorAgent("bob@test.com");
    await alice.put(`/api/vendor/bookmarks/${a}`);
    await bob.put(`/api/vendor/bookmarks/${a}`).send({ applicationStatus: "submitted" });

    expect((await alice.delete(`/api/vendor/bookmarks/${a}`)).status).toBe(204);
    expect((await alice.delete(`/api/vendor/bookmarks/${a}`)).status).toBe(204);

    expect((await alice.get("/api/vendor/bookmarks")).body.data).toEqual([]);
    const bobs = (await bob.get("/api/vendor/bookmarks")).body.data;
    expect(bobs).toHaveLength(1);
    expect(bobs[0].applicationStatus).toBe("submitted");
  });

  it("lets an admin bookmark, list, update and delete, separate from a vendor's", async () => {
    const { a } = await seedTors();
    const vendor = await vendorAgent();
    const admin = await adminAgent();
    await vendor.put(`/api/vendor/bookmarks/${a}`);

    expect((await admin.get("/api/vendor/bookmarks")).body.data).toEqual([]);
    const put = await admin.put(`/api/vendor/bookmarks/${a}`);
    expect(put.status).toBe(200);
    expect(put.body.bookmark.applicationStatus).toBe("interested");

    const patch = await admin.patch(`/api/vendor/bookmarks/${a}`).send({ applicationStatus: "submitted" });
    expect(patch.status).toBe(200);
    expect(patch.body.bookmark.applicationStatus).toBe("submitted");

    const adminList = (await admin.get("/api/vendor/bookmarks")).body.data;
    expect(adminList).toHaveLength(1);
    expect(adminList[0].applicationStatus).toBe("submitted");
    const vendorList = (await vendor.get("/api/vendor/bookmarks")).body.data;
    expect(vendorList).toHaveLength(1);
    expect(vendorList[0].applicationStatus).toBe("interested");

    expect((await admin.delete(`/api/vendor/bookmarks/${a}`)).status).toBe(204);
    expect((await admin.get("/api/vendor/bookmarks")).body.data).toEqual([]);
    expect((await vendor.get("/api/vendor/bookmarks")).body.data).toHaveLength(1);
  });

  it("still keeps saved searches and hidden TORs closed to an admin", async () => {
    const admin = await adminAgent();
    expect((await admin.get("/api/vendor/profile/saved-searches")).status).toBe(403);
    expect((await admin.get("/api/vendor/hidden-tors")).status).toBe(403);
  });

  it("hides bookmarks whose TOR is no longer public", async () => {
    const { a, b } = await seedTors();
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/bookmarks/${a}`);
    await agent.put(`/api/vendor/bookmarks/${b}`);
    await Tor.updateOne({ _id: b }, { pipelineStatus: "rejected" });

    const list = await agent.get("/api/vendor/bookmarks");
    expect(list.body.data.map((d: { torId: string }) => d.torId)).toEqual([a]);
  });
});
