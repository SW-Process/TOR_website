import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import app from "../app";
import { Tor } from "../models";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await Tor.deleteMany({}); });

async function seed() {
  const base = { pipelineStatus: "enriched" as const };
  await Tor.create([
    { ...base, title: "ระบบสารบรรณ A", agency: "สำนักการแพทย์", category: "information-system", budget: 1_000_000, referencePrice: 900_000, announcementDate: new Date("2026-07-01") },
    { ...base, title: "ระบบสารบรรณ B", agency: "สำนักอนามัย", category: "information-system", budget: 2_000_000, referencePrice: 1_800_000, announcementDate: new Date("2026-08-01") },
    { ...base, title: "เว็บไซต์หน่วยงาน", agency: "สำนักการแพทย์", category: "web-application", budget: 500_000, referencePrice: 480_000, announcementDate: new Date("2026-08-15") },
    { title: "งานที่ยังไม่ enrich", agency: "สำนักการแพทย์", category: "information-system", pipelineStatus: "pending" },
    { title: "งานที่ถูก reject", agency: "สำนักการแพทย์", pipelineStatus: "rejected" },
  ]);
}

describe("GET /api/tors", () => {
  it("returns only enriched TORs, newest first, paginated", async () => {
    await seed();
    const res = await request(app).get("/api/tors?pageSize=2");
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(3);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.hasNextPage).toBe(true);
    expect(res.body.data[0].title).toBe("เว็บไซต์หน่วยงาน");
    expect(res.body.data[0].aiSummary).toBeUndefined();
  });

  it("filters by agency, category, and budget range", async () => {
    await seed();
    const byAgency = await request(app).get("/api/tors?agency=" + encodeURIComponent("สำนักอนามัย"));
    expect(byAgency.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ B"]);

    const byCat = await request(app).get("/api/tors?category=web-application");
    expect(byCat.body.data.map((t: { title: string }) => t.title)).toEqual(["เว็บไซต์หน่วยงาน"]);

    const byBudget = await request(app).get("/api/tors?budgetMin=1500000");
    expect(byBudget.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ B"]);
  });

  it("does full-text-ish search on q", async () => {
    await seed();
    const res = await request(app).get("/api/tors?q=" + encodeURIComponent("เว็บไซต์"));
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["เว็บไซต์หน่วยงาน"]);
  });

  it("400s on a bad pageSize", async () => {
    const res = await request(app).get("/api/tors?pageSize=999");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tors/:id", () => {
  it("returns an enriched TOR, 404 for a non-enriched one, 400 for a bad id", async () => {
    await seed();
    const enriched = await Tor.findOne({ pipelineStatus: "enriched" }).lean();
    const pending = await Tor.findOne({ pipelineStatus: "pending" }).lean();
    expect((await request(app).get(`/api/tors/${enriched!._id}`)).status).toBe(200);
    expect((await request(app).get(`/api/tors/${pending!._id}`)).status).toBe(404);
    expect((await request(app).get("/api/tors/not-an-id")).status).toBe(400);
  });
});

describe("GET /api/tors/price-stats", () => {
  it("groups by category with percentiles over referencePrice", async () => {
    await seed();
    const res = await request(app).get("/api/tors/price-stats?groupBy=category");
    expect(res.status).toBe(200);
    const is = res.body.groups.find((g: { key: string }) => g.key === "information-system");
    expect(is.count).toBe(2);
    expect(is.min).toBe(900_000);
    expect(is.max).toBe(1_800_000);
    expect(is.median).toBe(1_350_000);
  });
});
