import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Tor } from "../../../models";
import {
  torExtractionResultSchema,
  bucketConfidence,
  applyExtractionToTor,
  type TorExtractionResult,
} from "../torExtractor";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await Tor.deleteMany({}); });

const ok = (over: Partial<TorExtractionResult> = {}): TorExtractionResult => ({
  isSoftwareRelated: true,
  classificationReason: "จ้างพัฒนาระบบสารสนเทศ",
  confidence: 0.9,
  category: "information-system",
  categoryTags: ["mis"],
  summary: "โครงการพัฒนาระบบ...",
  keyPoints: ["จัดทำระบบ", "อบรมผู้ใช้"],
  qualifications: ["ทุนจดทะเบียน 5 ล้าน"],
  evaluationCriteria: [{ label: "ราคา", weight: 30 }, { label: "เทคนิค", weight: 70 }],
  technologyStack: ["React", "PostgreSQL"],
  submissionDeadline: "2026-09-30",
  fairnessSignals: [],
  ...over,
});

describe("torExtractionResultSchema", () => {
  it("accepts a well-formed result", () => {
    expect(torExtractionResultSchema.safeParse(ok()).success).toBe(true);
  });
  it("coerces null arrays to []", () => {
    const parsed = torExtractionResultSchema.parse({ ...ok(), keyPoints: null, categoryTags: null });
    expect(parsed.keyPoints).toEqual([]);
    expect(parsed.categoryTags).toEqual([]);
  });
  it("rejects an empty classificationReason", () => {
    expect(torExtractionResultSchema.safeParse(ok({ classificationReason: "" })).success).toBe(false);
  });
  it("rejects confidence outside 0..1", () => {
    expect(torExtractionResultSchema.safeParse(ok({ confidence: 1.5 })).success).toBe(false);
  });
  it("coerces a null fairnessSignals to []", () => {
    const parsed = torExtractionResultSchema.parse({ ...ok(), fairnessSignals: null });
    expect(parsed.fairnessSignals).toEqual([]);
  });
  it("rejects an invalid fairnessSignals field enum", () => {
    const bad = ok({
      fairnessSignals: [{ field: "bogus", severity: "high", message: "x" }] as never,
    });
    expect(torExtractionResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe("bucketConfidence", () => {
  it.each([[0.95, "high"], [0.8, "high"], [0.6, "medium"], [0.5, "medium"], [0.2, "low"]] as const)(
    "%f -> %s", (n, want) => expect(bucketConfidence(n)).toBe(want)
  );
});

describe("applyExtractionToTor", () => {
  it("writes all fields and sets pipelineStatus 'enriched' when software-related", async () => {
    const tor = await Tor.create({ title: "จ้างพัฒนาระบบ" });
    applyExtractionToTor(tor, ok(), { extractorId: "gemini-2.5-flash", fallbackText: "จ้างพัฒนาระบบ" });
    expect(tor.pipelineStatus).toBe("enriched");
    expect(tor.classification?.isSoftwareRelated).toBe(true);
    expect(tor.classification?.model).toBe("gemini-2.5-flash");
    expect(tor.aiSummary?.summary).toBe("โครงการพัฒนาระบบ...");
    expect(tor.aiSummary?.keyPoints).toEqual(["จัดทำระบบ", "อบรมผู้ใช้"]);
    expect(tor.aiSummary?.qualifications).toEqual(["ทุนจดทะเบียน 5 ล้าน"]);
    expect(tor.aiSummary?.confidence).toBe("high");
    expect(tor.aiSummary?.model).toBe("gemini-2.5-flash");
    expect(tor.aiSummary?.evaluationCriteria.map((c) => c.label)).toEqual(["ราคา", "เทคนิค"]);
    expect(tor.technologyStack).toEqual(["React", "PostgreSQL"]);
    expect(tor.category).toBe("information-system");
    expect(tor.categoryTags).toEqual(["mis"]);
    expect(tor.taxonomyVersion).toBe("2026-08-31");
    expect(tor.submissionDeadline?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("falls back to a rule-based category when Gemini returns an unknown one", async () => {
    const tor = await Tor.create({ title: "จัดหาระบบกล้องโทรทัศน์วงจรปิด" });
    applyExtractionToTor(tor, ok({ category: "totally-made-up" }), {
      extractorId: "gemini-2.5-flash",
      fallbackText: "จัดหาระบบกล้องโทรทัศน์วงจรปิด CCTV",
    });
    expect(tor.category).toBe("cctv-its");
  });

  it("sets pipelineStatus 'rejected' and writes no summary when not software-related", async () => {
    const tor = await Tor.create({ title: "จ้างเหมาดูแลต้นไม้" });
    applyExtractionToTor(
      tor,
      ok({ isSoftwareRelated: false, classificationReason: "งานดูแลสวน ไม่เกี่ยว software", summary: null }),
      { extractorId: "gemini-2.5-flash", fallbackText: "จ้างเหมาดูแลต้นไม้" }
    );
    expect(tor.pipelineStatus).toBe("rejected");
    expect(tor.classification?.isSoftwareRelated).toBe(false);
    expect(tor.aiSummary).toBeNull();
    expect(tor.category).toBeUndefined();
  });

  it("clamps an out-of-range evaluationCriteria weight to 0..100 and saves without throwing", async () => {
    const tor = await Tor.create({ title: "จ้างพัฒนาระบบ" });
    applyExtractionToTor(
      tor,
      ok({ evaluationCriteria: [{ label: "ราคา", weight: 500 }, { label: "ต่ำ", weight: -20 }] }),
      { extractorId: "gemini-2.5-flash", fallbackText: "จ้างพัฒนาระบบ" }
    );
    expect(tor.aiSummary?.evaluationCriteria[0]?.weight).toBe(100);
    expect(tor.aiSummary?.evaluationCriteria[1]?.weight).toBe(0);
    await expect(tor.save()).resolves.toBeDefined();
  });

  it("ignores an unparseable submissionDeadline", async () => {
    const tor = await Tor.create({ title: "x" });
    applyExtractionToTor(tor, ok({ submissionDeadline: "ภายใน 45 วัน" }), {
      extractorId: "gemini-2.5-flash",
      fallbackText: "x",
    });
    expect(tor.submissionDeadline).toBeUndefined();
  });

  it("converts a Buddhist-era (พ.ศ.) submissionDeadline year to Gregorian", async () => {
    // TOR source PDFs are dated in the Thai solar calendar (พ.ศ. = ค.ศ. + 543);
    // Gemini sometimes returns the year exactly as printed instead of
    // converting it, e.g. "2567-04-25" meaning 25 เมษายน 2567 = 2024-04-25 CE.
    const tor = await Tor.create({ title: "x" });
    applyExtractionToTor(tor, ok({ submissionDeadline: "2567-04-25" }), {
      extractorId: "gemini-2.5-flash",
      fallbackText: "x",
    });
    expect(tor.submissionDeadline?.toISOString().slice(0, 10)).toBe("2024-04-25");
  });

  it("maps fairnessSignals into tor.fairnessFlags with status 'open'", async () => {
    const tor = await Tor.create({ title: "จ้างพัฒนาระบบ" });
    applyExtractionToTor(
      tor,
      ok({ fairnessSignals: [{ field: "budget", severity: "high", message: "งบสูงกว่าราคากลางอย่างมีนัยสำคัญ" }] }),
      { extractorId: "gemini-2.5-flash", fallbackText: "จ้างพัฒนาระบบ" }
    );
    expect(tor.fairnessFlags).toHaveLength(1);
    expect(tor.fairnessFlags[0]?.field).toBe("budget");
    expect(tor.fairnessFlags[0]?.severity).toBe("high");
    expect(tor.fairnessFlags[0]?.message).toBe("งบสูงกว่าราคากลางอย่างมีนัยสำคัญ");
    expect(tor.fairnessFlags[0]?.status).toBe("open");
    expect(tor.fairnessFlags[0]?.detectedAt).toBeInstanceOf(Date);
    await expect(tor.save()).resolves.toBeDefined();
  });

  it("leaves fairnessFlags empty when Gemini reports no signals", async () => {
    const tor = await Tor.create({ title: "จ้างพัฒนาระบบ" });
    applyExtractionToTor(tor, ok({ fairnessSignals: [] }), {
      extractorId: "gemini-2.5-flash",
      fallbackText: "จ้างพัฒนาระบบ",
    });
    expect(tor.fairnessFlags).toHaveLength(0);
  });
});
