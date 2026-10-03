// backend/src/ingestion/enrichment/__tests__/sweepStaleRuns.test.ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { IngestionRun } from "../../../models";
import { sweepStaleEnrichmentRuns } from "../sweepStaleRuns";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await IngestionRun.deleteMany({}); });

async function runningRun(phase: "enrichment" | "discovery", idleMin: number) {
  const run = await IngestionRun.create({ trigger: "manual", phase, status: "running" });
  await IngestionRun.collection.updateOne(
    { _id: run._id },
    { $set: { updatedAt: new Date(Date.now() - idleMin * 60_000) } }
  );
  return run;
}

describe("sweepStaleEnrichmentRuns", () => {
  it("fails an enrichment run silent for longer than a job lease", async () => {
    const run = await runningRun("enrichment", 11);
    expect(await sweepStaleEnrichmentRuns()).toBe(1);
    const saved = await IngestionRun.findById(run._id).lean();
    expect(saved?.status).toBe("failed");
    expect(saved?.completedAt).toBeTruthy();
  });

  it("leaves a recently-updated run alone", async () => {
    const run = await runningRun("enrichment", 2);
    expect(await sweepStaleEnrichmentRuns()).toBe(0);
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("running");
  });

  it("never touches a discovery run", async () => {
    const run = await runningRun("discovery", 120);
    expect(await sweepStaleEnrichmentRuns()).toBe(0);
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("running");
  });
});
