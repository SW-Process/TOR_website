import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../index";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120000);

afterEach(async () => {
  await Tor.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Tor ingestion fields", () => {
  it("persists the new scalar fields and an embedded sourceDocument", async () => {
    const tor = await Tor.create({
      title: "จ้างพัฒนาระบบ",
      projectCode: "69000000001",
      budget: 1_000_000,
      referencePrice: 950_000,
      sourceListingUrl: "https://egp2.bangkok.go.th/project-detail/abc",
      procurementMethod: "ประกวดราคา",
      procurementType: "จ้าง",
      goodsCategory: "งานจ้างพัฒนาระบบ",
      sourceContentHash: "a".repeat(64),
      sourceDocument: {
        egpUrl: "https://egp2.bangkok.go.th/api/file/ann-1/tor.pdf",
        filename: "tor.pdf",
        storageKey: "tor-pdfs/69000000001/ann-1.pdf",
        textLayer: "scanned",
        pageCount: 12,
        byteSize: 345678,
        sha256: "b".repeat(64),
        fetchedAt: new Date("2026-08-29T00:00:00Z"),
      },
    });

    const found = await Tor.findById(tor._id).lean();
    expect(found?.referencePrice).toBe(950_000);
    expect(found?.sourceContentHash).toBe("a".repeat(64));
    expect(found?.sourceDocument?.textLayer).toBe("scanned");
    expect(found?.sourceDocument?.pageCount).toBe(12);
  });

  it("rejects an invalid textLayer enum", async () => {
    await expect(
      Tor.create({
        title: "x",
        sourceDocument: {
          egpUrl: "u",
          filename: "f.pdf",
          storageKey: null,
          // @ts-expect-error invalid enum on purpose
          textLayer: "bogus",
          pageCount: null,
          byteSize: null,
          sha256: null,
          fetchedAt: new Date(),
        },
      })
    ).rejects.toThrow(/validation/i);
  });
});
