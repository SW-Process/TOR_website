import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Notification, Tor, VendorProfile } from "../../models";
import { notifyProfileMatches, PROFILE_MATCH_THRESHOLD } from "../profileMatchNotifications";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), VendorProfile.deleteMany({}), Notification.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function tor(over: Record<string, unknown> = {}) {
  return Tor.create({
    title: "ระบบเว็บแอปพลิเคชัน",
    pipelineStatus: "enriched",
    category: "web-application",
    technologyStack: ["React", "Node.js"],
    budget: 500_000,
    ...over,
  });
}

function profile(over: Record<string, unknown> = {}) {
  return VendorProfile.create({
    userId: new mongoose.Types.ObjectId(),
    interestedCategories: ["web-application"],
    technologyStack: ["React", "Node.js"],
    budgetRange: { min: 100_000, max: 1_000_000 },
    ...over,
  });
}

describe("notifyProfileMatches", () => {
  it("notifies a vendor whose profile scores at or above the threshold", async () => {
    const t = await tor();
    const p = await profile();

    const created = await notifyProfileMatches([t.id]);

    expect(created).toBe(1);
    const rows = await Notification.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ vendorId: p._id, torId: t._id, type: "profile_match", read: false });
    expect(rows[0]?.message).toContain(t.title);
  });

  it("does not notify a vendor whose profile scores below the threshold", async () => {
    const t = await tor();
    await profile({ interestedCategories: ["cctv-its"], technologyStack: ["COBOL"], budgetRange: { min: 1, max: 2 } });

    const created = await notifyProfileMatches([t.id]);

    expect(created).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it("notifies every vendor that qualifies, not just the first", async () => {
    const t = await tor();
    await profile();
    await profile();

    const created = await notifyProfileMatches([t.id]);
    expect(created).toBe(2);
  });

  it("is idempotent: notifying twice for the same TOR does not duplicate", async () => {
    const t = await tor();
    await profile();

    await notifyProfileMatches([t.id]);
    const second = await notifyProfileMatches([t.id]);

    expect(second).toBe(0);
    expect(await Notification.countDocuments({})).toBe(1);
  });

  it("does nothing for an empty or missing list of TOR ids", async () => {
    expect(await notifyProfileMatches([])).toBe(0);
    expect(await notifyProfileMatches(undefined)).toBe(0);
    expect(await notifyProfileMatches(null)).toBe(0);
  });

  it("never throws, even if a lookup fails", async () => {
    await expect(notifyProfileMatches(["not-a-valid-object-id"])).resolves.toBe(0);
  });

  it(`matches the match-score badge's "good" cut (score >= ${PROFILE_MATCH_THRESHOLD})`, async () => {
    // category (40) + tech (35) match; budget (25) doesn't -> 75/100, just over the line.
    const t = await tor({ budget: 50_000_000 });
    await profile();

    expect(await notifyProfileMatches([t.id])).toBe(1);
  });
});
