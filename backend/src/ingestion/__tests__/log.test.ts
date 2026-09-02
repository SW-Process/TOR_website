import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SystemLog } from "../../models";
import { logIngestionEvent } from "../log";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await SystemLog.deleteMany({});
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("logIngestionEvent", () => {
  it("writes a SystemLog row tagged source=ingestion", async () => {
    const runId = new mongoose.Types.ObjectId();
    await logIngestionEvent({
      severity: "warning",
      message: "no TOR document on project 69000000001",
      component: "runIngestion",
      context: { projectNumber: "69000000001" },
      ingestionRunId: runId,
    });

    const rows = await SystemLog.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("ingestion");
    expect(rows[0]?.severity).toBe("warning");
    expect(rows[0]?.ingestionRunId?.toString()).toBe(runId.toString());
  });

  it("never throws when the write fails", async () => {
    jest.spyOn(SystemLog, "create").mockRejectedValue(new Error("db down") as never);
    await expect(
      logIngestionEvent({ severity: "error", message: "x" })
    ).resolves.toBeUndefined();
  });
});
