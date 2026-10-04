import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Tor, User } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), User.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function agentWithRole(role: "admin" | "vendor") {
  const email = `${role}@test.com`;
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email, password: "secret123" });
  await User.updateOne({ email }, { role });
  // re-login so the session cookie carries the role
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  return agent;
}

const flag = (status: "open" | "acknowledged") => ({
  field: "budget",
  severity: "medium",
  message: "งบประมาณสูงกว่าค่ากลางของหมวดเดียวกันอย่างชัดเจน ควรตรวจสอบเพิ่มเติม",
  status,
});

async function seed() {
  const [flagged, clean, hidden] = await Tor.create([
    {
      title: "ระบบสารบรรณ",
      agency: "สำนักการแพทย์",
      category: "information-system",
      budget: 9_000_000,
      pipelineStatus: "enriched",
      announcementDate: new Date("2026-08-01"),
      fairnessFlags: [flag("open")],
    },
    {
      title: "เว็บไซต์หน่วยงาน",
      agency: "สำนักอนามัย",
      pipelineStatus: "enriched",
      announcementDate: new Date("2026-07-01"),
      fairnessFlags: [flag("acknowledged")],
    },
    { title: "ยังไม่ enrich", pipelineStatus: "pending" },
  ]);
  return { flagged: String(flagged!._id), clean: String(clean!._id), hidden: String(hidden!._id) };
}

describe("/api/admin/tors", () => {
  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/tors")).status).toBe(401);
    const vendor = await agentWithRole("vendor");
    expect((await vendor.get("/api/admin/tors")).status).toBe(403);
  });

  it("lists public TORs with their flags, a flagged count, and a flagged-only filter", async () => {
    await seed();
    const admin = await agentWithRole("admin");

    const all = await admin.get("/api/admin/tors");
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ totalCount: 2, flaggedCount: 1 });
    expect(all.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ", "เว็บไซต์หน่วยงาน"]);
    expect(all.body.data[0].fairnessFlags[0]).toMatchObject({ field: "budget", status: "open" });

    const flagged = await admin.get("/api/admin/tors?flagged=true");
    expect(flagged.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ"]);
    expect(flagged.body.totalCount).toBe(1);

    // Public filters still apply, and the badge count ignores them.
    const byAgency = await admin.get("/api/admin/tors?agency=" + encodeURIComponent("สำนักอนามัย"));
    expect(byAgency.body).toMatchObject({ totalCount: 1, flaggedCount: 1 });
  });

  it("corrects fields and marks open flags as reviewed", async () => {
    const { flagged } = await seed();
    const admin = await agentWithRole("admin");

    const res = await admin.patch(`/api/admin/tors/${flagged}`).send({
      title: "ระบบสารบรรณอิเล็กทรอนิกส์",
      budget: 900_000,
      category: "software-development",
      submissionDeadline: "2026-09-30",
      resolveFlags: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.tor).toMatchObject({
      title: "ระบบสารบรรณอิเล็กทรอนิกส์",
      budget: 900_000,
      category: "software-development",
    });
    expect(res.body.tor.fairnessFlags[0].status).toBe("acknowledged");

    const after = await admin.get("/api/admin/tors?flagged=true");
    expect(after.body.flaggedCount).toBe(0);

    // null clears a wrongly extracted deadline.
    await admin.patch(`/api/admin/tors/${flagged}`).send({ submissionDeadline: null });
    expect((await Tor.findById(flagged).lean())!.submissionDeadline).toBeUndefined();
  });

  it("rejects bad edits", async () => {
    const { flagged, hidden } = await seed();
    const admin = await agentWithRole("admin");
    expect((await admin.patch(`/api/admin/tors/${flagged}`).send({ category: "bogus" })).status).toBe(400);
    expect((await admin.patch(`/api/admin/tors/${flagged}`).send({ budget: -1 })).status).toBe(400);
    expect((await admin.patch(`/api/admin/tors/${flagged}`).send({ pipelineStatus: "enriched" })).status).toBe(400);
    expect((await admin.patch(`/api/admin/tors/${flagged}`).send({ title: "" })).status).toBe(400);
    expect((await admin.patch("/api/admin/tors/not-an-id").send({ title: "x" })).status).toBe(400);
    expect((await admin.patch(`/api/admin/tors/${hidden}`).send({ title: "x" })).status).toBe(404);
  });

  it("hides a TOR from the public API instead of deleting it", async () => {
    const { flagged } = await seed();
    const admin = await agentWithRole("admin");

    expect((await admin.delete(`/api/admin/tors/${flagged}`)).status).toBe(204);
    expect((await request(app).get(`/api/tors/${flagged}`)).status).toBe(404);
    expect((await Tor.findById(flagged).lean())!.pipelineStatus).toBe("rejected");
    expect((await admin.delete(`/api/admin/tors/${flagged}`)).status).toBe(404);
  });

  it("labels rows with their real status and filters by it; a manual close wins", async () => {
    const stage = (s: string) => ({ stage: s, announcements: [], lastCheckedAt: new Date() });
    const [awarded, manuallyClosed] = await Tor.insertMany([
      { title: "ได้ผู้ชนะแล้ว", pipelineStatus: "enriched", procurement: stage("awarded") },
      { title: "ปิดโดยแอดมิน", pipelineStatus: "enriched", status: "closed", procurement: stage("awarded") },
    ]);
    const admin = await agentWithRole("admin");

    const all = await admin.get("/api/admin/tors?pageSize=100");
    const byTitle = Object.fromEntries(
      all.body.data.map((t: { title: string; displayStatus: string }) => [t.title, t.displayStatus])
    );
    expect(byTitle["ได้ผู้ชนะแล้ว"]).toBe("awarded");
    expect(byTitle["ปิดโดยแอดมิน"]).toBe("closed");

    const onlyAwarded = await admin.get("/api/admin/tors?status=awarded");
    expect(onlyAwarded.body.data.map((t: { _id: string }) => t._id)).toContain(String(awarded!._id));
    expect(onlyAwarded.body.data.map((t: { _id: string }) => t._id)).not.toContain(String(manuallyClosed!._id));

    const patched = await admin.patch(`/api/admin/tors/${awarded!._id}`).send({ status: "closed" });
    expect(patched.status).toBe(200);
    expect(patched.body.tor.displayStatus).toBe("closed");
  });
});

describe("PATCH /api/admin/tors/:id — bidDeadline", () => {
  const inviting = (over: Record<string, unknown> = {}) => ({
    title: "ระบบ",
    pipelineStatus: "enriched" as const,
    procurement: {
      stage: "inviting" as const,
      announcements: [],
      lastCheckedAt: new Date("2026-10-03T00:00:00Z"),
      bidDeadline: { date: new Date("2026-10-10T16:59:00Z"), source: "invitation-pdf" as const, extractedAt: new Date("2026-10-03T00:00:00Z") },
      deadlineAttempt: { announcementId: "inv-1", at: new Date("2026-10-03T00:00:00Z"), outcome: "read" as const },
    },
    ...over,
  });

  it("stores an admin deadline at the end of that Bangkok day, wins over the AI value, and keeps the rest", async () => {
    const tor = await Tor.create(inviting());
    const admin = await agentWithRole("admin");
    const res = await admin.patch(`/api/admin/tors/${tor.id}`).send({ bidDeadline: "2026-10-25" });
    expect(res.status).toBe(200);
    const saved = (await Tor.findById(tor.id).lean())?.procurement;
    expect(saved?.bidDeadline).toMatchObject({ source: "admin", date: new Date("2026-10-25T16:59:00.000Z") });
    expect(saved?.deadlineAttempt?.announcementId).toBe("inv-1");
    expect(saved?.stage).toBe("inviting");
    expect(res.body.tor.procurement.bidDeadline.date).toBe("2026-10-25T16:59:00.000Z");
    expect(res.body.tor.displayStatus).toBe("open");
  });

  it("null clears the deadline", async () => {
    const tor = await Tor.create(inviting());
    const admin = await agentWithRole("admin");
    expect((await admin.patch(`/api/admin/tors/${tor.id}`).send({ bidDeadline: null })).status).toBe(200);
    expect(((await Tor.findById(tor.id).lean())?.procurement?.bidDeadline ?? null)).toBeNull();
  });

  it("does not change the deadline when the field is absent", async () => {
    const tor = await Tor.create(inviting());
    const admin = await agentWithRole("admin");
    await admin.patch(`/api/admin/tors/${tor.id}`).send({ title: "ชื่อใหม่" });
    expect((await Tor.findById(tor.id).lean())?.procurement?.bidDeadline?.source).toBe("invitation-pdf");
  });

  it.each(["2026-02-31", "20/10/2026", "", "tomorrow"])("400 for %p", async (bad) => {
    const tor = await Tor.create(inviting());
    const admin = await agentWithRole("admin");
    expect((await admin.patch(`/api/admin/tors/${tor.id}`).send({ bidDeadline: bad })).status).toBe(400);
  });

  it("409 for a TOR that has no procurement data yet, and nothing else is saved", async () => {
    const tor = await Tor.create({ title: "เดิม", pipelineStatus: "enriched" });
    const admin = await agentWithRole("admin");
    const res = await admin.patch(`/api/admin/tors/${tor.id}`).send({ title: "ใหม่", bidDeadline: "2026-10-25" });
    expect(res.status).toBe(409);
    expect((await Tor.findById(tor.id).lean())?.title).toBe("เดิม");
  });
});
