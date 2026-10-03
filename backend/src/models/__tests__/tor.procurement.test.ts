import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../Tor";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Tor.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Tor.deleteMany({});
});

describe("Tor.procurement", () => {
  it("defaults to null", async () => {
    const tor = await Tor.create({ title: "x" });
    expect(tor.procurement).toBeNull();
  });

  it("round-trips stage, announcements and bidDeadline", async () => {
    const lastCheckedAt = new Date("2026-10-03T00:00:00Z");
    const tor = await Tor.create({
      title: "x",
      procurement: {
        stage: "inviting",
        contractStatus: "ระหว่างดำเนินการ",
        announcements: [
          {
            announcementId: "a-1",
            typeName: "ประกาศเชิญชวน",
            kind: "invitation",
            publishedAt: new Date("2026-09-01T00:00:00Z"),
            hasFile: true,
            storageKey: "tor-pdfs/1/a-1.pdf",
          },
        ],
        bidDeadline: { date: new Date("2026-10-20T00:00:00Z"), source: "admin", extractedAt: lastCheckedAt },
        lastCheckedAt,
      },
    });
    const saved = await Tor.findById(tor.id).lean();
    expect(saved?.procurement?.stage).toBe("inviting");
    expect(saved?.procurement?.announcements[0]).toMatchObject({ kind: "invitation", hasFile: true });
    expect(saved?.procurement?.bidDeadline?.source).toBe("admin");
  });

  it("rejects an unknown stage", async () => {
    await expect(
      Tor.create({ title: "x", procurement: { stage: "bogus", announcements: [], lastCheckedAt: new Date() } as never })
    ).rejects.toThrow();
  });

  it("rejects an unknown announcement kind", async () => {
    await expect(
      Tor.create({
        title: "x",
        procurement: {
          stage: "draft",
          announcements: [{ announcementId: "a", kind: "bogus", hasFile: false }],
          lastCheckedAt: new Date(),
        } as never,
      })
    ).rejects.toThrow();
  });

  it("indexes stage and lastCheckedAt", async () => {
    const keys = (await Tor.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ "procurement.stage": 1 }));
    expect(keys).toContain(JSON.stringify({ "procurement.lastCheckedAt": 1 }));
  });
});
