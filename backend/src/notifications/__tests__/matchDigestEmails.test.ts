import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Notification, Tor, User, VendorProfile } from "../../models";
import { setEmailSenderForTest, type EmailMessage } from "../../email";
import { MAX_DIGEST_ITEMS, emailMatchDigests } from "../matchDigestEmails";
import { notifyMatches } from "../notifyMatches";
import type { CreatedMatchNotification } from "../types";

let mongod: MongoMemoryServer;
let sent: EmailMessage[];
const send = jest.fn(async (m: EmailMessage) => {
  sent.push(m);
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(() => {
  sent = [];
  send.mockClear();
  setEmailSenderForTest({ send });
});

afterEach(async () => {
  setEmailSenderForTest(null);
  await Promise.all([
    Tor.deleteMany({}),
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
    Notification.deleteMany({}),
  ]);
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
    agency: "สำนักการแพทย์",
    budget: 500_000,
    ...over,
  });
}

async function vendor(email: string, over: Record<string, unknown> = {}) {
  const user = await User.create({ email, role: "vendor" });
  return VendorProfile.create({
    userId: user._id,
    interestedCategories: ["web-application"],
    technologyStack: ["React", "Node.js"],
    budgetRange: { min: 100_000, max: 1_000_000 },
    ...over,
  });
}

function profileMatch(vendorId: mongoose.Types.ObjectId, torId: mongoose.Types.ObjectId): CreatedMatchNotification {
  return { vendorId, torId, type: "profile_match", savedSearchId: null };
}

describe("emailMatchDigests", () => {
  it("sends one email per vendor listing every TOR matched for them", async () => {
    const [a, b] = await Promise.all([tor({ title: "TOR A" }), tor({ title: "TOR B" })]);
    const p = await vendor("v1@test.com");

    const count = await emailMatchDigests([profileMatch(p._id, a._id), profileMatch(p._id, b._id)]);

    expect(count).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("v1@test.com");
    expect(sent[0]?.subject).toContain("2 รายการ");
    expect(sent[0]?.text).toContain("TOR A");
    expect(sent[0]?.text).toContain("TOR B");
    expect(sent[0]?.text).toContain(`/tor/${a.id}`);
    expect(sent[0]?.html).toBeDefined();
  });

  it("sends separate digests to separate vendors", async () => {
    const t = await tor();
    const [p1, p2] = await Promise.all([vendor("v1@test.com"), vendor("v2@test.com")]);

    expect(await emailMatchDigests([profileMatch(p1._id, t._id), profileMatch(p2._id, t._id)])).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(["v1@test.com", "v2@test.com"]);
  });

  it("lists a TOR matched by the profile and a saved search once, with both reasons", async () => {
    const t = await tor();
    const p = await vendor("v1@test.com", {
      savedSearches: [{ name: "เว็บแอป", filters: {}, alertsEnabled: true }],
    });
    const searchId = p.savedSearches[0]!._id;

    await emailMatchDigests([
      profileMatch(p._id, t._id),
      { vendorId: p._id, torId: t._id, type: "saved_search_match", savedSearchId: searchId },
    ]);

    expect(sent[0]?.subject).toContain("1 รายการ");
    expect(sent[0]?.text).toContain('ตรงกับโปรไฟล์ของคุณ, การค้นหาที่บันทึกไว้ "เว็บแอป"');
  });

  it("sends nothing to a vendor who turned match emails off", async () => {
    const t = await tor();
    const p = await vendor("v1@test.com", { emailAlertsEnabled: false });

    expect(await emailMatchDigests([profileMatch(p._id, t._id)])).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("treats a profile saved before the flag existed as opted in", async () => {
    const t = await tor();
    const p = await vendor("v1@test.com");
    await VendorProfile.collection.updateOne({ _id: p._id }, { $unset: { emailAlertsEnabled: "" } });

    expect(await emailMatchDigests([profileMatch(p._id, t._id)])).toBe(1);
  });

  it("drops a saved-search match whose saved search no longer has alerts on", async () => {
    const t = await tor();
    const p = await vendor("v1@test.com", {
      savedSearches: [{ name: "เว็บแอป", filters: {}, alertsEnabled: false }],
    });

    const count = await emailMatchDigests([
      { vendorId: p._id, torId: t._id, type: "saved_search_match", savedSearchId: p.savedSearches[0]!._id },
    ]);

    expect(count).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it(`lists at most ${MAX_DIGEST_ITEMS} TORs and counts the rest as "and N more"`, async () => {
    const p = await vendor("v1@test.com");
    const tors = await Tor.insertMany(
      Array.from({ length: MAX_DIGEST_ITEMS + 3 }, (_, i) => ({ title: `TOR ${i}`, pipelineStatus: "enriched" }))
    );

    await emailMatchDigests(tors.map((t) => profileMatch(p._id, t._id)));

    expect(sent[0]?.subject).toContain(`${MAX_DIGEST_ITEMS + 3} รายการ`);
    expect(sent[0]?.text).toContain("และอีก 3 รายการ");
    expect(sent[0]?.text).toContain(`TOR ${MAX_DIGEST_ITEMS - 1}\n`);
    expect(sent[0]?.text).not.toContain(`TOR ${MAX_DIGEST_ITEMS}\n`);
  });

  it("keeps sending to other vendors when one send fails", async () => {
    const t = await tor();
    const [p1, p2] = await Promise.all([vendor("v1@test.com"), vendor("v2@test.com")]);
    send.mockImplementationOnce(async () => {
      throw new Error("SendGrid down");
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const count = await emailMatchDigests([profileMatch(p1._id, t._id), profileMatch(p2._id, t._id)]);

    expect(count).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("does nothing for an empty list", async () => {
    expect(await emailMatchDigests([])).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("notifyMatches", () => {
  it("creates the in-app notifications and emails one digest of them", async () => {
    const t = await tor();
    await vendor("v1@test.com", {
      savedSearches: [{ name: "เว็บแอป", filters: { category: "web-application" }, alertsEnabled: true }],
    });

    await notifyMatches([t.id]);

    expect(await Notification.countDocuments({ type: "profile_match" })).toBe(1);
    expect(await Notification.countDocuments({ type: "saved_search_match" })).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("1 รายการ");
  });

  it("emails nothing on a rerun, since no new notifications are created", async () => {
    const t = await tor();
    await vendor("v1@test.com");

    await notifyMatches([t.id]);
    await notifyMatches([t.id]);

    expect(sent).toHaveLength(1);
  });
});
