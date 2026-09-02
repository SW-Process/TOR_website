// backend/src/ingestion/enrichment/__tests__/drainEnrichmentQueue.test.ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Readable } from "node:stream";
import { Tor, EnrichmentJob, IngestionRun } from "../../../models";
import { enqueue } from "../enrichmentJobRepo";
import { drainEnrichmentQueue } from "../drainEnrichmentQueue";
import type { TorExtractor, TorExtractionResult } from "../torExtractor";
import { setStorageForTest, type BlobStorage } from "../../../storage";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await EnrichmentJob.init(); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), EnrichmentJob.deleteMany({}), IngestionRun.deleteMany({})]);
  setStorageForTest(null);
});

const fakeStorage: BlobStorage = {
  put: async (key, body) => ({ key, size: body.length }),
  getStream: async () => Readable.from([Buffer.from("%PDF-1.4 fake")]) as unknown as NodeJS.ReadableStream,
  exists: async () => true,
  publicUrl: () => null,
};

const result = (over: Partial<TorExtractionResult> = {}): TorExtractionResult => ({
  isSoftwareRelated: true,
  classificationReason: "ระบบ",
  confidence: 0.9,
  category: "information-system",
  categoryTags: [],
  summary: "s",
  keyPoints: [],
  qualifications: [],
  evaluationCriteria: [],
  technologyStack: [],
  submissionDeadline: null,
  ...over,
});

function extractorReturning(...results: (TorExtractionResult | Error)[]): TorExtractor {
  let i = 0;
  return {
    id: "fake-extractor",
    extract: async () => {
      const r = results[Math.min(i++, results.length - 1)] as TorExtractionResult | Error;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

async function seedTorWithJob(over: Record<string, unknown> = {}) {
  const tor = await Tor.create({
    title: "จ้างพัฒนาระบบ",
    projectCode: `p-${Math.random()}`,
    sourceDocument: {
      egpUrl: "u", filename: "tor.pdf", storageKey: "tor-pdfs/x/y.pdf",
      textLayer: "scanned", pageCount: 2, byteSize: 10, sha256: "h", fetchedAt: new Date(),
    },
    ...over,
  });
  await enqueue(tor._id, "hash-1");
  return tor;
}

describe("drainEnrichmentQueue", () => {
  it("enriches a software TOR and marks the job done", async () => {
    setStorageForTest(fakeStorage);
    const tor = await seedTorWithJob();
    const out = await drainEnrichmentQueue({ extractor: extractorReturning(result()) });

    expect(out.enrichedOk).toBe(1);
    expect(out.enrichedRejected).toBe(0);
    const saved = await Tor.findById(tor.id).lean();
    expect(saved?.pipelineStatus).toBe("enriched");
    expect(saved?.category).toBe("information-system");
    const job = await EnrichmentJob.findOne({ torId: tor._id }).lean();
    expect(job?.status).toBe("done");
    const run = await IngestionRun.findById(out.runId).lean();
    expect(run?.phase).toBe("enrichment");
    expect(run?.status).toBe("success");
    expect(run?.stats.enrichedOk).toBe(1);
  });

  it("marks a non-software TOR rejected and the job rejected", async () => {
    setStorageForTest(fakeStorage);
    const tor = await seedTorWithJob();
    const out = await drainEnrichmentQueue({
      extractor: extractorReturning(result({ isSoftwareRelated: false, summary: null })),
    });
    expect(out.enrichedRejected).toBe(1);
    expect((await Tor.findById(tor.id).lean())?.pipelineStatus).toBe("rejected");
    expect((await EnrichmentJob.findOne({ torId: tor._id }).lean())?.status).toBe("rejected");
  });

  it("marks the job failed and the TOR failed on an extractor error, and keeps going", async () => {
    setStorageForTest(fakeStorage);
    const a = await seedTorWithJob();
    const b = await seedTorWithJob();
    const out = await drainEnrichmentQueue({
      extractor: extractorReturning(new Error("boom"), result()),
    });
    expect(out.enrichedFailed).toBe(1);
    expect(out.enrichedOk).toBe(1);
    const failedTor = await Tor.findById(a.id).lean();
    const okTor = await Tor.findById(b.id).lean();
    // order is by nextRunAt/createdAt; whichever failed has pipelineStatus "failed"
    const statuses = [failedTor?.pipelineStatus, okTor?.pipelineStatus].sort();
    expect(statuses).toEqual(["enriched", "failed"]);
    const run = await IngestionRun.findById(out.runId).lean();
    expect(run?.status).toBe("partial");
  });

  it("stops after maxCalls and leaves the rest queued", async () => {
    setStorageForTest(fakeStorage);
    await seedTorWithJob();
    await seedTorWithJob();
    await seedTorWithJob();
    const out = await drainEnrichmentQueue({ extractor: extractorReturning(result()), maxCalls: 2 });
    expect(out.claimed).toBe(2);
    const queued = await EnrichmentJob.countDocuments({ status: "queued" });
    expect(queued).toBe(1);
  });

  it("completes a job whose TOR vanished", async () => {
    setStorageForTest(fakeStorage);
    const tor = await seedTorWithJob();
    await Tor.deleteOne({ _id: tor._id });
    const out = await drainEnrichmentQueue({ extractor: extractorReturning(result()) });
    expect(out.enrichedOk).toBe(0);
    expect((await EnrichmentJob.findOne({ torId: tor._id }).lean())?.status).toBe("done");
  });
});
