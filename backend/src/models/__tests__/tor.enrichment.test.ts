import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Tor } from "../Tor";

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

describe("Tor enrichment fields", () => {
  it("defaults pipelineStatus to 'pending' and categoryTags to []", async () => {
    const tor = await Tor.create({ title: "จ้างพัฒนาระบบ" });
    expect(tor.pipelineStatus).toBe("pending");
    expect(tor.categoryTags).toEqual([]);
    expect(tor.classification ?? null).toBeNull();
    expect(tor.category).toBeUndefined();
    expect(tor.taxonomyVersion).toBeUndefined();
  });

  it("persists a classification subdoc and category data", async () => {
    const at = new Date();
    const tor = await Tor.create({
      title: "จ้างพัฒนาระบบสารสนเทศ",
      pipelineStatus: "enriched",
      category: "information-system",
      categoryTags: ["mis", "web"],
      taxonomyVersion: "2026-08-31",
      classification: { isSoftwareRelated: true, reason: "ระบบสารสนเทศ", confidence: 0.92, model: "gemini-2.5-flash", at },
    });
    const found = await Tor.findById(tor.id).lean();
    expect(found?.classification?.isSoftwareRelated).toBe(true);
    expect(found?.classification?.confidence).toBeCloseTo(0.92);
    expect(found?.category).toBe("information-system");
    expect(found?.categoryTags).toEqual(["mis", "web"]);
  });

  it("rejects a pipelineStatus outside the enum", async () => {
    await expect(
      Tor.create({ title: "x", pipelineStatus: "bogus" as unknown as any })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it("declares the enrichment indexes", () => {
    const keys = Tor.schema.indexes().map(([spec]) => JSON.stringify(spec));
    expect(keys).toContain(JSON.stringify({ category: 1, announcementDate: -1 }));
    expect(keys).toContain(JSON.stringify({ agency: 1, announcementDate: -1 }));
    expect(keys).toContain(JSON.stringify({ pipelineStatus: 1, announcementDate: -1 }));
    expect(keys).toContain(JSON.stringify({ categoryTags: 1 }));
  });
});
