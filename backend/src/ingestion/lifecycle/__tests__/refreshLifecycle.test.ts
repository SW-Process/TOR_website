import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EnrichmentJob, IngestionRun, SystemLog, Tor } from "../../../models";
import type { EgpAnnouncement, EgpClientLike, EgpProjectDetail } from "../../../scraper/egpClient.types";
import { procurementChanged, refreshLifecycle } from "../refreshLifecycle";

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
  await Promise.all([
    Tor.deleteMany({}),
    IngestionRun.deleteMany({}),
    SystemLog.deleteMany({}),
    EnrichmentJob.deleteMany({}),
  ]);
});

const NOW = new Date("2026-10-03T00:00:00Z");
const listing = (id: string) => `https://egp.test/project-detail/${id}`;

async function seedTor(id: string, over: Record<string, unknown> = {}) {
  return Tor.create({
    title: `โครงการ ${id}`,
    projectCode: `code-${id}`,
    sourceListingUrl: listing(id),
    sourceContentHash: `hash-${id}`,
    pipelineStatus: "enriched",
    ...over,
  });
}

const oldProcurement = (checked: string) => ({
  stage: "draft",
  announcements: [],
  lastCheckedAt: new Date(checked),
});

const ann = (id: string, typeName: string, date: string): EgpAnnouncement => ({
  id,
  masterAnnounceTypeName: typeName,
  projectAnnouncementPublishDate: date,
  projectAnnouncementPath: `${id}.pdf`,
});
const TOR_DRAFT = (p: string) => ann(`${p}-tor`, "ร่างขอบเขตของงาน (TOR)", "2026-09-01T00:00:00Z");
const INVITATION = (p: string) => ann(`${p}-inv`, "ประกาศเชิญชวน", "2026-09-10T00:00:00Z");

interface FakeOpts {
  announcements?: Record<string, EgpAnnouncement[]>;
  contract?: Record<string, string>;
  fail?: Set<string>;
  onDetail?: (projectId: string) => Promise<void> | void;
}

function fakeClient(opts: FakeOpts = {}): EgpClientLike & { detailCalls: string[] } {
  const detailCalls: string[] = [];
  return {
    detailCalls,
    async searchProjects() {
      throw new Error("unused");
    },
    async projectDetail(projectId) {
      detailCalls.push(projectId);
      if (opts.fail?.has(projectId)) throw new Error("e-GP 500");
      await opts.onDetail?.(projectId);
      const detail: EgpProjectDetail = {
        projectName: "x",
        masterOrgGroupName: null,
        masterOrgDepartmentName: null,
        projectBudget: null,
        projectAverageBudget: null,
        masterMethodIdName: null,
        masterTypeIdName: null,
        masterGoodsIdName: null,
        masterContractAvailableName: opts.contract?.[projectId] ?? "ระหว่างดำเนินการ",
      };
      return detail;
    },
    async announcements(projectId) {
      return opts.announcements?.[projectId] ?? [TOR_DRAFT(projectId)];
    },
    async downloadFile() {
      throw new Error("a lifecycle refresh must never download a file");
    },
  };
}

const deps = (client: EgpClientLike, extra: Record<string, unknown> = {}) => ({
  client,
  now: () => NOW,
  ...extra,
});

describe("refreshLifecycle", () => {
  it("fills procurement for a TOR that has none and records a successful lifecycle run", async () => {
    const tor = await seedTor("p1");
    const out = await refreshLifecycle(
      deps(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INVITATION("p1")] } }))
    );

    expect(out).toMatchObject({ selected: 1, changed: 1, unchanged: 0, skipped: 0, failed: 0 });
    const saved = await Tor.findById(tor.id).lean();
    expect(saved?.procurement?.stage).toBe("inviting");
    expect(saved?.procurement?.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(saved?.procurement?.announcements.map((a) => a.kind)).toEqual(["tor-draft", "invitation"]);
    expect(saved?.procurement?.lastCheckedAt).toEqual(NOW);

    const run = await IngestionRun.findById(out.runId).lean();
    expect(run).toMatchObject({ phase: "lifecycle", status: "success", trigger: "scheduled" });
    expect(run?.stats).toMatchObject({ torsFound: 1, torsUpdated: 1, torsUnchanged: 0, torsFailed: 0 });
    expect(run?.outcomeSummary).toBe("checked 1, changed 1, unchanged 0, skipped 0, failed 0");
    expect(run?.completedAt).toBeTruthy();
  });

  it("counts a second identical refresh as unchanged but still advances lastCheckedAt", async () => {
    await seedTor("p1");
    const client = fakeClient();
    await refreshLifecycle(deps(client));

    const later = new Date("2026-10-04T00:00:00Z");
    const out = await refreshLifecycle({ client, now: () => later });

    expect(out).toMatchObject({ changed: 0, unchanged: 1 });
    const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
    expect(saved?.procurement?.lastCheckedAt).toEqual(later);
  });

  it("detects a stage change and a contract-status change", async () => {
    await seedTor("p1");
    await refreshLifecycle(deps(fakeClient())); // draft
    const out = await refreshLifecycle(
      deps(
        fakeClient({
          announcements: { p1: [TOR_DRAFT("p1"), INVITATION("p1")] },
          contract: { p1: "จัดทำสัญญา/ PO แล้ว" },
        })
      )
    );
    expect(out).toMatchObject({ changed: 1, unchanged: 0 });
    const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
    expect(saved?.procurement?.stage).toBe("inviting");
    expect(saved?.procurement?.contractStatus).toBe("จัดทำสัญญา/ PO แล้ว");
  });

  it("only checks eligible TORs", async () => {
    await seedTor("p1");
    await seedTor("p2", { pipelineStatus: "pending" });
    await seedTor("p3", { procurement: { stage: "cancelled", announcements: [], lastCheckedAt: new Date("2026-09-01") } });
    await seedTor("p4", {
      procurement: { stage: "awarded", contractStatus: "ส่งงานครบถ้วน", announcements: [], lastCheckedAt: new Date("2026-09-01") },
    });
    await seedTor("p5", { sourceListingUrl: undefined });
    await seedTor("p6", { pipelineStatus: "rejected" });

    const client = fakeClient();
    await refreshLifecycle(deps(client));
    expect(client.detailCalls).toEqual(["p1"]);
  });

  it("checks never-checked TORs first, then the oldest-checked, and respects the cap", async () => {
    await seedTor("p1", { procurement: oldProcurement("2026-09-20") });
    await seedTor("p2"); // never checked
    await seedTor("p3", { procurement: oldProcurement("2026-09-10") });

    const client = fakeClient();
    const out = await refreshLifecycle(deps(client, { maxTors: 2 }));

    expect(client.detailCalls).toEqual(["p2", "p3"]);
    expect(out.selected).toBe(2);
    const untouched = await Tor.findOne({ projectCode: "code-p1" }).lean();
    expect(untouched?.procurement?.lastCheckedAt).toEqual(new Date("2026-09-20"));
  });

  it("isolates a per-TOR e-GP failure: logs it, keeps that TOR's lastCheckedAt, finishes partial", async () => {
    await seedTor("p1", { procurement: oldProcurement("2026-09-01") });
    await seedTor("p2", { procurement: oldProcurement("2026-09-02") });
    await seedTor("p3", { procurement: oldProcurement("2026-09-03") });

    const out = await refreshLifecycle(deps(fakeClient({ fail: new Set(["p2"]) })));

    expect(out).toMatchObject({ selected: 3, changed: 2, unchanged: 0, failed: 1 });
    const failed = await Tor.findOne({ projectCode: "code-p2" }).lean();
    expect(failed?.procurement?.lastCheckedAt).toEqual(new Date("2026-09-02"));
    expect((await Tor.findOne({ projectCode: "code-p1" }).lean())?.procurement?.lastCheckedAt).toEqual(NOW);
    expect((await Tor.findOne({ projectCode: "code-p3" }).lean())?.procurement?.lastCheckedAt).toEqual(NOW);

    const run = await IngestionRun.findById(out.runId).lean();
    expect(run?.status).toBe("partial");
    expect(run?.stats.torsFailed).toBe(1);
    const logs = await SystemLog.find({ severity: "error", ingestionRunId: out.runId }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ source: "ingestion", component: "lifecycleRefresh" });
    expect(logs[0]?.message).toContain("code-p2");
  });

  it("marks the run failed when every TOR fails", async () => {
    await seedTor("p1");
    const out = await refreshLifecycle(deps(fakeClient({ fail: new Set(["p1"]) })));
    expect((await IngestionRun.findById(out.runId).lean())?.status).toBe("failed");
  });

  it("keeps an existing bidDeadline and stored announcement copy", async () => {
    await seedTor("p1", {
      procurement: {
        stage: "inviting",
        announcements: [
          { announcementId: "p1-inv", kind: "invitation", hasFile: true, storageKey: "tor-pdfs/code-p1/p1-inv.pdf" },
        ],
        bidDeadline: { date: new Date("2026-10-20T00:00:00Z"), source: "admin", extractedAt: NOW },
        lastCheckedAt: new Date("2026-09-01"),
      },
    });

    await refreshLifecycle(deps(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INVITATION("p1")] } })));

    const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
    expect(saved?.procurement?.bidDeadline?.source).toBe("admin");
    expect(saved?.procurement?.bidDeadline?.date).toEqual(new Date("2026-10-20T00:00:00Z"));
    const inv = saved?.procurement?.announcements.find((a) => a.announcementId === "p1-inv");
    const draft = saved?.procurement?.announcements.find((a) => a.announcementId === "p1-tor");
    expect(inv?.storageKey).toBe("tor-pdfs/code-p1/p1-inv.pdf");
    expect(draft?.storageKey).toBeNull();
  });

  it("has no AI-cost side effects: hash, pipelineStatus and updatedAt untouched, nothing enqueued", async () => {
    const tor = await seedTor("p1");
    const before = await Tor.findById(tor.id).lean();

    await refreshLifecycle(deps(fakeClient()));

    const after = await Tor.findById(tor.id).lean();
    expect(after?.sourceContentHash).toBe("hash-p1");
    expect(after?.pipelineStatus).toBe("enriched");
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(await EnrichmentJob.countDocuments({})).toBe(0);
  });

  it("writes no run row when nothing is eligible", async () => {
    const out = await refreshLifecycle(deps(fakeClient()));
    expect(out).toEqual({ runId: "", selected: 0, changed: 0, unchanged: 0, skipped: 0, failed: 0 });
    expect(await IngestionRun.countDocuments({})).toBe(0);
  });

  it("persists progress to the run row while the batch is still running", async () => {
    await seedTor("p1", { procurement: oldProcurement("2026-09-01") });
    await seedTor("p2", { procurement: oldProcurement("2026-09-02") });
    const seen: { status: string; found: number; updated: number }[] = [];
    const client = fakeClient({
      onDetail: async (id) => {
        if (id !== "p2") return;
        const run = await IngestionRun.findOne({ phase: "lifecycle" }).lean();
        seen.push({ status: run!.status, found: run!.stats.torsFound, updated: run!.stats.torsUpdated });
      },
    });

    await refreshLifecycle(deps(client));

    // while p2 is being fetched, p1 is already counted
    expect(seen).toEqual([{ status: "running", found: 2, updated: 1 }]);
  });

  it("skips a TOR whose listing URL has no project id, with a warning", async () => {
    await seedTor("p1", { sourceListingUrl: "https://egp.test/project-detail/" });
    const client = fakeClient();
    const out = await refreshLifecycle(deps(client));

    expect(client.detailCalls).toEqual([]);
    expect(out).toMatchObject({ selected: 1, skipped: 1, failed: 0 });
    expect((await IngestionRun.findById(out.runId).lean())?.status).toBe("success");
    const warn = await SystemLog.findOne({ severity: "warning", ingestionRunId: out.runId }).lean();
    expect(warn?.message).toContain("code-p1");
  });

  it("sweeps a dead lifecycle run before starting", async () => {
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    await seedTor("p1");

    await refreshLifecycle(deps(fakeClient()));

    expect((await IngestionRun.findById(dead._id).lean())?.status).toBe("failed");
  });

  it("records a manual trigger and who started it", async () => {
    await seedTor("p1");
    const userId = new mongoose.Types.ObjectId().toString();
    const out = await refreshLifecycle(deps(fakeClient(), { trigger: "manual", triggeredBy: userId }));
    const run = await IngestionRun.findById(out.runId).lean();
    expect(run?.trigger).toBe("manual");
    expect(String(run?.triggeredBy)).toBe(userId);
  });
});

describe("procurementChanged", () => {
  const base = {
    stage: "inviting" as const,
    contractStatus: "ระหว่างดำเนินการ",
    announcements: [
      { announcementId: "a", kind: "invitation" as const, hasFile: true, publishedAt: new Date("2026-09-10") },
    ],
    lastCheckedAt: new Date("2026-10-01"),
  };

  it("is true when there was no procurement before", () => {
    expect(procurementChanged(null, base)).toBe(true);
    expect(procurementChanged(undefined, base)).toBe(true);
  });
  it("ignores lastCheckedAt and storageKey", () => {
    const after = {
      ...base,
      lastCheckedAt: new Date("2026-10-09"),
      announcements: [{ ...base.announcements[0]!, storageKey: "k" }],
    };
    expect(procurementChanged(base, after)).toBe(false);
  });
  it("is true for a changed stage, contract status or announcement set", () => {
    expect(procurementChanged(base, { ...base, stage: "awarded" })).toBe(true);
    expect(procurementChanged(base, { ...base, contractStatus: "ส่งงานครบถ้วน" })).toBe(true);
    expect(procurementChanged(base, { ...base, contractStatus: undefined })).toBe(true);
    expect(
      procurementChanged(base, {
        ...base,
        announcements: [...base.announcements, { announcementId: "b", kind: "winner" as const, hasFile: false }],
      })
    ).toBe(true);
  });
});
