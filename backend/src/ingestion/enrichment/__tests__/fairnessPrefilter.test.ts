import {
  applyFairnessPrefilter,
  bidWindowDays,
  budgetDeviationPercent,
  DEFAULT_FAIRNESS_PREFILTER,
  fairnessPrefilterPrompt,
  fairnessPrefilterSchema,
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
