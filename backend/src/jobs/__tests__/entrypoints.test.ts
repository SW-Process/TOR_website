import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

jest.mock("../../config/db", () => ({
  connectDB: jest.fn(async () => undefined),
}));

const runIngestion = jest.fn(async () => ({ runId: "r1", done: Promise.resolve() }));
const markInterruptedRunsFailed = jest.fn(async () => 0);
jest.mock("../../ingestion/runIngestion", () => ({ runIngestion, markInterruptedRunsFailed }));

const drainEnrichmentQueue = jest.fn(async () => ({
  runId: "r2",
  claimed: 0,
  enrichedOk: 0,
  enrichedRejected: 0,
  enrichedFailed: 0,
}));
jest.mock("../../ingestion/enrichment/drainEnrichmentQueue", () => ({ drainEnrichmentQueue }));

// ADAPTATION (documented in the report): stub GeminiExtractor so the enrichment
// entrypoint's factory does not pull in @google/genai or try to build a Vertex
// client during the unit test. The real class is exercised by its own suite.
class FakeGeminiExtractor {
  readonly id = "fake-gemini";
  async extract() {
    throw new Error("not used in this test");
  }
}
jest.mock("../../ingestion/enrichment/geminiExtractor", () => ({
  GeminiExtractor: FakeGeminiExtractor,
}));

describe("job entrypoints", () => {
  let mongod: MongoMemoryServer;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });
  // ADAPTATION (documented in the report): the brief asserts `process.exitCode`
  // is 0 on the happy path, but Node leaves it `undefined` until something sets
  // it. Normalise to 0 before every test so "stayed 0" is a real assertion.
  beforeEach(() => {
    process.exitCode = 0;
  });
  afterEach(() => {
    jest.clearAllMocks();
    process.exitCode = 0;
    delete process.env.EXTRACTOR;
  });

  it("runDiscoveryJob sweeps, runs ingestion, and awaits done", async () => {
    let doneAwaited = false;
    runIngestion.mockResolvedValueOnce({
      runId: "r1",
      done: Promise.resolve().then(() => {
        doneAwaited = true;
      }),
    });
    const { runDiscoveryJob } = await import("../discovery");
    await runDiscoveryJob();
    expect(markInterruptedRunsFailed).toHaveBeenCalledTimes(1);
    expect(runIngestion).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "scheduled", triggeredBy: null }),
      expect.anything()
    );
    expect(doneAwaited).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("runEnrichmentJob drains the queue", async () => {
    const { runEnrichmentJob } = await import("../enrichment");
    await runEnrichmentJob();
    expect(drainEnrichmentQueue).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("sets exitCode 1 when the work throws", async () => {
    drainEnrichmentQueue.mockRejectedValueOnce(new Error("boom"));
    const { runEnrichmentJob } = await import("../enrichment");
    await runEnrichmentJob();
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode 1 for an unknown EXTRACTOR", async () => {
    process.env.EXTRACTOR = "bogus";
    const { runEnrichmentJob } = await import("../enrichment");
    await runEnrichmentJob();
    expect(drainEnrichmentQueue).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
