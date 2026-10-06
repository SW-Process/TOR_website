import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../models";
import type { BlobStorage } from "../../storage/storage.types";
import { storeTorPdf } from "../storeTorPdf";

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
afterEach(() => Tor.deleteMany({}));

describe("storeTorPdf", () => {
  it("records an invitation document with kind invitation", async () => {
    const storage = { async put(key: string, body: Buffer) { return { key, size: body.length }; }, publicUrl: () => null } as unknown as BlobStorage;
    const tor = await Tor.create({ title: "t", projectCode: "69099312833" });
    await storeTorPdf(tor, Buffer.from("%PDF-1.7 inv"), { egpUrl: "https://gp.test/x", filename: "69099312833-invitation.pdf", key: "tor-pdfs/69099312833/invitation.pdf", kind: "invitation" }, { storage, parse: async () => ({ numpages: 1, text: "x".repeat(500) }) });
    expect((await Tor.findById(tor.id).lean())?.sourceDocument?.kind).toBe("invitation");
  });

  it("stores the bytes, inspects the text layer and records sourceDocument", async () => {
    const puts: string[] = [];
    const storage = { async put(key: string, body: Buffer) { puts.push(key); return { key, size: body.length }; }, publicUrl: () => null } as unknown as BlobStorage;
    const tor = await Tor.create({ title: "t", projectCode: "69099312832" });
    const parse = async () => ({ numpages: 3, text: "x".repeat(1000) });
    await storeTorPdf(tor, Buffer.from("%PDF-1.7 data"), { egpUrl: "https://gp.test/x", filename: "Attach_TOR_1.pdf", key: "tor-pdfs/69099312832/Attach_TOR_1.pdf" }, { storage, parse });
    expect((await Tor.findById(tor.id).lean())?.sourceDocument?.kind).toBe("tor");
    expect(puts).toEqual(["tor-pdfs/69099312832/Attach_TOR_1.pdf"]);
    const saved = await Tor.findById(tor.id).lean();
    expect(saved?.sourceDocument).toMatchObject({ egpUrl: "https://gp.test/x", filename: "Attach_TOR_1.pdf", storageKey: "tor-pdfs/69099312832/Attach_TOR_1.pdf", textLayer: "digital", pageCount: 3 });
    expect(saved?.sourceDocument?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(saved?.sourceDocumentUrl).toBe(`/api/tors/${tor.id}/document`);
  });
});
