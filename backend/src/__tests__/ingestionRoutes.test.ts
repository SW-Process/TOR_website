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

const refreshLifecycleMock = jest.fn();
jest.mock("../ingestion/lifecycle/refreshLifecycle", () => ({
  refreshLifecycle: (...args: unknown[]) => refreshLifecycleMock(...args),
}));

const captureProjectsMock = jest.fn();
jest.mock("../ingestion/capture/captureProjects", () => ({
  captureProjects: (...args: unknown[]) => captureProjectsMock(...args),
}));

const selectExtractorMock = jest.fn();
jest.mock("../jobs/enrichment", () => ({
  selectExtractor: () => selectExtractorMock(),
}));

import app from "../app";
import { User } from "../models";
import { IngestionRun, EnrichmentJob, Tor } from "../models";

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

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

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

  it("chains a manual lifecycle refresh for the TORs the drain enriched", async () => {
    const extractor = { id: "fake", extract: jest.fn() };
    selectExtractorMock.mockReturnValue(extractor);
    refreshLifecycleMock.mockResolvedValue({});
    drainEnrichmentQueueMock.mockResolvedValue({
      runId: "r",
      claimed: 2,
      enrichedOk: 2,
      enrichedRejected: 0,
      enrichedFailed: 0,
      enrichedTorIds: ["t1", "t2"],
    });
    const agent = await adminAgent();
    const admin = await User.findOne({ email: "admin@test.com" });

    const res = await agent.post("/api/ingestion/enrichment/runs").send({});

    expect(res.status).toBe(202);
    await waitFor(() => refreshLifecycleMock.mock.calls.length > 0);
    expect(refreshLifecycleMock).toHaveBeenCalledTimes(1);
    expect(refreshLifecycleMock.mock.calls[0][0]).toEqual({
      torIds: ["t1", "t2"],
      trigger: "manual",
      triggeredBy: admin!.id,
      deadlineExtractor: extractor,
    });
  });

  it("does not chain a lifecycle refresh when nothing was enriched", async () => {
    selectExtractorMock.mockReturnValue({ id: "fake", extract: jest.fn() });
    drainEnrichmentQueueMock.mockResolvedValue({
      runId: "",
      claimed: 0,
      enrichedOk: 0,
      enrichedRejected: 0,
      enrichedFailed: 0,
      enrichedTorIds: [],
    });
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/enrichment/runs").send({});

    expect(res.status).toBe(202);
    await waitFor(() => drainEnrichmentQueueMock.mock.results.length > 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
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

describe("POST /api/ingestion/lifecycle/runs", () => {
  const settled = {
    runId: "r",
    selected: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  it("401 without a session", async () => {
    expect((await request(app).post("/api/ingestion/lifecycle/runs").send({})).status).toBe(401);
  });

  it("403 for a vendor", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v4@test.com", password: "secret123" });
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(403);
  });

  it("202 for an admin and starts one manual refresh", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "running" });
    expect(refreshLifecycleMock).toHaveBeenCalledTimes(1);
    expect(refreshLifecycleMock.mock.calls[0][0]).toMatchObject({
      trigger: "manual",
      triggeredBy: expect.any(String),
    });
    expect(refreshLifecycleMock.mock.calls[0][0].maxTors).toBeUndefined();
  });

  it("passes an explicit maxTors through", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({ maxTors: 7 });
    expect(res.status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0]).toMatchObject({ maxTors: 7 });
  });

  it("passes an explicit maxDeadlineExtractions through, and leaves it undefined when absent", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({ maxDeadlineExtractions: 40 })).status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0]).toMatchObject({ maxDeadlineExtractions: 40 });
    refreshLifecycleMock.mockClear();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0].maxDeadlineExtractions).toBeUndefined();
  });

  it.each([0, -1, 1.5, 201, "abc"])("400 when maxDeadlineExtractions is %p", async (maxDeadlineExtractions) => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({ maxDeadlineExtractions });
    expect(res.status).toBe(400);
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
  });

  it("passes a boolean onlyOpen through and leaves it undefined when absent", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({ onlyOpen: true })).status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0].onlyOpen).toBe(true);
    refreshLifecycleMock.mockClear();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0].onlyOpen).toBeUndefined();
  });

  it.each(["yes", 1, "true", null])("400 when onlyOpen is %p", async (onlyOpen) => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({ onlyOpen });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/onlyOpen/);
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
  });

  it("hands the selected extractor to the refresh", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const extractor = { extractBidDeadline: jest.fn() };
    selectExtractorMock.mockReturnValueOnce(extractor);
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0].deadlineExtractor).toBe(extractor);
  });

  it("still runs the refresh, without deadline extraction, when the extractor cannot be created", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    selectExtractorMock.mockImplementationOnce(() => {
      throw new Error("unknown EXTRACTOR: x");
    });
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});
    expect(res.status).toBe(202);
    expect(refreshLifecycleMock).toHaveBeenCalledTimes(1);
    expect(refreshLifecycleMock.mock.calls[0][0].deadlineExtractor).toBeUndefined();
  });

  it.each([0, -1, 1.5, 301, "abc"])("400 when maxTors is %p", async (maxTors) => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({ maxTors });
    expect(res.status).toBe(400);
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
  });

  it("409 when a lifecycle run is already in progress", async () => {
    await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});
    expect(res.status).toBe(409);
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
  });

  it("is not blocked by a running run of another phase", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    await IngestionRun.create({ trigger: "scheduled", phase: "enrichment", status: "running" });
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(202);
  });

  it("sweeps a dead (idle) lifecycle run instead of blocking on it with 409", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});

    expect(res.status).toBe(202);
    expect((await IngestionRun.findById(dead._id).lean())?.status).toBe("failed");
  });
});

describe("GET /api/ingestion/lifecycle/pending", () => {
  const OLD_MAX = process.env.MAX_LIFECYCLE_REFRESH_PER_RUN;
  afterEach(async () => {
    await Tor.deleteMany({});
    if (OLD_MAX === undefined) delete process.env.MAX_LIFECYCLE_REFRESH_PER_RUN;
    else process.env.MAX_LIFECYCLE_REFRESH_PER_RUN = OLD_MAX;
  });

  it("401 without a session and 403 for a vendor", async () => {
    expect((await request(app).get("/api/ingestion/lifecycle/pending")).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v5@test.com", password: "secret123" });
    expect((await agent.get("/api/ingestion/lifecycle/pending")).status).toBe(403);
  });

  it("reports eligible TORs capped by MAX_LIFECYCLE_REFRESH_PER_RUN", async () => {
    process.env.MAX_LIFECYCLE_REFRESH_PER_RUN = "2";
    const url = (id: string) => `https://egp.test/project-detail/${id}`;
    await Tor.create([
      { title: "a", pipelineStatus: "enriched", sourceListingUrl: url("a") },
      { title: "b", pipelineStatus: "enriched", sourceListingUrl: url("b") },
      { title: "c", pipelineStatus: "enriched", sourceListingUrl: url("c") },
      { title: "pending", pipelineStatus: "pending", sourceListingUrl: url("d") },
      {
        title: "cancelled",
        pipelineStatus: "enriched",
        sourceListingUrl: url("e"),
        procurement: { stage: "cancelled", announcements: [], lastCheckedAt: new Date() },
      },
    ]);
    const agent = await adminAgent();

    const res = await agent.get("/api/ingestion/lifecycle/pending");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: 3, maxTors: 2, willCheck: 2, maxDeadlineExtractions: 20 });
  });

  it("counts only inviting TORs with onlyOpen=1 / true", async () => {
    const url = (id: string) => `https://egp.test/project-detail/${id}`;
    const p = (stage: string) => ({ stage, announcements: [], lastCheckedAt: new Date() });
    await Tor.create([
      { title: "open", pipelineStatus: "enriched", sourceListingUrl: url("a"), procurement: p("inviting") },
      { title: "draft", pipelineStatus: "enriched", sourceListingUrl: url("b"), procurement: p("draft") },
      { title: "unchecked", pipelineStatus: "enriched", sourceListingUrl: url("c") },
    ] as any);
    const agent = await adminAgent();
    expect((await agent.get("/api/ingestion/lifecycle/pending?onlyOpen=1")).body).toMatchObject({ candidates: 1, willCheck: 1 });
    expect((await agent.get("/api/ingestion/lifecycle/pending?onlyOpen=true")).body.candidates).toBe(1);
    expect((await agent.get("/api/ingestion/lifecycle/pending?onlyOpen=0")).body.candidates).toBe(3);
    expect((await agent.get("/api/ingestion/lifecycle/pending")).body.candidates).toBe(3);
  });

  it("reports zero when nothing is eligible", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/ingestion/lifecycle/pending");
    expect(res.body.candidates).toBe(0);
    expect(res.body.willCheck).toBe(0);
  });
});

describe("GET /api/ingestion/runs", () => {
  it("reports an idle lifecycle run as failed rather than running", async () => {
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    const agent = await adminAgent();
    const res = await agent.get("/api/ingestion/runs");
    expect(res.body.runs[0].status).toBe("failed");
  });

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

  it("reports an idle capture run as failed rather than running", async () => {
    const dead = await IngestionRun.create({ trigger: "manual", phase: "capture", status: "running" });
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

describe("POST /api/ingestion/capture", () => {
  const body = { projects: [{ projectCode: "69099312832", title: "ระบบสารสนเทศ", agency: "สำนักดิจิทัล" }, { projectCode: "69099314442" }] };
  const prev = process.env.GPROC_ENABLED;
  beforeEach(() => { process.env.GPROC_ENABLED = "true"; captureProjectsMock.mockResolvedValue(undefined); });
  afterAll(() => { process.env.GPROC_ENABLED = prev; });

  it("401 without a session and 403 for a non-admin", async () => {
    expect((await request(app).post("/api/ingestion/capture").send(body)).status).toBe(401);
    const a = request.agent(app);
    await a.post("/api/auth/register").send({ email: "v@test.com", password: "secret123" });
    expect((await a.post("/api/ingestion/capture").send(body)).status).toBe(403);
  });

  it("202, creates a running capture run and hands the projects to captureProjects", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/capture").send(body);
    expect(res.status).toBe(202);
    const run = await IngestionRun.findById(res.body.runId).lean();
    expect(run).toMatchObject({ phase: "capture", trigger: "manual", status: "running" });
    expect(run?.stats.torsFound).toBe(2);
    await waitFor(() => captureProjectsMock.mock.calls.length === 1);
    expect(captureProjectsMock.mock.calls[0]?.[1]).toEqual(body.projects);
  });

  it.each([
    ["no body", undefined],
    ["projects not an array", { projects: "69099312832" }],
    ["empty projects", { projects: [] }],
    ["a bad code", { projects: [{ projectCode: "1234" }] }],
    ["a non-object entry", { projects: ["69099312832"] }],
    ["a long title", { projects: [{ projectCode: "69099312832", title: "x".repeat(501) }] }],
    ["a non-string agency", { projects: [{ projectCode: "69099312832", agency: 5 }] }],
    ["more than 100", { projects: Array.from({ length: 101 }, (_, i) => ({ projectCode: String(10000000000 + i) })) }],
  ])("400 for %s", async (_name, payload) => {
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/capture").send(payload as object)).status).toBe(400);
    expect(captureProjectsMock).not.toHaveBeenCalled();
  });

  it("drops duplicate project numbers", async () => {
    const agent = await adminAgent();
    await agent.post("/api/ingestion/capture").send({ projects: [{ projectCode: "69099312832" }, { projectCode: "69099312832", title: "ซ้ำ" }] });
    await waitFor(() => captureProjectsMock.mock.calls.length === 1);
    expect(captureProjectsMock.mock.calls[0]?.[1]).toEqual([{ projectCode: "69099312832" }]);
  });

  it("409 while a capture run is running", async () => {
    const agent = await adminAgent();
    await IngestionRun.create({ trigger: "manual", phase: "capture", status: "running" });
    expect((await agent.post("/api/ingestion/capture").send(body)).status).toBe(409);
  });

  it("503 when the process5 source is switched off", async () => {
    process.env.GPROC_ENABLED = "false";
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/capture").send(body)).status).toBe(503);
  });

  it("marks the run failed when captureProjects rejects", async () => {
    captureProjectsMock.mockRejectedValue(new Error("boom"));
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/capture").send(body);
    const run = await (async () => {
      for (let i = 0; i < 100; i += 1) {
        const r = await IngestionRun.findById(res.body.runId).lean();
        if (r?.status === "failed") return r;
        await new Promise((x) => setTimeout(x, 10));
      }
      return IngestionRun.findById(res.body.runId).lean();
    })();
    expect(run?.status).toBe("failed");
    expect(run?.outcomeSummary).toContain("boom");
  });
});
