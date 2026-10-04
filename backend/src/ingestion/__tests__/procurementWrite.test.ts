import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../models";
import type { IProcurement } from "../../models";
import { writeProcurementIfUnchanged } from "../procurementWrite";

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
afterEach(async () => {
  await Tor.deleteMany({});
});

const T1 = new Date("2026-10-01T00:00:00Z");
const T2 = new Date("2026-10-02T00:00:00Z");
const procurement = (over: Partial<IProcurement> = {}): IProcurement => ({
  stage: "draft",
  announcements: [],
  lastCheckedAt: T1,
  ...over,
});

describe("writeProcurementIfUnchanged", () => {
  it("sets the whole object when the TOR has no procurement yet", async () => {
    const tor = await Tor.create({ title: "a" });
    const ok = await writeProcurementIfUnchanged(tor._id, null, procurement({ stage: "inviting" }));
    expect(ok).toBe(true);
    expect((await Tor.findById(tor._id).lean())?.procurement?.stage).toBe("inviting");
  });

  it("returns false and writes nothing when someone filled procurement first", async () => {
    const tor = await Tor.create({ title: "a", procurement: procurement({ stage: "awarded" }) });
    const ok = await writeProcurementIfUnchanged(tor._id, null, procurement({ stage: "inviting" }));
    expect(ok).toBe(false);
    expect((await Tor.findById(tor._id).lean())?.procurement?.stage).toBe("awarded");
  });

  it("writes only the refresh-owned paths and keeps bidDeadline and deadlineAttempt", async () => {
    const bid = { date: new Date("2026-10-20T00:00:00Z"), source: "admin" as const, extractedAt: T1 };
    const attempt = { announcementId: "inv-1", at: T1, outcome: "read" as const };
    const tor = await Tor.create({
      title: "a",
      procurement: procurement({ bidDeadline: bid, deadlineAttempt: attempt, contractStatus: "เก่า" }),
    });
    const ok = await writeProcurementIfUnchanged(
      tor._id,
      { ...procurement(), bidDeadline: bid },
      procurement({
        stage: "inviting",
        lastCheckedAt: T2,
        announcements: [{ announcementId: "inv-1", kind: "invitation", hasFile: true }],
      })
    );
    expect(ok).toBe(true);
    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.stage).toBe("inviting");
    expect(saved?.lastCheckedAt).toEqual(T2);
    expect(saved?.contractStatus).toBeUndefined(); // merged had none → unset
    expect(saved?.bidDeadline?.source).toBe("admin");
    expect(saved?.deadlineAttempt?.announcementId).toBe("inv-1");
  });

  it("returns false and leaves the TOR untouched when lastCheckedAt moved after the read", async () => {
    const tor = await Tor.create({ title: "a", procurement: procurement({ lastCheckedAt: T2, stage: "awarded" }) });
    const ok = await writeProcurementIfUnchanged(tor._id, procurement({ lastCheckedAt: T1 }), procurement({ stage: "inviting" }));
    expect(ok).toBe(false);
    expect((await Tor.findById(tor._id).lean())?.procurement?.stage).toBe("awarded");
  });

  it("does not bump updatedAt", async () => {
    const tor = await Tor.create({ title: "a", procurement: procurement() });
    const before = (await Tor.findById(tor._id).lean())?.updatedAt;
    await writeProcurementIfUnchanged(tor._id, procurement(), procurement({ lastCheckedAt: T2 }));
    expect((await Tor.findById(tor._id).lean())?.updatedAt).toEqual(before);
  });
});
