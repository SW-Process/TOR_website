import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Readable } from "node:stream";

import app from "../app";
import { Tor } from "../models";
import { setStorageForTest } from "../storage";
import type { BlobStorage } from "../storage/storage.types";

let mongod: MongoMemoryServer;

const PDF_BYTES = Buffer.from("%PDF-1.4 stored bytes");

const fakeStore: BlobStorage = {
  async put(key, body) {
    return { key, size: body.length };
  },
  async getStream(key) {
    if (key !== "tor-pdfs/69000000001/ann-1.pdf") throw new Error("missing");
    return Readable.from([PDF_BYTES]);
  },
  async exists() {
    return true;
  },
  publicUrl() {
    return null;
  },
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setStorageForTest(fakeStore);
});

afterEach(async () => {
  await Tor.deleteMany({});
});

afterAll(async () => {
  setStorageForTest(null);
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /api/tors/:id/document", () => {
  it("streams the stored pdf", async () => {
    const tor = await Tor.create({
      title: "t",
      projectCode: "69000000001",
      sourceDocument: {
        egpUrl: "u",
        filename: "tor.pdf",
        storageKey: "tor-pdfs/69000000001/ann-1.pdf",
        textLayer: "scanned",
        pageCount: 3,
        byteSize: PDF_BYTES.length,
        sha256: "c".repeat(64),
        fetchedAt: new Date(),
      },
    });

    const res = await request(app).get(`/api/tors/${tor._id.toString()}/document`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/inline/);
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
  });

  it("404 when the TOR has no stored document", async () => {
    const tor = await Tor.create({ title: "t", projectCode: "69000000002" });
    const res = await request(app).get(`/api/tors/${tor._id.toString()}/document`);
    expect(res.status).toBe(404);
  });

  it("404 for an unknown TOR id", async () => {
    const res = await request(app).get(`/api/tors/${new mongoose.Types.ObjectId().toString()}/document`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed TOR id", async () => {
    const res = await request(app).get("/api/tors/not-an-object-id/document");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid id");
    expect(JSON.stringify(res.body)).not.toMatch(/ObjectId|_id|Tor/);
  });
});
