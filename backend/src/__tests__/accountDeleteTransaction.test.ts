import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Bookmark, Session, Tor, User, VendorProfile } from "../models";

/** A replica set, like Atlas, so transactions are really used. */
let replSet: MongoMemoryReplSet;
const PASSWORD = "plum-orchard-ladder-17";

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
}, 60_000);

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([User.deleteMany({}), VendorProfile.deleteMany({}), Bookmark.deleteMany({}), Tor.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

async function vendorWithData() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "v@test.com", password: PASSWORD }).expect(201);
  const user = (await User.findOne({ email: "v@test.com" }))!;
  const profile = await VendorProfile.create({ userId: user._id });
  const tor = await Tor.create({ title: "T", pipelineStatus: "enriched" });
  await Bookmark.create({ vendorId: profile._id, torId: tor._id });
  return { agent, user, profile };
}

describe("deleting an account is all or nothing (ASVS 2.3.3)", () => {
  it("removes the account and everything tied to it", async () => {
    const { agent, user } = await vendorWithData();
    await agent.delete("/api/auth/me").send({ currentPassword: PASSWORD }).expect(200);
    expect(await User.exists({ _id: user._id })).toBeNull();
    expect(await VendorProfile.countDocuments({})).toBe(0);
    expect(await Bookmark.countDocuments({})).toBe(0);
  });

  it("rolls everything back if a step fails half-way", async () => {
    const { agent, user } = await vendorWithData();
    jest.spyOn(User, "deleteOne").mockRejectedValueOnce(new Error("primary stepped down"));

    await agent.delete("/api/auth/me").send({ currentPassword: PASSWORD }).expect(500);
    expect(await User.exists({ _id: user._id })).not.toBeNull();
    expect(await VendorProfile.countDocuments({})).toBe(1);
    expect(await Bookmark.countDocuments({})).toBe(1);
    await agent.get("/api/auth/me").expect(200); // even the session survived
  });
});
