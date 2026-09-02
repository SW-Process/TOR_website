import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor, SystemLog } from "../../models";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import type { TorAnnouncementRef } from "../mapProject";
import { fetchAndStoreTorPdf } from "../fetchAndStoreTorPdf";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Tor.deleteMany({});
  await SystemLog.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const ANN: TorAnnouncementRef = {
  announcementId: "ann-tor",
  filename: "tor.pdf",
  egpUrl: "https://egp.test/api/file/ann-tor/tor.pdf",
  publishedAt: new Date("2026-08-23T00:00:00Z"),
};

function fakeStorage(): BlobStorage & { saved: Map<string, Buffer> } {
  const saved = new Map<string, Buffer>();
  return {
    saved,
    async put(key, body) {
      saved.set(key, body);
      return { key, size: body.length };
    },
    async getStream() {
      throw new Error("not used");
    },
    async exists(key) {
      return saved.has(key);
    },
    publicUrl() {
      return null;
    },
  };
}

function clientReturning(buf: Buffer): EgpClientLike {
  return {
    searchProjects: jest.fn(),
    projectDetail: jest.fn(),
    announcements: jest.fn(),
    downloadFile: jest.fn().mockResolvedValue(buf),
  } as unknown as EgpClientLike;
}

describe("fetchAndStoreTorPdf", () => {
  it("stores the pdf under the key scheme and records sourceDocument", async () => {
    const tor = await Tor.create({ title: "t", projectCode: "69000000001" });
    const storage = fakeStorage();
    const runId = new mongoose.Types.ObjectId();

    await fetchAndStoreTorPdf(tor, ANN, runId, {
      client: clientReturning(Buffer.from("%PDF bytes")),
      storage,
      parse: async () => ({ numpages: 10, text: "x".repeat(5000) }),
    });

    const key = "tor-pdfs/69000000001/ann-tor.pdf";
    expect(storage.saved.has(key)).toBe(true);

    const saved = await Tor.findById(tor._id).lean();
    expect(saved?.sourceDocument).toMatchObject({
      egpUrl: ANN.egpUrl,
      filename: "tor.pdf",
      storageKey: key,
      textLayer: "digital",
      pageCount: 10,
      byteSize: Buffer.from("%PDF bytes").length,
    });
    expect(saved?.sourceDocument?.sha256).toHaveLength(64);
    expect(saved?.sourceDocumentUrl).toBe(`/api/tors/${tor._id.toString()}/document`);
  });

  it("marks the document missing and logs an error when the download fails", async () => {
    const tor = await Tor.create({ title: "t", projectCode: "69000000002" });
    const storage = fakeStorage();
    const client = {
      searchProjects: jest.fn(),
      projectDetail: jest.fn(),
      announcements: jest.fn(),
      downloadFile: jest.fn().mockRejectedValue(new Error("e-GP 404")),
    } as unknown as EgpClientLike;
    const runId = new mongoose.Types.ObjectId();

    await expect(fetchAndStoreTorPdf(tor, ANN, runId, { client, storage })).resolves.toBeUndefined();

    const saved = await Tor.findById(tor._id).lean();
    expect(saved?.sourceDocument).toMatchObject({ storageKey: null, textLayer: "missing" });
    expect(storage.saved.size).toBe(0);

    const errors = await SystemLog.find({ severity: "error" }).lean();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.ingestionRunId?.toString()).toBe(runId.toString());
  });
});
