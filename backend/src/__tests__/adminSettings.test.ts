import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";

import app from "../app";
import { Setting, User } from "../models";
import { DEFAULT_FAIRNESS_PREFILTER } from "../ingestion/enrichment/fairnessPrefilter";
import { getFairnessPrefilter } from "../services/fairnessSettings";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Setting.deleteMany({}), User.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentWithRole(email: string, role: "admin" | "vendor") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "plum-orchard-ladder-17" });
  await User.updateOne({ email }, { role });
  await agent.post("/api/auth/login").send({ email, password: "plum-orchard-ladder-17" });
  return agent;
}

const URL = "/api/admin/settings/fairness-prefilter";
const valid = { budgetDeviationPercent: 40, minBidWindowDays: 10, minSeverity: "medium" };

describe("/api/admin/settings/fairness-prefilter", () => {
  it("is admin-only", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
    expect((await request(app).put(URL).send(valid)).status).toBe(401);
    const vendor = await agentWithRole("vendor@test.com", "vendor");
    expect((await vendor.get(URL)).status).toBe(403);
    expect((await vendor.put(URL).send(valid)).status).toBe(403);
  });

  it("returns the defaults before anything is saved", async () => {
    const admin = await agentWithRole("admin@test.com", "admin");
    const res = await admin.get(URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      settings: DEFAULT_FAIRNESS_PREFILTER,
      defaults: DEFAULT_FAIRNESS_PREFILTER,
      isDefault: true,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("saves the thresholds and returns them with who changed them", async () => {
    const admin = await agentWithRole("admin@test.com", "admin");
    const adminId = String((await User.findOne({ email: "admin@test.com" }).lean())!._id);

    const put = await admin.put(URL).send(valid);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ settings: valid, isDefault: false, updatedBy: adminId });
    expect(put.body.updatedAt).toEqual(expect.any(String));

    const get = await admin.get(URL);
    expect(get.body).toMatchObject({ settings: valid, defaults: DEFAULT_FAIRNESS_PREFILTER, isDefault: false });
    expect(await Setting.countDocuments({ key: "fairness-prefilter" })).toBe(1);
  });

  it("replaces the previous values on a second save", async () => {
    const admin = await agentWithRole("admin@test.com", "admin");
    await admin.put(URL).send(valid);
    const next = { budgetDeviationPercent: 25, minBidWindowDays: 5, minSeverity: "high" };
    expect((await admin.put(URL).send(next)).status).toBe(200);
    expect((await admin.get(URL)).body.settings).toEqual(next);
    expect(await Setting.countDocuments({})).toBe(1);
  });

  it.each([
    ["a missing field", { budgetDeviationPercent: 40, minBidWindowDays: 10 }],
    ["a percentage below 1", { ...valid, budgetDeviationPercent: 0 }],
    ["a percentage above 500", { ...valid, budgetDeviationPercent: 501 }],
    ["a fractional number of days", { ...valid, minBidWindowDays: 3.5 }],
    ["more than 90 days", { ...valid, minBidWindowDays: 91 }],
    ["an unknown severity", { ...valid, minSeverity: "critical" }],
    ["a number sent as text", { ...valid, budgetDeviationPercent: "40" }],
    ["an unknown field", { ...valid, enabled: true }],
  ])("rejects %s with 400 and keeps the old values", async (_label, body) => {
    const admin = await agentWithRole("admin@test.com", "admin");
    await admin.put(URL).send(valid);
    const res = await admin.put(URL).send(body);
    expect(res.status).toBe(400);
    expect((await admin.get(URL)).body.settings).toEqual(valid);
  });
});

describe("getFairnessPrefilter", () => {
  it("falls back to the defaults when the stored value is invalid", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await Setting.create({ key: "fairness-prefilter", value: { budgetDeviationPercent: -5 } });
      const s = await getFairnessPrefilter();
      expect(s.thresholds).toEqual(DEFAULT_FAIRNESS_PREFILTER);
      expect(s.isDefault).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
