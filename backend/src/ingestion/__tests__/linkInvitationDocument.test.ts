import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EnrichmentJob, Tor } from "../../models";
import type { BlobStorage } from "../../storage/storage.types";
import { linkInvitationAsSourceDocument, linkStoredInvitations } from "../linkInvitationDocument";

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
  await Promise.all([Tor.deleteMany({}), EnrichmentJob.deleteMany({})]);
});

const PDF = Buffer.from("%PDF-1.4 invitation");
const PDF_SHA = createHash("sha256").update(PDF).digest("hex");
const parse = async () => ({ numpages: 3, text: "ประกาศเชิญชวน ".repeat(50) });

function fakeStorage(files: Record<string, Buffer> = {}): BlobStorage {
  return {
    async put(key: string) {
      return { key, size: 1 };
    },
    async getStream(key: string) {
      if (!files[key]) throw new Error(`no such file ${key}`);
      return Readable.from([files[key]]);
    },
    async exists(key: string) {
      return Boolean(files[key]);
    },
    publicUrl: () => null,
  };
}

function seed(over: Record<string, unknown> = {}) {
  return Tor.create({
    title: "จ้างบำรุงรักษาระบบกล้อง CCTV",
    projectCode: "69109019480",
    sourceContentHash: "egp2-hash",
    pipelineStatus: "enriched",
    ...over,
  });
}

const invitation = (torId: mongoose.Types.ObjectId) => ({
  torId,
  key: "tor-pdfs/69109019480/gproc-D0-20261008.pdf",
  fileName: "69109019480-invitation.pdf",
  content: PDF,
});

describe("linkInvitationAsSourceDocument", () => {
  it("makes the invitation the document of a TOR that has none and queues it under a hash of the file", async () => {
    const tor = await seed();
    const queued: [string, string][] = [];

    const linked = await linkInvitationAsSourceDocument(invitation(tor._id), {
      storage: fakeStorage(),
      parse,
      enqueueEnrichment: async (id, hash) => {
        queued.push([String(id), hash]);
      },
    });

    expect(linked).toBe(true);
    const saved = await Tor.findById(tor._id).lean();
    expect(saved?.sourceDocument).toMatchObject({
      kind: "invitation",
      storageKey: "tor-pdfs/69109019480/gproc-D0-20261008.pdf",
      filename: "69109019480-invitation.pdf",
      sha256: PDF_SHA,
      pageCount: 3,
      byteSize: PDF.length,
    });
    expect(saved?.sourceDocument?.egpUrl).toContain("69109019480");
    expect(saved?.sourceDocumentUrl).toBe(`/api/tors/${tor.id}/document`);
    expect(saved?.sourceContentHash).toBe("egp2-hash"); // left alone for discovery's change check
    const expected = createHash("sha256").update(`egp2-hash|invitation|${PDF_SHA}`).digest("hex");
    expect(queued).toEqual([[tor.id, expected]]);
  });

  it("re-queues a TOR whose earlier enrichment job is done", async () => {
    const tor = await seed();
    await EnrichmentJob.create({ torId: tor._id, sourceContentHash: "egp2-hash", status: "done" });

    await linkInvitationAsSourceDocument(invitation(tor._id), { storage: fakeStorage(), parse });

    const job = await EnrichmentJob.findOne({ torId: tor._id }).lean();
    expect(job?.status).toBe("queued");
    expect(job?.sourceContentHash).not.toBe("egp2-hash");
  });

  it("never replaces a document the TOR already has", async () => {
    const tor = await seed({
      sourceDocument: { egpUrl: "https://e/x", filename: "tor.pdf", storageKey: "tor-pdfs/x/tor.pdf", textLayer: "digital", kind: "tor" },
    });
    const enqueueEnrichment = jest.fn();

    expect(await linkInvitationAsSourceDocument(invitation(tor._id), { storage: fakeStorage(), parse, enqueueEnrichment })).toBe(false);
    expect((await Tor.findById(tor._id).lean())?.sourceDocument?.storageKey).toBe("tor-pdfs/x/tor.pdf");
    expect(enqueueEnrichment).not.toHaveBeenCalled();
  });

  it("links but does not queue a TOR the AI rejected as not software related", async () => {
    const tor = await seed({ pipelineStatus: "rejected" });
    const enqueueEnrichment = jest.fn();

    expect(await linkInvitationAsSourceDocument(invitation(tor._id), { storage: fakeStorage(), parse, enqueueEnrichment })).toBe(true);
    expect(enqueueEnrichment).not.toHaveBeenCalled();
  });

  it("links and queues only once when called twice", async () => {
    const tor = await seed();
    const enqueueEnrichment = jest.fn(async () => {});
    const deps = { storage: fakeStorage(), parse, enqueueEnrichment };

    expect(await linkInvitationAsSourceDocument(invitation(tor._id), deps)).toBe(true);
    expect(await linkInvitationAsSourceDocument(invitation(tor._id), deps)).toBe(false);
    expect(enqueueEnrichment).toHaveBeenCalledTimes(1);
  });
});

describe("linkStoredInvitations (backfill)", () => {
  const ann = (id: string, publishedAt: string, storageKey: string | null) => ({
    announcementId: id,
    kind: "invitation",
    hasFile: true,
    publishedAt: new Date(publishedAt),
    storageKey,
  });

  async function seedStored(code: string, over: Record<string, unknown> = {}) {
    return seed({
      projectCode: code,
      procurement: {
        stage: "awarded",
        announcements: [ann("inv-old", "2026-09-01T00:00:00Z", `tor-pdfs/${code}/inv-old.pdf`), ann("inv-new", "2026-10-01T00:00:00Z", `tor-pdfs/${code}/inv-new.pdf`)],
        lastCheckedAt: new Date("2026-10-02T00:00:00Z"),
      },
      ...over,
    });
  }

  it("dry run lists enriched TORs with no document and a stored invitation, and writes nothing", async () => {
    const tor = await seedStored("11111111111");
    await seedStored("22222222222", { pipelineStatus: "rejected" });
    await seedStored("33333333333", {
      sourceDocument: { egpUrl: "https://e/x", filename: "tor.pdf", storageKey: "k", textLayer: "digital", kind: "tor" },
    });
    await seed({ projectCode: "44444444444", procurement: { stage: "inviting", announcements: [ann("inv", "2026-10-01T00:00:00Z", null)], lastCheckedAt: new Date() } });
    const enqueueEnrichment = jest.fn();

    const out = await linkStoredInvitations({ apply: false, storage: fakeStorage(), parse, enqueueEnrichment });

    expect(out.candidates).toEqual([
      { torId: tor._id, projectCode: "11111111111", stage: "awarded", key: "tor-pdfs/11111111111/inv-new.pdf" },
    ]);
    expect(out.linked).toBe(0);
    expect((await Tor.findById(tor._id).lean())?.sourceDocument ?? null).toBeNull();
    expect(enqueueEnrichment).not.toHaveBeenCalled();
  });

  it("with apply links each TOR's latest stored invitation and keeps going past a missing file", async () => {
    const a = await seedStored("11111111111");
    const b = await seedStored("22222222222");
    const storage = fakeStorage({ "tor-pdfs/22222222222/inv-new.pdf": PDF }); // a's file is missing
    const enqueueEnrichment = jest.fn(async () => {});

    const out = await linkStoredInvitations({ apply: true, storage, parse, enqueueEnrichment });

    expect(out.linked).toBe(1);
    expect(out.failed).toEqual([{ projectCode: "11111111111", error: "no such file tor-pdfs/11111111111/inv-new.pdf" }]);
    expect((await Tor.findById(a._id).lean())?.sourceDocument ?? null).toBeNull();
    expect((await Tor.findById(b._id).lean())?.sourceDocument).toMatchObject({
      kind: "invitation",
      storageKey: "tor-pdfs/22222222222/inv-new.pdf",
      filename: "inv-new.pdf",
    });
    expect(enqueueEnrichment).toHaveBeenCalledTimes(1);
  });
});
