import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Notification, Tor, VendorProfile } from "../../models";
import { notifySavedSearchMatches } from "../savedSearchMatchNotifications";

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
    agency: "สำนักการแพทย์",
    budget: 500_000,
    ...over,
  });
}

function profileWithSearch(search: Record<string, unknown>) {
  return VendorProfile.create({
    userId: new mongoose.Types.ObjectId(),
    savedSearches: [{ name: "เว็บแอปของสำนักการแพทย์", filters: {}, alertsEnabled: true, ...search }],
  });
}

describe("notifySavedSearchMatches", () => {
  it("notifies a vendor whose saved search matches the TOR", async () => {
    const t = await tor();
    const p = await profileWithSearch({ filters: { category: "web-application" } });

    const created = await notifySavedSearchMatches([t.id]);

    expect(created).toBe(1);
    const rows = await Notification.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ vendorId: p._id, torId: t._id, type: "saved_search_match", read: false });
    expect(rows[0]?.savedSearchId).toEqual(p.savedSearches[0]!._id);
    expect(rows[0]?.message).toContain(t.title);
  });

  it("does not notify when the saved search does not match", async () => {
    const t = await tor({ category: "web-application" });
    await profileWithSearch({ filters: { category: "cctv-its" } });

    expect(await notifySavedSearchMatches([t.id])).toBe(0);
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it("ignores a saved search with alerts disabled", async () => {
    const t = await tor();
    await profileWithSearch({ filters: { category: "web-application" }, alertsEnabled: false });

    expect(await notifySavedSearchMatches([t.id])).toBe(0);
  });

  it("matches on the free-text search box the same way the public list would", async () => {
    const t = await tor({ title: "ระบบจัดการสารบรรณอิเล็กทรอนิกส์" });
    await profileWithSearch({ filters: { q: "สารบรรณ" } });

    expect(await notifySavedSearchMatches([t.id])).toBe(1);
  });

  it("notifies once per saved search when a vendor has more than one", async () => {
    const t = await tor();
    const p = await VendorProfile.create({
      userId: new mongoose.Types.ObjectId(),
      savedSearches: [
        { name: "search A", filters: { category: "web-application" }, alertsEnabled: true },
        { name: "search B", filters: { agency: "สำนักการแพทย์" }, alertsEnabled: true },
      ],
    });

    const created = await notifySavedSearchMatches([t.id]);

    expect(created).toBe(2);
    const rows = await Notification.find({ vendorId: p._id }).lean();
    expect(rows.map((r) => String(r.savedSearchId)).sort()).toEqual(
      p.savedSearches.map((s) => String(s._id)).sort()
    );
  });

  it("skips a saved search whose stored filters no longer parse, without failing the batch", async () => {
    const t = await tor();
    await profileWithSearch({ filters: { budgetMin: "not-a-number" } });
    await profileWithSearch({ filters: { category: "web-application" } });

    expect(await notifySavedSearchMatches([t.id])).toBe(1);
  });

  it("is idempotent: notifying twice for the same TOR and saved search does not duplicate", async () => {
    const t = await tor();
    await profileWithSearch({ filters: { category: "web-application" } });

    await notifySavedSearchMatches([t.id]);
    const second = await notifySavedSearchMatches([t.id]);

    expect(second).toBe(0);
    expect(await Notification.countDocuments({})).toBe(1);
  });

  it("does nothing for an empty or missing list of TOR ids", async () => {
    expect(await notifySavedSearchMatches([])).toBe(0);
    expect(await notifySavedSearchMatches(undefined)).toBe(0);
    expect(await notifySavedSearchMatches(null)).toBe(0);
  });

  it("never throws, even if a lookup fails", async () => {
    await expect(notifySavedSearchMatches(["not-a-valid-object-id"])).resolves.toBe(0);
  });
});
