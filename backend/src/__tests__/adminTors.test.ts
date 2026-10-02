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
});
