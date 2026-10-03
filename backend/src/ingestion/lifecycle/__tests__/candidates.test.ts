import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../../models";
import {
  countLifecycleCandidates,
  lifecycleFilter,
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
      { title: "no listing url", pipelineStatus: "enriched" },
      { title: "empty listing url", pipelineStatus: "enriched", sourceListingUrl: "" },
    ] as any);
    const titles = (await Tor.find(lifecycleFilter() as any).sort({ title: 1 }).lean()).map((t) => t.title);
    expect(titles).toEqual(["awarded but contract open", "inviting", "never checked"]);
    expect(await countLifecycleCandidates()).toBe(3);
  });
});
