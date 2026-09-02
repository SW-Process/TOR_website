import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { EnrichmentJob } from "../EnrichmentJob";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await EnrichmentJob.deleteMany({}); });

describe("EnrichmentJob", () => {
  it("applies defaults", async () => {
    const torId = new mongoose.Types.ObjectId();
    const job = await EnrichmentJob.create({ torId, sourceContentHash: "abc" });
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(5);
    expect(job.lockedBy).toBeNull();
    expect(job.lockedUntil).toBeNull();
    expect(job.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(job.lastError ?? null).toBeNull();
  });

  it("enforces one job per torId", async () => {
    const torId = new mongoose.Types.ObjectId();
    await EnrichmentJob.create({ torId, sourceContentHash: "abc" });
    await EnrichmentJob.init(); // ensure indexes built
    await expect(EnrichmentJob.create({ torId, sourceContentHash: "def" })).rejects.toThrow();
  });

  it("declares the claim index", () => {
    const specs = EnrichmentJob.schema.indexes().map(([s]) => JSON.stringify(s));
    expect(specs).toContain(JSON.stringify({ status: 1, nextRunAt: 1, lockedUntil: 1 }));
  });
});
