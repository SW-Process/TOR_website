import { bangkokEndOfDay, bangkokEndOfMonth, resolveBidDeadline } from "../bidDeadline";

describe("bangkokEndOfDay", () => {
  it("is 23:59 Bangkok (16:59 UTC) on that date", () => {
    expect(bangkokEndOfDay("2026-10-20")).toEqual(new Date("2026-10-20T16:59:00.000Z"));
  });
  it.each(["2026-02-31", "2026-13-01", "26-10-20", "2026/10/20", "", "abc"])("returns null for %p", (v) => {
    expect(bangkokEndOfDay(v)).toBeNull();
  });
});

describe("bangkokEndOfMonth", () => {
  it("is 23:59 Bangkok on the last day of the month", () => {
    expect(bangkokEndOfMonth("2026-10")).toEqual(new Date("2026-10-31T16:59:00.000Z"));
    expect(bangkokEndOfMonth("2026-02")).toEqual(new Date("2026-02-28T16:59:00.000Z"));
    expect(bangkokEndOfMonth("2028-02")).toEqual(new Date("2028-02-29T16:59:00.000Z"));
    expect(bangkokEndOfMonth("2026-12")).toEqual(new Date("2026-12-31T16:59:00.000Z"));
  });
  it.each(["2026-13", "2026-00", "26-10", "2026-10-20", "", "abc"])("returns null for %p", (v) => {
    expect(bangkokEndOfMonth(v)).toBeNull();
  });
});

describe("resolveBidDeadline", () => {
  const ok = { date: "2026-10-20", time: null, confidence: 0.9 };
  const day = (d: string) => ({ date: new Date(d), precision: "day" });

  it("uses 23:59 Bangkok when no time is printed", () => {
    expect(resolveBidDeadline(ok)).toEqual(day("2026-10-20T16:59:00.000Z"));
  });
  it("uses the printed time as Bangkok local time", () => {
    expect(resolveBidDeadline({ ...ok, time: "16:30" })).toEqual(day("2026-10-20T09:30:00.000Z"));
  });
  it("ignores a malformed time and falls back to end of day", () => {
    expect(resolveBidDeadline({ ...ok, time: "4.30pm" })).toEqual(day("2026-10-20T16:59:00.000Z"));
  });
  it("converts a Buddhist-era year that slipped through", () => {
    expect(resolveBidDeadline({ ...ok, date: "2569-10-20" })).toEqual(day("2026-10-20T16:59:00.000Z"));
  });
  it("is null for no date, a non-date, or low confidence", () => {
    expect(resolveBidDeadline({ ...ok, date: null })).toBeNull();
    expect(resolveBidDeadline({ ...ok, date: "next week" })).toBeNull();
    expect(resolveBidDeadline({ ...ok, confidence: 0.49 })).toBeNull();
  });
  it("is null when the date is before the invitation was published", () => {
    expect(resolveBidDeadline(ok, { notBefore: new Date("2026-10-21T00:00:00Z") })).toBeNull();
  });
  it("accepts a deadline on the publish day itself", () => {
    expect(resolveBidDeadline(ok, { notBefore: new Date("2026-10-20T00:00:00Z") })).not.toBeNull();
  });

  describe("month-only dates", () => {
    const month = { date: "2026-10", time: null, confidence: 0.9 };
    it("resolves to the end of the month with month precision", () => {
      expect(resolveBidDeadline(month)).toEqual({ date: new Date("2026-10-31T16:59:00.000Z"), precision: "month" });
    });
    it("ignores a time", () => {
      expect(resolveBidDeadline({ ...month, time: "16:30" })?.date).toEqual(new Date("2026-10-31T16:59:00.000Z"));
    });
    it("converts a Buddhist-era year", () => {
      expect(resolveBidDeadline({ ...month, date: "2569-10" })).toEqual({
        date: new Date("2026-10-31T16:59:00.000Z"),
        precision: "month",
      });
    });
    it.each(["2026-13", "2026-00", "2026-1"])("is null for %p", (date) => {
      expect(resolveBidDeadline({ ...month, date })).toBeNull();
    });
    it("is null for low confidence", () => {
      expect(resolveBidDeadline({ ...month, confidence: 0.3 })).toBeNull();
    });
    it("compares the end-of-month instant with notBefore", () => {
      expect(resolveBidDeadline(month, { notBefore: new Date("2026-10-25T00:00:00Z") })).not.toBeNull();
      expect(resolveBidDeadline(month, { notBefore: new Date("2026-11-02T00:00:00Z") })).toBeNull();
    });
  });
});
