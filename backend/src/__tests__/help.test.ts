import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Announcement, Faq, Session, User } from "../models";
import { HELP_CATEGORIES } from "../config/helpCategories";
import { SEED_ANNOUNCEMENTS, SEED_FAQS } from "../scripts/helpContent";
import { seedHelpContent } from "../scripts/seedHelpContent";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Announcement.syncIndexes(), Faq.syncIndexes()]);
});

afterEach(async () => {
  await Promise.all([Announcement.deleteMany({}), Faq.deleteMany({}), User.deleteMany({}), Session.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const DAY = 24 * 60 * 60 * 1000;

async function adminAgent() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send({ email: "admin@test.com", password: "secret123" }).expect(201);
  await User.updateOne({ email: "admin@test.com" }, { role: "admin" });
  return agent;
}

describe("public help center", () => {
  it("never shows drafts", async () => {
    await Announcement.create([
      { title: "เผยแพร่แล้ว", body: "x", status: "published", publishedAt: new Date() },
      { title: "ฉบับร่าง", body: "x", status: "draft" },
    ]);
    const draftFaq = await Faq.create({ question: "ร่าง?", answer: "x", category: "search", status: "draft" });
    await Faq.create({ question: "เผยแพร่?", answer: "x", category: "search", status: "published", featured: true });

    const home = (await request(app).get("/api/help").expect(200)).body;
    expect(home.announcements.map((a: { title: string }) => a.title)).toEqual(["เผยแพร่แล้ว"]);
    expect(home.faqs.map((f: { question: string }) => f.question)).toEqual(["เผยแพร่?"]);
    expect(home.categories.find((c: { slug: string }) => c.slug === "search").count).toBe(1);

    await request(app).get(`/api/help/faqs/${draftFaq._id}`).expect(404);
    expect((await request(app).get("/api/help/faqs")).body.data).toHaveLength(1);
  });

  it("orders announcements pinned → newest, with ended ones last", async () => {
    const now = Date.now();
    await Announcement.create([
      { title: "เก่า", body: "x", status: "published", publishedAt: new Date(now - 3 * DAY) },
      { title: "ใหม่", body: "x", status: "published", publishedAt: new Date(now - DAY) },
      { title: "ปักหมุด", body: "x", status: "published", pinned: true, publishedAt: new Date(now - 5 * DAY) },
      {
        title: "จบแล้ว",
        body: "x",
        status: "published",
        pinned: true,
        publishedAt: new Date(now),
        endsAt: new Date(now - 1000),
      },
    ]);
    const { data } = (await request(app).get("/api/help/announcements").expect(200)).body;
    expect(data.map((a: { title: string }) => a.title)).toEqual(["ปักหมุด", "ใหม่", "เก่า", "จบแล้ว"]);
    expect(data[3].ended).toBe(true);
    expect(data[0]).not.toHaveProperty("body");
  });

  it("returns an announcement's body on its own page", async () => {
    const a = await Announcement.create({ title: "หัวข้อ", body: "เนื้อหา", status: "published", publishedAt: new Date() });
    const res = await request(app).get(`/api/help/announcements/${a._id}`).expect(200);
    expect(res.body.announcement).toMatchObject({ title: "หัวข้อ", body: "เนื้อหา", ended: false });
    await request(app).get("/api/help/announcements/not-an-id").expect(404);
  });

  it("filters FAQs by category and searches question and answer literally", async () => {
    await Faq.create([
      { question: "ลืมรหัสผ่าน", answer: "ติดต่อทีมงาน", category: "account-security", status: "published" },
      { question: "ค้นหา TOR", answer: "ใช้ตัวกรอง (สถานะ)", category: "search", status: "published" },
    ]);
    const byCategory = (await request(app).get("/api/help/faqs").query({ category: "search" })).body.data;
    expect(byCategory.map((f: { question: string }) => f.question)).toEqual(["ค้นหา TOR"]);

    const byAnswer = (await request(app).get("/api/help/faqs").query({ q: "ทีมงาน" })).body.data;
    expect(byAnswer.map((f: { question: string }) => f.question)).toEqual(["ลืมรหัสผ่าน"]);
    // regex metacharacters are matched literally, not as a pattern
    expect((await request(app).get("/api/help/faqs").query({ q: "(สถานะ)" })).body.data).toHaveLength(1);
    expect((await request(app).get("/api/help/faqs").query({ q: ".*" })).body.data).toHaveLength(0);

    await request(app).get("/api/help/faqs").query({ category: "nope" }).expect(400);
  });

  it("lists FAQs in category order, then by their order field", async () => {
    await Faq.create([
      { question: "บัญชี 2", answer: "x", category: "account-security", order: 2, status: "published" },
      { question: "เริ่มต้น", answer: "x", category: "getting-started", order: 9, status: "published" },
      { question: "บัญชี 1", answer: "x", category: "account-security", order: 1, status: "published" },
    ]);
    const { data } = (await request(app).get("/api/help/faqs")).body;
    expect(data.map((f: { question: string }) => f.question)).toEqual(["เริ่มต้น", "บัญชี 1", "บัญชี 2"]);
  });

  it("returns related questions from the same category", async () => {
    const [main] = await Faq.create([
      { question: "หลัก", answer: "x", category: "search", order: 1, status: "published" },
      { question: "เกี่ยวข้อง", answer: "x", category: "search", order: 2, status: "published" },
      { question: "คนละหมวด", answer: "x", category: "account-security", status: "published" },
      { question: "ร่าง", answer: "x", category: "search", status: "draft" },
    ]);
    const res = await request(app).get(`/api/help/faqs/${main!._id}`).expect(200);
    expect(res.body.faq).toMatchObject({ question: "หลัก", answer: "x" });
    expect(res.body.related.map((f: { question: string }) => f.question)).toEqual(["เกี่ยวข้อง"]);
  });
});

describe("admin help API", () => {
  it("is admin-only", async () => {
    await request(app).get("/api/admin/help/faqs").expect(401);
    const vendor = request.agent(app);
    await vendor.post("/api/auth/register").send({ email: "v@test.com", password: "secret123" }).expect(201);
    await vendor.post("/api/admin/help/faqs").send({ question: "abc", answer: "x", category: "search" }).expect(403);
  });

  it("creates a draft, publishes it once, and keeps the first publish date through edits", async () => {
    const admin = await adminAgent();
    const created = (
      await admin.post("/api/admin/help/announcements").send({ title: "ประกาศใหม่", body: "เนื้อหา" }).expect(201)
    ).body.announcement;
    expect(created).toMatchObject({ status: "draft", publishedAt: null, kind: "news", pinned: false });
    expect((await request(app).get("/api/help/announcements")).body.data).toHaveLength(0);

    const published = (
      await admin.patch(`/api/admin/help/announcements/${created.id}`).send({ status: "published" }).expect(200)
    ).body.announcement;
    expect(published.publishedAt).not.toBeNull();

    const edited = (
      await admin.patch(`/api/admin/help/announcements/${created.id}`).send({ title: "แก้หัวข้อ", pinned: true }).expect(200)
    ).body.announcement;
    expect(edited.publishedAt).toBe(published.publishedAt);
    expect((await request(app).get("/api/help/announcements")).body.data[0]).toMatchObject({ title: "แก้หัวข้อ", pinned: true });
  });

  it("sets and clears an end date", async () => {
    const admin = await adminAgent();
    const { id } = (
      await admin
        .post("/api/admin/help/announcements")
        .send({ title: "ปิดปรับปรุง", body: "x", kind: "maintenance", status: "published", endsAt: new Date(Date.now() - 1000).toISOString() })
        .expect(201)
    ).body.announcement;
    expect((await request(app).get(`/api/help/announcements/${id}`)).body.announcement.ended).toBe(true);
    await admin.patch(`/api/admin/help/announcements/${id}`).send({ endsAt: null }).expect(200);
    expect((await request(app).get(`/api/help/announcements/${id}`)).body.announcement.ended).toBe(false);
  });

  it("404s, not 500s, when the announcement is deleted between the read and the write", async () => {
    const admin = await adminAgent();
    const { id } = (await admin.post("/api/admin/help/announcements").send({ title: "จะถูกลบ", body: "x" }).expect(201)).body
      .announcement;
    const original = Announcement.findByIdAndUpdate.bind(Announcement);
    const spy = jest.spyOn(Announcement, "findByIdAndUpdate").mockImplementationOnce(((...args: Parameters<typeof original>) => {
      // another admin deletes it right before this write lands
      return { lean: async () => (await Announcement.deleteOne({ _id: id }), original(...args).lean()) };
    }) as never);
    await admin.patch(`/api/admin/help/announcements/${id}`).send({ title: "แก้ไข" }).expect(404);
    spy.mockRestore();
  });

  it("rejects bad input and unknown fields", async () => {
    const admin = await adminAgent();
    await admin.post("/api/admin/help/faqs").send({ question: "ok?", answer: "x", category: "nope" }).expect(400);
    await admin.post("/api/admin/help/faqs").send({ question: "", answer: "x", category: "search" }).expect(400);
    await admin.post("/api/admin/help/faqs").send({ question: "ok?", answer: "x", category: "search", slug: "x" }).expect(400);
    await admin.post("/api/admin/help/announcements").send({ title: "ok ok", body: "x", status: "live" }).expect(400);
  });

  it("lists drafts to admins, edits and deletes FAQs", async () => {
    const admin = await adminAgent();
    const { id } = (
      await admin.post("/api/admin/help/faqs").send({ question: "คำถาม?", answer: "คำตอบ", category: "search" }).expect(201)
    ).body.faq;
    expect((await admin.get("/api/admin/help/faqs")).body.data).toHaveLength(1);

    await admin.patch(`/api/admin/help/faqs/${id}`).send({ status: "published", featured: true }).expect(200);
    expect((await request(app).get("/api/help")).body.faqs).toHaveLength(1);

    await admin.delete(`/api/admin/help/faqs/${id}`).expect(204);
    await admin.delete(`/api/admin/help/faqs/${id}`).expect(404);
    await admin.patch("/api/admin/help/faqs/bad").send({ featured: false }).expect(400);
  });
});

describe("help seed", () => {
  it("only uses known categories and fits the schema limits", () => {
    const slugs = new Set(HELP_CATEGORIES.map((c) => c.slug));
    for (const f of SEED_FAQS) {
      expect(slugs.has(f.category)).toBe(true);
      expect(f.question.length).toBeLessThanOrEqual(300);
    }
    for (const a of SEED_ANNOUNCEMENTS) expect(a.title.length).toBeLessThanOrEqual(200);
    const all = [...SEED_FAQS, ...SEED_ANNOUNCEMENTS].map((x) => x.slug);
    expect(new Set(all).size).toBe(all.length);
  });

  it("covers every category and features a front page's worth of questions", () => {
    for (const c of HELP_CATEGORIES) expect(SEED_FAQS.some((f) => f.category === c.slug)).toBe(true);
    const featured = SEED_FAQS.filter((f) => f.featured).length;
    expect(featured).toBeGreaterThan(0);
    expect(featured).toBeLessThanOrEqual(8); // the front page shows at most 8
  });

  it("inserts everything published on the first run and nothing on the second", async () => {
    const first = await seedHelpContent();
    expect(first.faqs.inserted).toBe(SEED_FAQS.length);
    expect(first.announcements.inserted).toBe(SEED_ANNOUNCEMENTS.length);
    expect(await Faq.countDocuments({ status: "published" })).toBe(SEED_FAQS.length);

    const second = await seedHelpContent();
    expect(second.faqs).toEqual({ inserted: 0, existing: SEED_FAQS.length });
    expect(await Faq.countDocuments({})).toBe(SEED_FAQS.length);
  });

  it("never overwrites an admin's edit or unpublishing", async () => {
    await seedHelpContent();
    await Faq.updateOne({ slug: "contact-team" }, { question: "แก้โดยแอดมิน", status: "draft" });
    await seedHelpContent();
    expect(await Faq.findOne({ slug: "contact-team" }).lean()).toMatchObject({ question: "แก้โดยแอดมิน", status: "draft" });
  });

  it("keeps the newest seeded announcement first after the pinned welcome post", async () => {
    await seedHelpContent();
    const { data } = (await request(app).get("/api/help/announcements")).body;
    expect(data[0].title).toBe(SEED_ANNOUNCEMENTS.find((a) => a.pinned)!.title);
  });
});
