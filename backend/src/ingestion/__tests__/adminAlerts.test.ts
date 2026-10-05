import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { AdminNotification, IngestionRun, SystemLog, User } from "../../models";
import { setEmailSenderForTest } from "../../email";
import { detectStalledRuns } from "../stalledRuns";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  setEmailSenderForTest(null);
  delete process.env.ADMIN_ALERT_EMAILS;
  await Promise.all([
    AdminNotification.deleteMany({}), IngestionRun.deleteMany({}), SystemLog.deleteMany({}), User.deleteMany({}),
  ]);
});

const sent: Array<{ to: string; subject: string; text: string }> = [];
const fakeSender = { send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); } };

async function staleRun() {
  const run = await IngestionRun.create({ trigger: "manual", phase: "discovery", status: "running" });
  await IngestionRun.collection.updateOne(
    { _id: run._id },
    { $set: { startedAt: new Date(Date.now() - 40 * 60_000) } }
  );
  return run;
}

async function user(email: string, role: "admin" | "vendor") {
  return User.create({ email, passwordHash: "x", role });
}

describe("admin alerts for failed runs", () => {
  it("creates an in-app notification for every admin, and none for vendors", async () => {
    const a1 = await user("a1@test.com", "admin");
    const a2 = await user("a2@test.com", "admin");
    const v = await user("v@test.com", "vendor");
    const run = await staleRun();
    setEmailSenderForTest(fakeSender);

    await detectStalledRuns();

    const rows = await AdminNotification.find({ ingestionRunId: run._id }).lean();
    expect(rows.map((r) => String(r.adminId)).sort()).toEqual([String(a1._id), String(a2._id)].sort());
    expect(rows.some((r) => String(r.adminId) === String(v._id))).toBe(false);
    expect(rows[0]?.message).toContain("discovery run");
    expect(rows[0]?.read).toBe(false);
  });

  it("emails each address in ADMIN_ALERT_EMAILS once, with the failed runs listed", async () => {
    await user("a1@test.com", "admin");
    const run = await staleRun();
    process.env.ADMIN_ALERT_EMAILS = " ops@example.com, lead@example.com ,";
    sent.length = 0;
    setEmailSenderForTest(fakeSender);

    await detectStalledRuns();

    expect(sent.map((m) => m.to)).toEqual(["ops@example.com", "lead@example.com"]);
    expect(sent[0]?.subject).toBe("[TOR] 1 pipeline run(s) failed or stalled");
    expect(sent[0]?.text).toContain(String(run._id));
  });

  it("sends no email when ADMIN_ALERT_EMAILS is blank, but still creates the in-app notice", async () => {
    await user("a1@test.com", "admin");
    await staleRun();
    sent.length = 0;
    setEmailSenderForTest(fakeSender);

    await detectStalledRuns();

    expect(sent).toHaveLength(0);
    expect(await AdminNotification.countDocuments({})).toBe(1);
  });

  it("a failing email is logged as a warning and does not stop the run from being failed", async () => {
    await user("a1@test.com", "admin");
    const run = await staleRun();
    process.env.ADMIN_ALERT_EMAILS = "ops@example.com";
    setEmailSenderForTest({ send: async () => { throw new Error("smtp down"); } });

    const report = await detectStalledRuns();

    expect(report.discovery).toBe(1);
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("failed");
    const warnings = await SystemLog.find({ severity: "warning" }).lean();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("ops@example.com");
  });
});
