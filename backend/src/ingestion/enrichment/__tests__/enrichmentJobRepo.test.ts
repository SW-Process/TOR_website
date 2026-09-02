// backend/src/ingestion/enrichment/__tests__/enrichmentJobRepo.test.ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { EnrichmentJob } from "../../../models";
import { enqueue, claimNext, complete, fail, LEASE_MS } from "../enrichmentJobRepo";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await EnrichmentJob.init(); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await EnrichmentJob.deleteMany({}); });

const torId = () => new Types.ObjectId();

describe("enqueue", () => {
  it("inserts a queued job", async () => {
    const id = torId();
    await enqueue(id, "hash-1");
    const job = await EnrichmentJob.findOne({ torId: id });
    expect(job?.status).toBe("queued");
    expect(job?.sourceContentHash).toBe("hash-1");
  });

  it("is a no-op when re-enqueued with the same hash", async () => {
    const id = torId();
    await enqueue(id, "hash-1");
    const first = await EnrichmentJob.findOne({ torId: id });
    await EnrichmentJob.updateOne({ torId: id }, { status: "done" });
    await enqueue(id, "hash-1");
    const after = await EnrichmentJob.findOne({ torId: id });
    expect(after?.status).toBe("done");
    expect(after?._id.toString()).toBe(first!._id.toString());
  });

  it("re-queues when the hash changed, resetting attempts and lock", async () => {
    const id = torId();
    await enqueue(id, "hash-1");
    await EnrichmentJob.updateOne(
      { torId: id },
      { status: "failed", attempts: 3, lockedBy: "w1", lockedUntil: new Date(), lastError: { message: "x", at: new Date() } }
    );
    await enqueue(id, "hash-2");
    const job = await EnrichmentJob.findOne({ torId: id });
    expect(job?.status).toBe("queued");
    expect(job?.sourceContentHash).toBe("hash-2");
    expect(job?.attempts).toBe(0);
    expect(job?.lockedBy).toBeNull();
    expect(job?.lastError).toBeNull();
  });
});

describe("claimNext", () => {
  it("claims a queued job, sets the lease, increments attempts", async () => {
    const id = torId();
    await enqueue(id, "h");
    const now = new Date("2026-08-31T00:00:00Z");
    const job = await claimNext("worker-A", now);
    expect(job?.torId.toString()).toBe(id.toString());
    expect(job?.status).toBe("processing");
    expect(job?.lockedBy).toBe("worker-A");
    expect(job?.lockedUntil?.getTime()).toBe(now.getTime() + LEASE_MS);
    expect(job?.attempts).toBe(1);
  });

  it("returns null when nothing is claimable", async () => {
    expect(await claimNext("worker-A")).toBeNull();
  });

  it("reclaims a processing job whose lease expired", async () => {
    const id = torId();
    await enqueue(id, "h");
    const past = new Date("2026-08-31T00:00:00Z");
    await claimNext("worker-A", past); // lease ends past + LEASE_MS
    const later = new Date(past.getTime() + LEASE_MS + 1000);
    const job = await claimNext("worker-B", later);
    expect(job?.lockedBy).toBe("worker-B");
    expect(job?.attempts).toBe(2);
  });

  it("skips a failed job until nextRunAt, then picks it up", async () => {
    const id = torId();
    await enqueue(id, "h");
    const t0 = new Date("2026-08-31T00:00:00Z");
    const claimed = await claimNext("w", t0);
    await fail(claimed!._id, "w", new Error("boom"), t0);
    expect(await claimNext("w", new Date(t0.getTime() + 1000))).toBeNull();
    const job = await claimNext("w", new Date(t0.getTime() + 61_000));
    expect(job).not.toBeNull();
  });

  it("does not claim a job at maxAttempts", async () => {
    const id = torId();
    await enqueue(id, "h");
    await EnrichmentJob.updateOne({ torId: id }, { status: "failed", attempts: 5, nextRunAt: new Date(0) });
    expect(await claimNext("w")).toBeNull();
  });
});

describe("fail", () => {
  it("schedules exponential backoff while attempts remain", async () => {
    const id = torId();
    await enqueue(id, "h");
    const t0 = new Date("2026-08-31T00:00:00Z");
    const job = await claimNext("w", t0); // attempts = 1
    await fail(job!._id, "w", new Error("boom"), t0);
    const after = await EnrichmentJob.findById(job!._id);
    expect(after?.status).toBe("failed");
    expect(after?.nextRunAt.getTime()).toBe(t0.getTime() + 60_000); // 60s * 5^0
    expect(after?.lockedBy).toBeNull();
    expect(after?.lastError?.message).toBe("boom");
  });

  it("dead-letters at maxAttempts (nextRunAt far future)", async () => {
    const id = torId();
    await enqueue(id, "h");
    await EnrichmentJob.updateOne({ torId: id }, { attempts: 5, status: "processing", lockedBy: "w" });
    const job = await EnrichmentJob.findOne({ torId: id });
    await fail(job!._id, "w", new Error("boom"));
    const after = await EnrichmentJob.findById(job!._id);
    expect(after?.status).toBe("failed");
    expect(after!.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 3.15e10); // ~ >1 year
  });

  it("ignores a fail from a worker that does not hold the lease", async () => {
    const id = torId();
    await enqueue(id, "h");
    const job = await claimNext("w1");
    await fail(job!._id, "w2", new Error("boom"));
    const after = await EnrichmentJob.findById(job!._id);
    expect(after?.status).toBe("processing");
  });
});

describe("complete", () => {
  it("marks done and clears the lock and lastError", async () => {
    const id = torId();
    await enqueue(id, "h");
    const job = await claimNext("w");
    await complete(job!._id, "w", "done");
    const after = await EnrichmentJob.findById(job!._id);
    expect(after?.status).toBe("done");
    expect(after?.lockedBy).toBeNull();
    expect(after?.lastError).toBeNull();
  });

  it("ignores a complete from a non-lease-holder", async () => {
    const id = torId();
    await enqueue(id, "h");
    const job = await claimNext("w1");
    await complete(job!._id, "w2", "done");
    const after = await EnrichmentJob.findById(job!._id);
    expect(after?.status).toBe("processing");
  });
});
