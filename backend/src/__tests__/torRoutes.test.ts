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
    { ...base, title: "ระบบสารบรรณ A", agency: "สำนักการแพทย์", category: "information-system", budget: 1_000_000, referencePrice: 900_000, announcementDate: new Date("2026-07-01"),
      sourceDocument: { egpUrl: "u", filename: "tor.pdf", storageKey: "tor-pdfs/a/b.pdf", textLayer: "scanned", pageCount: 2, byteSize: 10, sha256: "s".repeat(64), fetchedAt: new Date() } },
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

  it("matches q against agency and projectCode too", async () => {
    await seed();
    await Tor.updateOne({ title: "ระบบสารบรรณ B" }, { projectCode: "69049037828" });
    const byAgency = await request(app).get("/api/tors?q=" + encodeURIComponent("อนามัย"));
    expect(byAgency.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ B"]);
    const byCode = await request(app).get("/api/tors?q=6904903");
    expect(byCode.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ B"]);
  });

  it("matches q against the AI summary, key points and tech stack (FR-1)", async () => {
    await seed();
    await Tor.updateOne(
      { title: "ระบบสารบรรณ A" },
      { aiSummary: { summary: "ระบบจัดเก็บหนังสือราชการ", keyPoints: ["รองรับ Single Sign-On"], confidence: "high" } }
    );
    await Tor.updateOne({ title: "เว็บไซต์หน่วยงาน" }, { technologyStack: ["PostgreSQL"] });

    const titles = async (q: string) =>
      (await request(app).get("/api/tors?q=" + encodeURIComponent(q))).body.data.map((t: { title: string }) => t.title);
    expect(await titles("หนังสือราชการ")).toEqual(["ระบบสารบรรณ A"]);
    expect(await titles("single sign")).toEqual(["ระบบสารบรรณ A"]);
    expect(await titles("postgres")).toEqual(["เว็บไซต์หน่วยงาน"]);
    // Regex metacharacters are matched literally, not interpreted.
    expect(await titles(".*")).toEqual([]);
  });

    it("ANDs every filter into one query (FR-7)", async () => {
    await seed();
    const qs = new URLSearchParams({
      q: "สารบรรณ",
      agency: "สำนักการแพทย์",
      category: "information-system",
      budgetMax: "1500000",
      publishedFrom: "2026-06-01T00:00:00+07:00",
      publishedTo: "2026-07-01T23:59:59.999+07:00",
    });
    const res = await request(app).get(`/api/tors?${qs}`);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(["ระบบสารบรรณ A"]);

    qs.set("publishedTo", "2026-06-30T23:59:59.999+07:00");
    const none = await request(app).get(`/api/tors?${qs}`);
    expect(none.body.totalCount).toBe(0);
  });

  it("400s on a bad pageSize", async () => {
    const res = await request(app).get("/api/tors?pageSize=999");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tors/agencies", () => {
  it("lists distinct agencies of enriched TORs only, sorted, with the total count", async () => {
    await seed();
    await Tor.create([
      { title: "ไม่มีหน่วยงาน", pipelineStatus: "enriched" },
      { title: "หน่วยงานที่ยังไม่ enrich", agency: "สำนักงานเขตบางรัก", pipelineStatus: "pending" },
    ]);
    const res = await request(app).get("/api/tors/agencies");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(["สำนักการแพทย์", "สำนักอนามัย"]);
    expect(res.body.totalCount).toBe(4);
  });
});

describe("GET /api/tors/:id", () => {
  it("returns an enriched TOR, 404 for a non-enriched one, 400 for a bad id", async () => {
    await seed();
    const enriched = await Tor.findOne({ pipelineStatus: "enriched", "sourceDocument.storageKey": { $ne: null } }).lean();
    const pending = await Tor.findOne({ pipelineStatus: "pending" }).lean();
    const detail = await request(app).get(`/api/tors/${enriched!._id}`);
    expect(detail.status).toBe(200);
    // internal storage pointers must not leak in the public detail body
    expect(detail.body.tor.sourceDocument?.storageKey).toBeUndefined();
    expect(detail.body.tor.sourceDocument?.sha256).toBeUndefined();
    expect(detail.body.tor.sourceDocument?.filename).toBe("tor.pdf");
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
