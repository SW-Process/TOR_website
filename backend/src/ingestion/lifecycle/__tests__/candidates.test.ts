import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../../models";
import {
  countLifecycleCandidates,
  lifecycleFilter,
  maxDeadlineExtractionsPerRun,
  maxLifecycleRefreshPerRun,
  projectIdFromListingUrl,
} from "../candidates";

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
afterEach(async () => {
  await Tor.deleteMany({});
});

describe("maxLifecycleRefreshPerRun", () => {
  it("defaults to 100", () => {
    expect(maxLifecycleRefreshPerRun({})).toBe(100);
  });
  it("reads a positive integer from the env", () => {
    expect(maxLifecycleRefreshPerRun({ MAX_LIFECYCLE_REFRESH_PER_RUN: "25" })).toBe(25);
  });
  it.each(["0", "-3", "1.5", "abc", ""])("falls back to 100 for %p", (raw) => {
    expect(maxLifecycleRefreshPerRun({ MAX_LIFECYCLE_REFRESH_PER_RUN: raw })).toBe(100);
  });
});

describe("maxDeadlineExtractionsPerRun", () => {
  it("defaults to 20 and reads a positive integer", () => {
    expect(maxDeadlineExtractionsPerRun({})).toBe(20);
    expect(maxDeadlineExtractionsPerRun({ MAX_DEADLINE_EXTRACTIONS_PER_RUN: "5" })).toBe(5);
  });
  it.each(["0", "-1", "1.5", "abc", ""])("falls back to 20 for %p", (raw) => {
    expect(maxDeadlineExtractionsPerRun({ MAX_DEADLINE_EXTRACTIONS_PER_RUN: raw })).toBe(20);
  });
});

describe("projectIdFromListingUrl", () => {
  it("returns the last path segment", () => {
    expect(
      projectIdFromListingUrl("https://egp2.bangkok.go.th/project-detail/d8d87f9e-acfc-4653-be90-6386c3f11662")
    ).toBe("d8d87f9e-acfc-4653-be90-6386c3f11662");
  });
  it("ignores a trailing slash, query string and hash", () => {
    expect(projectIdFromListingUrl("https://egp.test/project-detail/abc/")).toBe("abc");
    expect(projectIdFromListingUrl("https://egp.test/project-detail/abc?x=1#frag")).toBe("abc");
  });
  it.each([
    [undefined],
    [null],
    [""],
    ["not a url"],
    ["https://egp.test"],
    ["https://egp.test/project-detail/"],
  ])("returns null for %p", (url) => {
    expect(projectIdFromListingUrl(url as string | null | undefined)).toBeNull();
  });
});

describe("lifecycleFilter", () => {
  const url = (id: string) => `https://egp.test/project-detail/${id}`;
  const procurement = (stage: string, contractStatus?: string) => ({
    stage,
    contractStatus,
    announcements: [],
    lastCheckedAt: new Date("2026-09-01T00:00:00Z"),
  });

  it("selects enriched, unfinished TORs that have a listing URL", async () => {
    await Tor.create([
      { title: "never checked", pipelineStatus: "enriched", sourceListingUrl: url("a") },
      { title: "inviting", pipelineStatus: "enriched", sourceListingUrl: url("b"), procurement: procurement("inviting", "ระหว่างดำเนินการ") },
      { title: "awarded but contract open", pipelineStatus: "enriched", sourceListingUrl: url("c"), procurement: procurement("awarded", "จัดทำสัญญา/ PO แล้ว") },
      { title: "pending", pipelineStatus: "pending", sourceListingUrl: url("d") },
      { title: "rejected", pipelineStatus: "rejected", sourceListingUrl: url("e") },
      { title: "cancelled", pipelineStatus: "enriched", sourceListingUrl: url("f"), procurement: procurement("cancelled") },
      { title: "contract complete", pipelineStatus: "enriched", sourceListingUrl: url("g"), procurement: procurement("awarded", "ส่งงานครบถ้วน") },
      { title: "delivered on time", pipelineStatus: "enriched", sourceListingUrl: url("h"), procurement: procurement("awarded", "ส่งงานตามกำหนด") },
      { title: "delivered late", pipelineStatus: "enriched", sourceListingUrl: url("i"), procurement: procurement("awarded", "ส่งงานล่าช้ากว่ากำหนด") },
      { title: "no listing url", pipelineStatus: "enriched" },
      { title: "empty listing url", pipelineStatus: "enriched", sourceListingUrl: "" },
    ] as any);
    const titles = (await Tor.find(lifecycleFilter() as any).sort({ title: 1 }).lean()).map((t) => t.title);
    expect(titles).toEqual(["awarded but contract open", "inviting", "never checked"]);
    expect(await countLifecycleCandidates()).toBe(3);
  });

  describe("month-precision deadlines are always re-checked", () => {
    const base = (stage: string, bid: object | null) => ({
      stage,
      contractStatus: stage === "awarded" ? "ส่งงานครบถ้วน" : undefined,
      announcements: [{ announcementId: "inv", kind: "invitation", hasFile: true }],
      deadlineAttempt: { announcementId: "inv", at: new Date("2026-09-02T00:00:00Z"), outcome: "read" },
      ...(bid ? { bidDeadline: bid } : {}),
      lastCheckedAt: new Date("2026-09-01T00:00:00Z"),
    });
    const bid = (precision: string, source = "invitation-pdf") => ({
      date: new Date("2026-10-31T16:59:00Z"),
      source,
      precision,
      extractedAt: new Date("2026-09-02T00:00:00Z"),
    });

    it("selects month-precision invitation-pdf deadlines even for finished or cancelled TORs", async () => {
      await Tor.create([
        { title: "cancelled month", pipelineStatus: "enriched", sourceListingUrl: url("a"), procurement: base("cancelled", bid("month")) },
        { title: "finished month", pipelineStatus: "enriched", sourceListingUrl: url("b"), procurement: base("awarded", bid("month")) },
        { title: "finished day", pipelineStatus: "enriched", sourceListingUrl: url("c"), procurement: base("awarded", bid("day")) },
        { title: "finished admin", pipelineStatus: "enriched", sourceListingUrl: url("d"), procurement: base("awarded", bid("month", "admin")) },
        { title: "cancelled legacy no precision", pipelineStatus: "enriched", sourceListingUrl: url("e"), procurement: base("cancelled", { date: new Date(), source: "invitation-pdf", extractedAt: new Date() }) },
        { title: "month but not enriched", pipelineStatus: "pending", sourceListingUrl: url("f"), procurement: base("awarded", bid("month")) },
      ] as any);
      const titles = (await Tor.find(lifecycleFilter() as any).sort({ title: 1 }).lean()).map((t) => t.title);
      expect(titles).toEqual(["cancelled month", "finished month"]);
    });
  });

  describe("one-time deadline backfill for finished TORs", () => {
    const filed = [{ announcementId: "inv", kind: "invitation", hasFile: true }];
    const finished = (over: Record<string, unknown>) => ({
      stage: "awarded",
      contractStatus: "ส่งงานครบถ้วน",
      announcements: filed,
      lastCheckedAt: new Date("2026-09-01T00:00:00Z"),
      ...over,
    });
    const attempt = { announcementId: "inv", at: new Date("2026-09-02T00:00:00Z"), outcome: "read" };

    it("selects cancelled / finished-contract TORs with a filed invitation until a deadline attempt exists", async () => {
      await Tor.create([
        { title: "cancelled, never attempted", pipelineStatus: "enriched", sourceListingUrl: url("a"), procurement: finished({ stage: "cancelled", contractStatus: undefined }) },
        { title: "finished, never attempted", pipelineStatus: "enriched", sourceListingUrl: url("b"), procurement: finished({}) },
        { title: "cancelled, attempted", pipelineStatus: "enriched", sourceListingUrl: url("c"), procurement: finished({ stage: "cancelled", contractStatus: undefined, deadlineAttempt: attempt }) },
        { title: "finished, attempted", pipelineStatus: "enriched", sourceListingUrl: url("d"), procurement: finished({ deadlineAttempt: attempt }) },
        { title: "cancelled, no invitation file", pipelineStatus: "enriched", sourceListingUrl: url("e"), procurement: finished({ stage: "cancelled", contractStatus: undefined, announcements: [{ announcementId: "inv", kind: "invitation", hasFile: false }] }) },
        { title: "finished, no invitation", pipelineStatus: "enriched", sourceListingUrl: url("f"), procurement: finished({ announcements: [] }) },
        { title: "cancelled, not enriched", pipelineStatus: "pending", sourceListingUrl: url("g"), procurement: finished({ stage: "cancelled", contractStatus: undefined }) },
        { title: "cancelled, no listing url", pipelineStatus: "enriched", procurement: finished({ stage: "cancelled", contractStatus: undefined }) },
      ] as any);
      const titles = (await Tor.find(lifecycleFilter() as any).sort({ title: 1 }).lean()).map((t) => t.title);
      expect(titles).toEqual(["cancelled, never attempted", "finished, never attempted"]);
      expect(await countLifecycleCandidates()).toBe(2);
    });
  });
});
