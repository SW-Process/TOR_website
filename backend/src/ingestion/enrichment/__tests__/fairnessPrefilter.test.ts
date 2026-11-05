import {
  applyFairnessPrefilter,
  bidWindowDays,
  budgetDeviationPercent,
  DEFAULT_FAIRNESS_PREFILTER,
  fairnessPrefilterPrompt,
  fairnessPrefilterSchema,
  signalDataPoints,
  type FairnessPrefilterThresholds,
} from "../fairnessPrefilter";
import type { FairnessSignal } from "../torExtractor";

const t: FairnessPrefilterThresholds = { budgetDeviationPercent: 30, minBidWindowDays: 7, minSeverity: "low" };
const sig = (field: FairnessSignal["field"], severity: FairnessSignal["severity"] = "medium"): FairnessSignal => ({
  field,
  severity,
  message: "ข้อสังเกต",
});
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("budgetDeviationPercent", () => {
  it("is the absolute difference as a percentage of the reference price", () => {
    expect(budgetDeviationPercent(1_300_000, 1_000_000)).toBeCloseTo(30);
    expect(budgetDeviationPercent(700_000, 1_000_000)).toBeCloseTo(30);
  });

  it("is null when either number is missing or the reference price is not positive", () => {
    expect(budgetDeviationPercent(undefined, 1_000_000)).toBeNull();
    expect(budgetDeviationPercent(1_000_000, null)).toBeNull();
    expect(budgetDeviationPercent(1_000_000, 0)).toBeNull();
  });
});

describe("bidWindowDays", () => {
  it("counts days from the announcement to the deadline", () => {
    expect(bidWindowDays(day("2026-10-01"), day("2026-10-06"))).toBe(5);
  });

  it("is null when a date is missing or the deadline is before the announcement", () => {
    expect(bidWindowDays(null, day("2026-10-06"))).toBeNull();
    expect(bidWindowDays(day("2026-10-06"), undefined)).toBeNull();
    expect(bidWindowDays(day("2026-10-06"), day("2026-10-01"))).toBeNull();
  });
});

describe("applyFairnessPrefilter", () => {
  it("keeps a budget signal at or above the deviation threshold and drops one below it", () => {
    const facts = { budget: 1_300_000, referencePrice: 1_000_000 };
    expect(applyFairnessPrefilter([sig("budget")], facts, t)).toHaveLength(1);
    expect(applyFairnessPrefilter([sig("budget")], { ...facts, budget: 1_100_000 }, t)).toHaveLength(0);
  });

  it("keeps a deadline signal only when the bid window is shorter than the minimum", () => {
    const short = { announcementDate: day("2026-10-01"), bidDeadline: day("2026-10-06") };
    const normal = { announcementDate: day("2026-10-01"), bidDeadline: day("2026-10-08") };
    expect(applyFairnessPrefilter([sig("deadline")], short, t)).toHaveLength(1);
    expect(applyFairnessPrefilter([sig("deadline")], normal, t)).toHaveLength(0);
  });

  it("keeps the model's budget and deadline signals when the facts to check them are missing", () => {
    expect(applyFairnessPrefilter([sig("budget"), sig("deadline")], {}, t)).toHaveLength(2);
  });

  it("drops signals below the minimum severity, whatever their field", () => {
    const signals = [sig("qualificationRequirements", "low"), sig("other", "medium"), sig("other", "high")];
    const kept = applyFairnessPrefilter(signals, {}, { ...t, minSeverity: "medium" });
    expect(kept.map((s) => s.severity)).toEqual(["medium", "high"]);
  });

  it("leaves qualification and other signals to the severity check only", () => {
    const facts = { budget: 1_000_000, referencePrice: 1_000_000 };
    expect(applyFairnessPrefilter([sig("qualificationRequirements"), sig("other")], facts, t)).toHaveLength(2);
  });
});

describe("fairnessPrefilterSchema", () => {
  it("accepts the defaults", () => {
    expect(fairnessPrefilterSchema.safeParse(DEFAULT_FAIRNESS_PREFILTER).success).toBe(true);
  });

  it("rejects missing fields, out-of-range values, fractional days and unknown fields", () => {
    expect(fairnessPrefilterSchema.safeParse({ budgetDeviationPercent: 30 }).success).toBe(false);
    expect(fairnessPrefilterSchema.safeParse({ ...t, budgetDeviationPercent: 0 }).success).toBe(false);
    expect(fairnessPrefilterSchema.safeParse({ ...t, minBidWindowDays: 91 }).success).toBe(false);
    expect(fairnessPrefilterSchema.safeParse({ ...t, minBidWindowDays: 2.5 }).success).toBe(false);
    expect(fairnessPrefilterSchema.safeParse({ ...t, minSeverity: "critical" }).success).toBe(false);
    expect(fairnessPrefilterSchema.safeParse({ ...t, extra: 1 }).success).toBe(false);
  });
});

describe("fairnessPrefilterPrompt", () => {
  it("states every threshold", () => {
    const text = fairnessPrefilterPrompt({ budgetDeviationPercent: 45, minBidWindowDays: 10, minSeverity: "high" }).join("\n");
    expect(text).toContain("45%");
    expect(text).toContain("fewer than 10 days");
    expect(text).toContain('"high"');
  });
});

describe("signalDataPoints (FR-19)", () => {
  const thresholds = { budgetDeviationPercent: 30, minBidWindowDays: 7, minSeverity: "low" } as const;
  const dates = {
    announcementDate: new Date("2026-08-01T03:00:00Z"),
    bidDeadline: new Date("2026-08-04T03:00:00Z"),
  };

  it("lists the numbers behind a budget signal, in either direction", () => {
    expect(signalDataPoints("budget", { budget: 7_000_000, referencePrice: 10_000_000 }, thresholds)).toEqual([
      { label: "งบประมาณ", value: "7,000,000 บาท" },
      { label: "ราคากลาง", value: "10,000,000 บาท" },
      { label: "ส่วนต่างจากราคากลาง", value: "ต่ำกว่า 30.0%" },
      { label: "เกณฑ์ที่ใช้ตรวจ", value: "ต่างจากราคากลางตั้งแต่ 30%" },
    ]);
  });

  it("lists the dates behind a deadline signal", () => {
    expect(signalDataPoints("deadline", dates, thresholds)).toEqual([
      { label: "วันที่ประกาศ", value: "1 สิงหาคม 2569" },
      { label: "กำหนดยื่นข้อเสนอ", value: "4 สิงหาคม 2569" },
      { label: "ระยะเวลายื่นข้อเสนอ", value: "3 วัน" },
      { label: "เกณฑ์ที่ใช้ตรวจ", value: "น้อยกว่า 7 วัน" },
    ]);
  });

  it("uses the Bangkok day, not the UTC day", () => {
    const late = { announcementDate: new Date("2026-08-01T20:00:00Z") };
    expect(signalDataPoints("deadline", late)[0]).toEqual({ label: "วันที่ประกาศ", value: "2 สิงหาคม 2569" });
  });

  it("shows a month-only deadline as a month and gives no day count for it", () => {
    const points = signalDataPoints("deadline", { ...dates, bidDeadlinePrecision: "month" });
    expect(points).toEqual([
      { label: "วันที่ประกาศ", value: "1 สิงหาคม 2569" },
      { label: "กำหนดยื่นข้อเสนอ", value: "สิงหาคม 2569" },
    ]);
  });

  it("leaves out what is unknown instead of inventing it", () => {
    expect(signalDataPoints("budget", { budget: 1_000 })).toEqual([{ label: "งบประมาณ", value: "1,000 บาท" }]);
    expect(signalDataPoints("budget", {})).toEqual([]);
  });

  it("has no system numbers for signals judged from the document alone", () => {
    expect(signalDataPoints("qualificationRequirements", { budget: 1_000, ...dates }, thresholds)).toEqual([]);
    expect(signalDataPoints("other", { budget: 1_000, ...dates }, thresholds)).toEqual([]);
  });
});
