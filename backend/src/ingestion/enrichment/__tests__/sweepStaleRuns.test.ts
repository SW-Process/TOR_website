// backend/src/ingestion/enrichment/__tests__/sweepStaleRuns.test.ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { IngestionRun } from "../../../models";
import { sweepStaleEnrichmentRuns, sweepStaleRuns } from "../sweepStaleRuns";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await IngestionRun.deleteMany({}); });

async function runningRun(phase: "enrichment" | "discovery" | "lifecycle", idleMin: number) {
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

describe("sweepStaleRuns", () => {
  it("fails a lifecycle run idle longer than a job lease and says which phase was swept", async () => {
    const run = await runningRun("lifecycle", 11);
    expect(await sweepStaleRuns("lifecycle")).toBe(1);
    const saved = await IngestionRun.findById(run._id).lean();
    expect(saved?.status).toBe("failed");
    expect(saved?.outcomeSummary).toBe("interrupted (stale lifecycle run swept)");
    expect(saved?.completedAt).toBeTruthy();
  });

  it("leaves a recently-updated lifecycle run alone", async () => {
    const run = await runningRun("lifecycle", 2);
    expect(await sweepStaleRuns("lifecycle")).toBe(0);
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("running");
  });

  it("only touches the requested phase", async () => {
    const lifecycle = await runningRun("lifecycle", 120);
    const enrichment = await runningRun("enrichment", 120);
    expect(await sweepStaleRuns("lifecycle")).toBe(1);
    expect((await IngestionRun.findById(lifecycle._id).lean())?.status).toBe("failed");
    expect((await IngestionRun.findById(enrichment._id).lean())?.status).toBe("running");
  });

  it("keeps sweepStaleEnrichmentRuns as the enrichment wrapper with its old summary text", async () => {
    const run = await runningRun("enrichment", 11);
    expect(await sweepStaleEnrichmentRuns()).toBe(1);
    expect((await IngestionRun.findById(run._id).lean())?.outcomeSummary).toBe(
      "interrupted (stale enrichment run swept)"
    );
  });
});
