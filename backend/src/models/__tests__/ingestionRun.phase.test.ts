import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { IngestionRun } from "../IngestionRun";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await IngestionRun.deleteMany({}); });

describe("IngestionRun phase + enrichment stats", () => {
  it("defaults phase to 'discovery' and the new counters to 0", async () => {
    const run = await IngestionRun.create({ trigger: "scheduled" });
    expect(run.phase).toBe("discovery");
    expect(run.stats.torsSkipped).toBe(0);
    expect(run.stats.enrichedOk).toBe(0);
    expect(run.stats.enrichedRejected).toBe(0);
    expect(run.stats.enrichedFailed).toBe(0);
  });

  it("accepts phase 'enrichment' and stores the enrichment counters", async () => {
    const run = await IngestionRun.create({
      trigger: "scheduled",
      phase: "enrichment",
      stats: { torsFound: 8, enrichedOk: 5, enrichedRejected: 2, enrichedFailed: 1 },
    });
    const found = await IngestionRun.findById(run.id).lean();
    expect(found?.phase).toBe("enrichment");
    expect(found?.stats.enrichedOk).toBe(5);
    expect(found?.stats.enrichedRejected).toBe(2);
  });

  it("rejects an unknown phase", async () => {
    await expect(
      IngestionRun.create({ trigger: "scheduled", phase: "bogus" as any })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });
});
