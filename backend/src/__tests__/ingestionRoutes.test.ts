import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

const runIngestionMock = jest.fn();
jest.mock("../ingestion/runIngestion", () => ({
  runIngestion: (...args: unknown[]) => runIngestionMock(...args),
}));

const drainEnrichmentQueueMock = jest.fn();
jest.mock("../ingestion/enrichment/drainEnrichmentQueue", () => ({
  drainEnrichmentQueue: (...args: unknown[]) => drainEnrichmentQueueMock(...args),
}));

const selectExtractorMock = jest.fn();
jest.mock("../jobs/enrichment", () => ({
  selectExtractor: () => selectExtractorMock(),
}));

import app from "../app";
import { User } from "../models";
import { IngestionRun, EnrichmentJob } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
  await IngestionRun.deleteMany({});
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function adminAgent() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" });
  await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
  // re-login so the session cookie carries role=admin
  await agent.post("/api/auth/login").send({ email: "admin@test.com", password: "secret123" });
  return agent;
}

describe("POST /api/ingestion/runs", () => {
  it("401 without a session", async () => {
    const res = await request(app).post("/api/ingestion/runs").send({});
    expect(res.status).toBe(401);
  });

  it("403 for a vendor", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v@test.com", password: "secret123" });
    const res = await agent.post("/api/ingestion/runs").send({});
    expect(res.status).toBe(403);
  });

  it("202 with a runId for an admin and calls runIngestion once", async () => {
    runIngestionMock.mockResolvedValue({ runId: "run-123", done: Promise.resolve() });
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/runs").send({ maxProjects: 5, searchText: "ระบบ" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ runId: "run-123", status: "running" });
    expect(runIngestionMock).toHaveBeenCalledTimes(1);
    expect(runIngestionMock.mock.calls[0][0]).toMatchObject({
      trigger: "manual",
      maxProjects: 5,
      searchText: "ระบบ",
    });
  });

  it("400 when maxProjects is out of range", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/runs").send({ maxProjects: 9999 });
    expect(res.status).toBe(400);
    expect(runIngestionMock).not.toHaveBeenCalled();
  });

  it("400 when lookbackDays is out of range", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/runs").send({ lookbackDays: 6001 });
    expect(res.status).toBe(400);
    expect(runIngestionMock).not.toHaveBeenCalled();
  });

  it("passes lookbackDays through to runIngestion", async () => {
    runIngestionMock.mockResolvedValue({ runId: "run-789", done: Promise.resolve() });
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/runs").send({ lookbackDays: 14 });

    expect(res.status).toBe(202);
    expect(runIngestionMock.mock.calls[0][0]).toMatchObject({ lookbackDays: 14 });
  });

  it("409 when a run is already in progress", async () => {
    await IngestionRun.create({ trigger: "manual", status: "running" });
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/runs").send({});
    expect(res.status).toBe(409);
    expect(runIngestionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ingestion/enrichment/runs", () => {
  it("401 without a session", async () => {
    const res = await request(app).post("/api/ingestion/enrichment/runs").send({});
    expect(res.status).toBe(401);
  });

  it("403 for a vendor", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v2@test.com", password: "secret123" });
    const res = await agent.post("/api/ingestion/enrichment/runs").send({});
    expect(res.status).toBe(403);
  });

  it("202 for an admin and drains the enrichment queue once", async () => {
    const extractor = { id: "fake", extract: jest.fn() };
    selectExtractorMock.mockReturnValue(extractor);
    drainEnrichmentQueueMock.mockResolvedValue({
      runId: "run-456",
      claimed: 0,
      enrichedOk: 0,
      enrichedRejected: 0,
      enrichedFailed: 0,
    });
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/enrichment/runs").send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "running" });
    expect(drainEnrichmentQueueMock).toHaveBeenCalledTimes(1);
    expect(drainEnrichmentQueueMock.mock.calls[0][0]).toMatchObject({ extractor });
  });

  it("passes an explicit maxCalls through to the drain", async () => {
    selectExtractorMock.mockReturnValue({ id: "fake", extract: jest.fn() });
    drainEnrichmentQueueMock.mockResolvedValue({
      runId: "r",
      claimed: 0,
      enrichedOk: 0,
      enrichedRejected: 0,
      enrichedFailed: 0,
    });
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/enrichment/runs").send({ maxCalls: 7 });

    expect(res.status).toBe(202);
    expect(drainEnrichmentQueueMock.mock.calls[0][0]).toMatchObject({ maxCalls: 7 });
  });

  it.each([0, -1, 1.5, 201, "abc"])("400 when maxCalls is %p", async (maxCalls) => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/enrichment/runs").send({ maxCalls });
    expect(res.status).toBe(400);
    expect(drainEnrichmentQueueMock).not.toHaveBeenCalled();
  });

  it("sweeps an idle (dead-worker) run instead of blocking on it with 409", async () => {
    selectExtractorMock.mockReturnValue({ id: "fake", extract: jest.fn() });
    drainEnrichmentQueueMock.mockResolvedValue({
      runId: "r",
      claimed: 0,
      enrichedOk: 0,
      enrichedRejected: 0,
      enrichedFailed: 0,
    });
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "enrichment", status: "running" });
    // bypass mongoose timestamps so the row looks untouched for 11 minutes
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/enrichment/runs").send({});

    expect(res.status).toBe(202);
    expect((await IngestionRun.findById(dead._id).lean())?.status).toBe("failed");
  });

  it("409 when an enrichment run is already in progress", async () => {
    await IngestionRun.create({ trigger: "scheduled", phase: "enrichment", status: "running" });
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/enrichment/runs").send({});
    expect(res.status).toBe(409);
    expect(drainEnrichmentQueueMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/ingestion/enrichment/pending", () => {
  const OLD_MAX = process.env.MAX_AI_CALLS_PER_RUN;
  afterEach(async () => {
    await EnrichmentJob.deleteMany({});
    if (OLD_MAX === undefined) delete process.env.MAX_AI_CALLS_PER_RUN;
    else process.env.MAX_AI_CALLS_PER_RUN = OLD_MAX;
  });

  it("401 without a session", async () => {
    const res = await request(app).get("/api/ingestion/enrichment/pending");
    expect(res.status).toBe(401);
  });

  it("403 for a vendor", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v3@test.com", password: "secret123" });
    const res = await agent.get("/api/ingestion/enrichment/pending");
    expect(res.status).toBe(403);
  });

  it("reports runnable jobs capped by MAX_AI_CALLS_PER_RUN", async () => {
    process.env.MAX_AI_CALLS_PER_RUN = "2";
    for (let i = 0; i < 3; i++) {
      await EnrichmentJob.create({ torId: new mongoose.Types.ObjectId(), sourceContentHash: `h${i}` });
    }
    // terminal jobs are not runnable
    await EnrichmentJob.create({
      torId: new mongoose.Types.ObjectId(),
      sourceContentHash: "done",
      status: "done",
    });
    const agent = await adminAgent();

    const res = await agent.get("/api/ingestion/enrichment/pending");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runnable: 3, maxCalls: 2, willProcess: 2 });
  });

  it("reports zero when the queue is empty", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/ingestion/enrichment/pending");
    expect(res.body.runnable).toBe(0);
    expect(res.body.willProcess).toBe(0);
  });
});

describe("GET /api/ingestion/runs", () => {
  it("reports an idle enrichment run as failed rather than running", async () => {
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "enrichment", status: "running" });
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    const agent = await adminAgent();
    const res = await agent.get("/api/ingestion/runs");
    expect(res.body.runs[0].status).toBe("failed");
  });

  it("lists runs newest first for an admin", async () => {
    const agent = await adminAgent();
    await IngestionRun.create({ trigger: "manual", startedAt: new Date("2026-08-01"), status: "success" });
    await IngestionRun.create({ trigger: "manual", startedAt: new Date("2026-08-10"), status: "failed" });

    const res = await agent.get("/api/ingestion/runs");
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(2);
    expect(res.body.runs[0].status).toBe("failed");
  });

  it("404 for an unknown run id", async () => {
    const agent = await adminAgent();
    const res = await agent.get(`/api/ingestion/runs/${new mongoose.Types.ObjectId().toString()}`);
    expect(res.status).toBe(404);
  });
});
