import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { IngestionRun, SystemLog } from "../../models";
import { detectStalledRuns } from "../stalledRuns";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await Promise.all([IngestionRun.deleteMany({}), SystemLog.deleteMany({})]); });

/** A "running" run that started `startedMin` minutes ago and last wrote `idleMin` minutes ago. */
async function runningRun(phase: "discovery" | "enrichment" | "lifecycle", startedMin: number, idleMin: number) {
  const run = await IngestionRun.create({ trigger: "manual", phase, status: "running" });
  await IngestionRun.collection.updateOne(
    { _id: run._id },
    {
      $set: {
        startedAt: new Date(Date.now() - startedMin * 60_000),
        updatedAt: new Date(Date.now() - idleMin * 60_000),
      },
    }
  );
  return run;
}

describe("detectStalledRuns", () => {
  it("fails a discovery run started longer than the window and logs an error", async () => {
    const run = await runningRun("discovery", 40, 0);
    const report = await detectStalledRuns();

    expect(report).toEqual({ discovery: 1, enrichment: 0, lifecycle: 0, total: 1 });
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("failed");
    const logs = await SystemLog.find({ ingestionRunId: run._id }).lean();
    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log?.severity).toBe("error");
    expect(log?.component).toBe("monitor.stalledRuns");
    expect(log?.message).toContain("discovery run marked failed");
  });

  it("fails an enrichment run silent past the job lease and logs it", async () => {
    const run = await runningRun("enrichment", 5, 11);
    expect(await detectStalledRuns()).toMatchObject({ enrichment: 1, total: 1 });
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("failed");
    expect(await SystemLog.countDocuments({ ingestionRunId: run._id, severity: "error" })).toBe(1);
  });

  it("fails a lifecycle run silent past the job lease and logs it", async () => {
    const run = await runningRun("lifecycle", 5, 11);
    expect(await detectStalledRuns()).toMatchObject({ lifecycle: 1, total: 1 });
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("failed");
    expect(await SystemLog.countDocuments({ ingestionRunId: run._id, severity: "error" })).toBe(1);
  });

  it("leaves a healthy run alone and writes no log", async () => {
    const discovery = await runningRun("discovery", 10, 0);
    const enrichment = await runningRun("enrichment", 5, 2);
    expect(await detectStalledRuns()).toEqual({ discovery: 0, enrichment: 0, lifecycle: 0, total: 0 });
    expect((await IngestionRun.findById(discovery._id).lean())?.status).toBe("running");
    expect((await IngestionRun.findById(enrichment._id).lean())?.status).toBe("running");
    expect(await SystemLog.countDocuments({})).toBe(0);
  });

  it("is idempotent: a second check finds nothing new and logs nothing more", async () => {
    await runningRun("discovery", 40, 0);
    await detectStalledRuns();
    expect(await detectStalledRuns()).toMatchObject({ total: 0 });
    expect(await SystemLog.countDocuments({})).toBe(1);
  });
});
