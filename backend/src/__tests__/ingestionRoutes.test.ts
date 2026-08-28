import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

const runIngestionMock = jest.fn();
jest.mock("../ingestion/runIngestion", () => ({
  runIngestion: (...args: unknown[]) => runIngestionMock(...args),
}));

import app from "../app";
import { User } from "../models";
import { IngestionRun } from "../models";

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

  it("409 when a run is already in progress", async () => {
    await IngestionRun.create({ trigger: "manual", status: "running" });
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/runs").send({});
    expect(res.status).toBe(409);
    expect(runIngestionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/ingestion/runs", () => {
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
