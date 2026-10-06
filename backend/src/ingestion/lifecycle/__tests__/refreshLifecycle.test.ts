import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EnrichmentJob, IngestionRun, SystemLog, Tor } from "../../../models";
import type { EgpAnnouncement, EgpClientLike, EgpProjectDetail } from "../../../scraper/egpClient.types";
import type { BidDeadlineExtractor } from "../../enrichment/torExtractor";
import type { BlobStorage } from "../../../storage/storage.types";
import type { GprocClientLike, GprocAnnouncement, GprocProjectDetail } from "../../../scraper/gprocClient.types";
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

function deadlineDeps(opts: { result?: { date: string | null; time: string | null; confidence: number } | Error } = {}) {
  const extractCalls: string[] = [];
  const extractor: BidDeadlineExtractor = {
    async extractBidDeadline(input) {
      extractCalls.push(input.meta.projectCode ?? "");
      if (opts.result instanceof Error) throw opts.result;
      return opts.result ?? { date: "2026-10-20", time: null, confidence: 0.9 };
    },
  };
  const storage = { async put(key: string) { return { key, size: 1 }; } } as unknown as BlobStorage;
  return { extractor, storage, extractCalls };
}

const withDownload = (c: ReturnType<typeof fakeClient>) =>
  Object.assign(c, { async downloadFile() { return Buffer.from("%PDF-1.4 fake"); } });

describe("refreshLifecycle", () => {
  it("with onlyOpen checks only inviting TORs and suffixes the summary; without it, no suffix", async () => {
    await seedTor("open", { procurement: { stage: "inviting", announcements: [], lastCheckedAt: new Date("2026-09-01T00:00:00Z") } });
    await seedTor("draft", { procurement: oldProcurement("2026-09-01T00:00:00Z") });
    await seedTor("fresh");
    const client = fakeClient();
    const out = await refreshLifecycle(deps(client, { onlyOpen: true }));
    expect(out.selected).toBe(1);
    expect(client.detailCalls).toEqual(["open"]);
    const run = await IngestionRun.findById(out.runId).lean();
    expect(run?.outcomeSummary).toMatch(/; only open TORs$/);

    const all = await refreshLifecycle(deps(fakeClient()));
    expect(all.selected).toBe(3);
    const run2 = await IngestionRun.findById(all.runId).lean();
    expect(run2?.outcomeSummary).not.toContain("only open");
  });

  it("with onlyOpen and torIds still restricts to inviting TORs", async () => {
    const open = await seedTor("open", { procurement: { stage: "inviting", announcements: [], lastCheckedAt: new Date("2026-09-01T00:00:00Z") } });
    const draft = await seedTor("draft", { procurement: oldProcurement("2026-09-01T00:00:00Z") });
    const client = fakeClient();
    const out = await refreshLifecycle(deps(client, { onlyOpen: true, torIds: [open.id, draft.id] }));
    expect(out.selected).toBe(1);
    expect(client.detailCalls).toEqual(["open"]);
  });

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

  describe("torIds", () => {
    it("checks only the listed TORs and leaves other eligible ones untouched", async () => {
      const p1 = await seedTor("p1");
      await seedTor("p2");
      const p3 = await seedTor("p3");
      const client = fakeClient();
      const out = await refreshLifecycle(deps(client, { torIds: [p1.id, p3._id] }));
      expect(client.detailCalls.sort()).toEqual(["p1", "p3"]);
      expect(out.selected).toBe(2);
      expect((await Tor.findOne({ projectCode: "code-p2" }).lean())?.procurement?.lastCheckedAt).toBeFalsy();
    });

    it("defaults the cap to the list length, not MAX_LIFECYCLE_REFRESH_PER_RUN", async () => {
      const ids = [(await seedTor("p1")).id, (await seedTor("p2")).id];
      await seedTor("p3");
      await seedTor("p4");
      const client = fakeClient();
      const out = await refreshLifecycle(deps(client, { torIds: ids }));
      expect(out.selected).toBe(2);
      expect(client.detailCalls).toHaveLength(2);
    });

    it("an explicit maxTors still limits", async () => {
      const ids = [(await seedTor("p1")).id, (await seedTor("p2")).id, (await seedTor("p3")).id];
      const client = fakeClient();
      const out = await refreshLifecycle(deps(client, { torIds: ids, maxTors: 1 }));
      expect(out.selected).toBe(1);
    });

    it("skips listed TORs that are not eligible without erroring", async () => {
      const ok = await seedTor("p1");
      const pending = await seedTor("p2", { pipelineStatus: "pending" });
      const done = await seedTor("p3", {
        procurement: { stage: "awarded", contractStatus: "ส่งงานครบถ้วน", announcements: [], lastCheckedAt: new Date("2026-09-01") },
      });
      const client = fakeClient();
      const out = await refreshLifecycle(deps(client, { torIds: [ok.id, pending.id, done.id] }));
      expect(client.detailCalls).toEqual(["p1"]);
      expect(out).toMatchObject({ selected: 1, failed: 0 });
    });
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

  it("skips a TOR whose procurement changed while its e-GP calls were in flight, then retries next run", async () => {
    await seedTor("p1", { procurement: oldProcurement("2026-09-01") });
    const client = fakeClient({
      onDetail: async () => {
        // another writer (e.g. discovery) advances the TOR mid-refresh
        await Tor.updateOne(
          { projectCode: "code-p1" },
          { $set: { "procurement.lastCheckedAt": new Date("2026-09-30"), "procurement.stage": "awarded" } },
          { timestamps: false }
        );
      },
    });

    const out = await refreshLifecycle(deps(client));

    expect(out).toMatchObject({ selected: 1, changed: 0, unchanged: 0, skipped: 1, failed: 0 });
    const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
    expect(saved?.procurement?.stage).toBe("awarded"); // the other writer's value stands
    const warn = await SystemLog.findOne({ severity: "warning", ingestionRunId: out.runId }).lean();
    expect(warn?.message).toContain("code-p1");
    expect(warn?.message).toContain("changed while");
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

  describe("bid deadline step", () => {
    const INV = (p: string) => ann(`${p}-inv`, "ประกาศเชิญชวน", "2026-10-01T00:00:00Z");

    it("reads the deadline of an inviting TOR after refreshing it", async () => {
      await seedTor("p1");
      const d = deadlineDeps();
      const out = await refreshLifecycle(
        deps(withDownload(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] } })), {
          deadlineExtractor: d.extractor,
          storage: d.storage,
        })
      );
      expect(out).toMatchObject({ selected: 1, changed: 1, failed: 0 });
      const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
      expect(saved?.procurement?.stage).toBe("inviting");
      expect(saved?.procurement?.bidDeadline?.date).toEqual(new Date("2026-10-20T16:59:00.000Z"));
      const run = await IngestionRun.findById(out.runId).lean();
      expect(run?.outcomeSummary).toBe(
        "checked 1, changed 1, unchanged 0, skipped 0, failed 0; bid deadlines: read 1, unreadable 0, errors 0"
      );
    });

    it("is off when no extractor is supplied (unchanged behaviour)", async () => {
      await seedTor("p1");
      const out = await refreshLifecycle(
        deps(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] } }))
      );
      expect(out.failed).toBe(0);
      const run = await IngestionRun.findById(out.runId).lean();
      expect(run?.outcomeSummary).toBe("checked 1, changed 1, unchanged 0, skipped 0, failed 0");
    });

    it("respects the per-run extraction cap", async () => {
      await seedTor("p1");
      await seedTor("p2");
      const d = deadlineDeps();
      const client = withDownload(
        fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")], p2: [TOR_DRAFT("p2"), INV("p2")] } })
      );
      await refreshLifecycle(deps(client, { deadlineExtractor: d.extractor, storage: d.storage, maxDeadlineExtractions: 1 }));
      expect(d.extractCalls).toHaveLength(1);
    });

    it("a Gemini error is logged and does not undo the stage write or stop other TORs", async () => {
      await seedTor("p1", { procurement: oldProcurement("2026-09-01") });
      await seedTor("p2", { procurement: oldProcurement("2026-09-02") });
      const d = deadlineDeps();
      let calls = 0;
      const extractor: BidDeadlineExtractor = {
        async extractBidDeadline(input) {
          calls += 1;
          if (calls === 1) throw new Error("Gemini 500");
          return d.extractor.extractBidDeadline(input);
        },
      };
      const client = withDownload(
        fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")], p2: [TOR_DRAFT("p2"), INV("p2")] } })
      );
      const out = await refreshLifecycle(deps(client, { deadlineExtractor: extractor, storage: d.storage }));

      expect(out).toMatchObject({ selected: 2, changed: 2, failed: 0 });
      const p1 = await Tor.findOne({ projectCode: "code-p1" }).lean();
      expect(p1?.procurement?.stage).toBe("inviting");
      expect(p1?.procurement?.deadlineAttempt ?? null).toBeNull();
      const p2 = await Tor.findOne({ projectCode: "code-p2" }).lean();
      expect(p2?.procurement?.bidDeadline?.source).toBe("invitation-pdf");
      const run = await IngestionRun.findById(out.runId).lean();
      expect(run?.outcomeSummary).toContain("errors 1");
      expect(run?.outcomeSummary).toContain("read 1");
      const log = await SystemLog.findOne({ severity: "error", ingestionRunId: out.runId }).lean();
      expect(log?.message).toContain("code-p1");
      expect(log?.message).toContain("Gemini 500");
    });

    it("reads once per invitation: a second refresh keeps the stored deadline and does not call Gemini again", async () => {
      await seedTor("p1");
      const d = deadlineDeps();
      const client = withDownload(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] } }));
      const opts = { deadlineExtractor: d.extractor, storage: d.storage };
      await refreshLifecycle(deps(client, opts));
      await refreshLifecycle(deps(client, opts));
      expect(d.extractCalls).toHaveLength(1);
      const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
      expect(saved?.procurement?.bidDeadline?.date).toEqual(new Date("2026-10-20T16:59:00.000Z"));
      expect(saved?.procurement?.deadlineAttempt).toMatchObject({ announcementId: "p1-inv", outcome: "read" });
    });

    it("reads the deadline of a finished-contract TOR once, then stops selecting it", async () => {
      await seedTor("p1", {
        procurement: {
          stage: "awarded",
          contractStatus: "ส่งงานครบถ้วน",
          announcements: [{ announcementId: "p1-inv", kind: "invitation", hasFile: true, publishedAt: new Date("2026-10-01T00:00:00Z") }],
          lastCheckedAt: new Date("2026-09-01T00:00:00Z"),
        },
      });
      const d = deadlineDeps();
      const client = withDownload(
        fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] }, contract: { p1: "ส่งงานครบถ้วน" } })
      );
      const opts = { deadlineExtractor: d.extractor, storage: d.storage };
      const first = await refreshLifecycle(deps(client, opts));
      expect(first.selected).toBe(1);
      expect(d.extractCalls).toHaveLength(1);
      const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
      expect(saved?.procurement?.bidDeadline?.date).toEqual(new Date("2026-10-20T16:59:00.000Z"));
      expect(saved?.procurement?.deadlineAttempt).toMatchObject({ announcementId: "p1-inv", outcome: "read" });

      await refreshLifecycle(deps(client, opts));
      expect(client.detailCalls).toHaveLength(1);
      expect(d.extractCalls).toHaveLength(1);
    });

    it("never overrides an admin deadline", async () => {
      const adminDate = new Date("2026-12-01T09:00:00Z");
      await seedTor("p1", {
        procurement: {
          ...oldProcurement("2026-09-01"),
          stage: "inviting",
          bidDeadline: { date: adminDate, source: "admin", extractedAt: NOW },
        },
      });
      const d = deadlineDeps();
      await refreshLifecycle(
        deps(withDownload(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] } })), {
          deadlineExtractor: d.extractor,
          storage: d.storage,
        })
      );
      expect(d.extractCalls).toHaveLength(0);
      const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
      expect(saved?.procurement?.bidDeadline).toMatchObject({ source: "admin", date: adminDate });
    });

    it("runs without the deadline step when the storage cannot be created", async () => {
      await seedTor("p1");
      const d = deadlineDeps();
      const original = process.env.STORAGE_DRIVER;
      process.env.STORAGE_DRIVER = "bogus-driver";
      try {
        const out = await refreshLifecycle(
          deps(withDownload(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] } })), {
            deadlineExtractor: d.extractor,
          })
        );
        expect(out).toMatchObject({ selected: 1, changed: 1, failed: 0 });
        expect(d.extractCalls).toHaveLength(0);
        const saved = await Tor.findOne({ projectCode: "code-p1" }).lean();
        expect(saved?.procurement?.stage).toBe("inviting");
        const log = await SystemLog.findOne({ severity: "warning", ingestionRunId: out.runId }).lean();
        expect(log?.message).toContain("deadline");
      } finally {
        if (original === undefined) delete process.env.STORAGE_DRIVER;
        else process.env.STORAGE_DRIVER = original;
      }
    });

    it("does not touch the hash, pipelineStatus or the enrichment queue", async () => {
      const tor = await seedTor("p1");
      const d = deadlineDeps();
      await refreshLifecycle(
        deps(withDownload(fakeClient({ announcements: { p1: [TOR_DRAFT("p1"), INV("p1")] } })), {
          deadlineExtractor: d.extractor,
          storage: d.storage,
        })
      );
      const after = await Tor.findById(tor.id).lean();
      expect(after?.sourceContentHash).toBe("hash-p1");
      expect(after?.pipelineStatus).toBe("enriched");
      expect(await EnrichmentJob.countDocuments({})).toBe(0);
    });
  });
});

const CODE = "69099318020";

function fakeGproc(opts: {
  detail?: GprocProjectDetail | null | Error;
  rows?: GprocAnnouncement[];
  pdf?: Buffer | null | Error;
} = {}): GprocClientLike & { pdfCalls: number } {
  const g = {
    pdfCalls: 0,
    async projectDetail() {
      if (opts.detail instanceof Error) throw opts.detail;
      return opts.detail === undefined
        ? { projectId: CODE, projectStatus: "A", announceType: "W0", methodId: "16", stepId: "W03" }
        : opts.detail;
    },
    async announcements() {
      return opts.rows ?? [
        { announceType: "D0", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: "A" },
        { announceType: "W0", announceDate: "2026-10-05T17:00:00.000Z", announceFlag: "A" },
      ];
    },
    async invitationPdf() {
      g.pdfCalls += 1;
      if (opts.pdf instanceof Error) throw opts.pdf;
      return opts.pdf === undefined ? Buffer.from("%PDF-1.7 gproc") : opts.pdf;
    },
  };
  return g;
}

async function seedCode(over: Record<string, unknown> = {}) {
  return Tor.create({ title: "โครงการ gproc", projectCode: CODE, pipelineStatus: "enriched", sourceContentHash: "h", ...over });
}

describe("refreshLifecycle with process5", () => {
  it("takes the stage from process5 (awarded), tags the source, and uses egp2 only for the contract status", async () => {
    const tor = await seedCode({ sourceListingUrl: listing("g1"), procurement: { stage: "inviting", contractStatus: "ระหว่างดำเนินการ", announcements: [], lastCheckedAt: new Date("2026-09-01") } });
    const egp = fakeClient();
    const out = await refreshLifecycle(deps(egp, { gprocClient: fakeGproc() }));
    expect(out).toMatchObject({ selected: 1, changed: 1, failed: 0 });
    expect(egp.detailCalls).toEqual(["g1"]);
    const saved = (await Tor.findById(tor.id).lean())?.procurement;
    expect(saved?.stage).toBe("awarded");
    expect(saved?.source).toBe("gproc");
    expect(saved?.contractStatus).toBe("ระหว่างดำเนินการ"); // not wiped by the process5 write
    expect(saved?.announcements.map((a) => a.announcementId)).toEqual(["gproc-D0-20260923", "gproc-W0-20261006"]);
  });

  it("falls back to egp2 when process5 does not know the project", async () => {
    await seedCode({ sourceListingUrl: listing("g2") });
    const egp = fakeClient({ announcements: { g2: [TOR_DRAFT("g2"), INVITATION("g2")] } });
    await refreshLifecycle(deps(egp, { gprocClient: fakeGproc({ detail: null }) }));
    expect(egp.detailCalls).toEqual(["g2"]);
    const saved = (await Tor.findOne({ projectCode: CODE }).lean())?.procurement;
    expect(saved?.stage).toBe("inviting");
    expect(saved?.source).toBe("egp2");
  });

  it("falls back to egp2 and logs a warning when process5 throws (e.g. Cloudflare 403)", async () => {
    await seedCode({ sourceListingUrl: listing("g3") });
    const egp = fakeClient();
    const out = await refreshLifecycle(deps(egp, { gprocClient: fakeGproc({ detail: new Error("gprocurement 403") }) }));
    expect(out).toMatchObject({ failed: 0, changed: 1 });
    expect(egp.detailCalls).toEqual(["g3"]);
    const warn = await SystemLog.findOne({ severity: "warning", ingestionRunId: out.runId }).lean();
    expect(warn?.message).toContain(CODE);
    expect(warn?.message).toContain("process5");
  });

  it("skips a TOR with no listing URL when process5 cannot answer for it", async () => {
    await seedCode();
    const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ detail: null }) }));
    expect(out).toMatchObject({ selected: 1, skipped: 1, failed: 0 });
  });

  it("processes a TOR that has only a projectCode (no listing URL) through process5", async () => {
    const tor = await seedCode();
    const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc() }));
    expect(out).toMatchObject({ selected: 1, changed: 1, skipped: 0 });
    expect((await Tor.findById(tor.id).lean())?.procurement?.stage).toBe("awarded");
  });

  it("logs each unknown announce code once", async () => {
    await seedCode({ sourceListingUrl: listing("g4") });
    const rows = [
      { announceType: "D0", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: "A" },
      { announceType: "Z9", announceDate: "2026-10-01T00:00:00.000Z", announceFlag: "A" },
      { announceType: "Z9", announceDate: "2026-10-02T00:00:00.000Z", announceFlag: "A" },
    ];
    const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ rows }) }));
    const warns = await SystemLog.find({ severity: "warning", ingestionRunId: out.runId }).lean();
    expect(warns.filter((w) => w.message.includes("Z9"))).toHaveLength(1);
  });

  describe("contract status", () => {
    const stored = { stage: "inviting", contractStatus: "ระหว่างดำเนินการ", announcements: [], lastCheckedAt: new Date("2026-09-01") };
    it("uses the fresh egp2 contract status when process5 answered", async () => {
      const tor = await seedCode({ sourceListingUrl: listing("c1"), procurement: stored });
      await refreshLifecycle(deps(fakeClient({ contract: { c1: "ส่งงานครบถ้วน" } }), { gprocClient: fakeGproc() }));
      const saved = (await Tor.findById(tor.id).lean())?.procurement;
      expect(saved?.stage).toBe("awarded");
      expect(saved?.contractStatus).toBe("ส่งงานครบถ้วน");
    });
    it("keeps the stored contract status when the egp2 lookup fails", async () => {
      const tor = await seedCode({ sourceListingUrl: listing("c2"), procurement: stored });
      const out = await refreshLifecycle(deps(fakeClient({ fail: new Set(["c2"]) }), { gprocClient: fakeGproc() }));
      expect(out.failed).toBe(0);
      const saved = (await Tor.findById(tor.id).lean())?.procurement;
      expect(saved?.stage).toBe("awarded");
      expect(saved?.contractStatus).toBe("ระหว่างดำเนินการ");
    });
    it("keeps the stored contract status when there is no listing URL", async () => {
      const tor = await seedCode({ procurement: stored });
      await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc() }));
      expect((await Tor.findById(tor.id).lean())?.procurement?.contractStatus).toBe("ระหว่างดำเนินการ");
    });
  });

  it("treats an empty process5 announcement list for a TOR that had announcements as an error and falls back", async () => {
    await seedCode({
      sourceListingUrl: listing("z1"),
      procurement: { stage: "inviting", announcements: [{ announcementId: "x", kind: "invitation", hasFile: true }], lastCheckedAt: new Date("2026-09-01") },
    });
    const egp = fakeClient({ announcements: { z1: [TOR_DRAFT("z1"), INVITATION("z1")] } });
    const out = await refreshLifecycle(deps(egp, { gprocClient: fakeGproc({ rows: [] }) }));
    expect(out.failed).toBe(0);
    const saved = (await Tor.findOne({ projectCode: CODE }).lean())?.procurement;
    expect(saved?.source).toBe("egp2");
    expect((await IngestionRun.findById(out.runId).lean())?.outcomeSummary).toContain("process5 error 1");
  });

  it("pauses process5 for the rest of the run after 3 consecutive errors", async () => {
    for (let i = 0; i < 5; i += 1) {
      await Tor.create({ title: `t${i}`, projectCode: `6909931802${i}`, pipelineStatus: "enriched", sourceContentHash: `h${i}`, sourceListingUrl: listing(`b${i}`) });
    }
    let calls = 0;
    const g = fakeGproc({ detail: new Error("gprocurement 403") });
    g.projectDetail = async () => {
      calls += 1;
      throw new Error("gprocurement 403");
    };
    const egp = fakeClient();
    const out = await refreshLifecycle(deps(egp, { gprocClient: g }));
    expect(calls).toBe(3);
    expect(out).toMatchObject({ selected: 5, failed: 0 });
    expect(egp.detailCalls).toHaveLength(5);
    const summary = (await IngestionRun.findById(out.runId).lean())?.outcomeSummary ?? "";
    expect(summary).toContain("process5 paused after 3 consecutive errors");
    const paused = await SystemLog.find({ ingestionRunId: out.runId, message: /^process5 paused/ }).lean();
    expect(paused).toHaveLength(1);
  });

  describe("bid deadline from the process5 PDF", () => {
    const READ = { date: "2026-10-20", time: "12:00", confidence: 0.95 };
    const extractor = (calls: string[]) => ({
      async extractBidDeadline(input: { pdf: { fileName: string; content: Buffer }; meta: { projectCode?: string } }) {
        calls.push(input.pdf.content.toString("latin1"));
        return READ;
      },
    });
    const storage = { async put(key: string) { return { key, size: 1 }; } } as unknown as BlobStorage;
    const invitingRows = [{ announceType: "D0", announceDate: "2026-10-05T17:00:00.000Z", announceFlag: "A" }];

    it("reads the invitation PDF once per process5 invitation id and stores the deadline", async () => {
      const tor = await seedCode({ sourceListingUrl: listing("g5") });
      const calls: string[] = [];
      const g = fakeGproc({ rows: invitingRows, detail: { projectId: CODE, projectStatus: "A", announceType: "B0", methodId: "16", stepId: "M03" } });
      const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: g, deadlineExtractor: extractor(calls), storage }));
      expect(calls).toEqual(["%PDF-1.7 gproc"]);
      const saved = (await Tor.findById(tor.id).lean())?.procurement;
      expect(saved?.bidDeadline?.date).toEqual(new Date("2026-10-20T05:00:00.000Z"));
      expect(saved?.deadlineAttempt?.announcementId).toBe("gproc-D0-20261006");
      expect((await IngestionRun.findById(out.runId).lean())?.outcomeSummary).toContain("bid deadlines: read 1");
      await refreshLifecycle(deps(fakeClient(), { gprocClient: g, deadlineExtractor: extractor(calls), storage }));
      expect(calls).toHaveLength(1); // not re-read
    });

    it("keeps the existing deadline when the source switches and the new read is capped out", async () => {
      const old = { date: new Date("2026-10-15T09:00:00Z"), source: "invitation-pdf" as const, extractedAt: new Date("2026-09-30") };
      const tor = await seedCode({
        sourceListingUrl: listing("g6"),
        procurement: {
          stage: "inviting",
          announcements: [{ announcementId: "egp2-inv", kind: "invitation", hasFile: true, publishedAt: new Date("2026-09-30") }],
          bidDeadline: old,
          deadlineAttempt: { announcementId: "egp2-inv", at: new Date("2026-09-30"), outcome: "read" },
          lastCheckedAt: new Date("2026-09-01"),
        },
      });
      const calls: string[] = [];
      await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ rows: invitingRows }), deadlineExtractor: extractor(calls), storage, maxDeadlineExtractions: 0 }));
      expect(calls).toHaveLength(0);
      expect((await Tor.findById(tor.id).lean())?.procurement?.bidDeadline?.date).toEqual(old.date);
    });

    it("does not read anything and clears nothing when the project has no bundle yet", async () => {
      await seedCode({ sourceListingUrl: listing("g7") });
      const calls: string[] = [];
      const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ rows: invitingRows, pdf: null }), deadlineExtractor: extractor(calls), storage }));
      expect(calls).toHaveLength(0);
      expect(out.failed).toBe(0);
    });

    it("keeps a stored invitation-pdf deadline when process5 has no bundle for the invitation", async () => {
      const old = { date: new Date("2026-10-15T09:00:00Z"), source: "invitation-pdf" as const, extractedAt: new Date("2026-09-30") };
      const tor = await seedCode({
        sourceListingUrl: listing("g7b"),
        procurement: {
          stage: "inviting",
          announcements: [{ announcementId: "egp2-uuid-inv", kind: "invitation", hasFile: true, publishedAt: new Date("2026-09-30") }],
          bidDeadline: old,
          deadlineAttempt: { announcementId: "egp2-uuid-inv", at: new Date("2026-09-30"), outcome: "read" },
          lastCheckedAt: new Date("2026-09-01"),
        },
      });
      const calls: string[] = [];
      await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ rows: invitingRows, pdf: null }), deadlineExtractor: extractor(calls), storage }));
      expect(calls).toHaveLength(0);
      const saved = (await Tor.findById(tor.id).lean())?.procurement;
      expect(saved?.bidDeadline?.date).toEqual(old.date);
      expect(saved?.deadlineAttempt?.announcementId).toBe("egp2-uuid-inv");
    });

    it("does not re-read the egp2 PDF or touch the deadline when falling back for a TOR read from process5", async () => {
      const good = { date: new Date("2026-10-20T05:00:00Z"), source: "invitation-pdf" as const, extractedAt: new Date("2026-10-06") };
      const tor = await seedCode({
        sourceListingUrl: listing("g9"),
        procurement: {
          stage: "inviting",
          source: "gproc",
          announcements: [{ announcementId: "gproc-D0-20261006", kind: "invitation", hasFile: true, publishedAt: new Date("2026-10-06") }],
          bidDeadline: good,
          deadlineAttempt: { announcementId: "gproc-D0-20261006", at: new Date("2026-10-06"), outcome: "read" },
          lastCheckedAt: new Date("2026-09-01"),
        },
      });
      const calls: string[] = [];
      const egp = fakeClient({ announcements: { g9: [TOR_DRAFT("g9"), INVITATION("g9")] } });
      const out = await refreshLifecycle(deps(egp, { gprocClient: fakeGproc({ detail: new Error("gprocurement 403") }), deadlineExtractor: extractor(calls), storage }));
      expect(egp.detailCalls).toEqual(["g9"]);
      expect(calls).toHaveLength(0);
      expect(out.failed).toBe(0);
      const saved = (await Tor.findById(tor.id).lean())?.procurement;
      expect(saved?.bidDeadline?.date).toEqual(good.date);
      expect(saved?.deadlineAttempt?.announcementId).toBe("gproc-D0-20261006");
      expect(await SystemLog.countDocuments({ ingestionRunId: out.runId, message: /^open TOR / })).toBe(0);
    });

    it("a PDF download error is a per-TOR deadline error, not a failed refresh", async () => {
      await seedCode({ sourceListingUrl: listing("g8") });
      const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ rows: invitingRows, pdf: new Error("gprocurement 503") }), deadlineExtractor: extractor([]), storage }));
      expect(out.failed).toBe(0);
      expect((await IngestionRun.findById(out.runId).lean())?.outcomeSummary).toContain("errors 1");
    });
  });

  it("reports how many TORs process5 answered and how many fell back (unknown project vs error)", async () => {
    await seedCode({ sourceListingUrl: listing("r1") });
    await Tor.create({ title: "b", projectCode: "69099318021", pipelineStatus: "enriched", sourceContentHash: "h2", sourceListingUrl: listing("r2") });
    await Tor.create({ title: "c", projectCode: "69099318022", pipelineStatus: "enriched", sourceContentHash: "h3", sourceListingUrl: listing("r3") });
    const g = fakeGproc();
    const origDetail = g.projectDetail.bind(g);
    g.projectDetail = async (id: string) => {
      if (id === "69099318021") return null; // unknown to process5
      if (id === "69099318022") throw new Error("gprocurement 403");
      return origDetail(id);
    };
    const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: g }));
    const summary = (await IngestionRun.findById(out.runId).lean())?.outcomeSummary ?? "";
    expect(summary).toContain("stage source: process5 ok 1, fell back to BMA portal 2 (project unknown to process5 1, process5 error 1)");
  });

  it("logs, for an open TOR, the source of its bid deadline and whether the read worked", async () => {
    await seedCode({ sourceListingUrl: listing("r4") });
    const extractor = { async extractBidDeadline() { return { date: "2026-10-20", time: "12:00", confidence: 0.95 }; } };
    const storage = { async put(key: string) { return { key, size: 1 }; } } as unknown as BlobStorage;
    const g = fakeGproc({
      rows: [{ announceType: "D0", announceDate: "2026-10-05T17:00:00.000Z", announceFlag: "A" }],
      detail: { projectId: CODE, projectStatus: "A", announceType: "B0", methodId: "16", stepId: "M03" },
    });
    const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: g, deadlineExtractor: extractor, storage }));
    const line = await SystemLog.findOne({ ingestionRunId: out.runId, message: /^open TOR /i }).lean();
    expect(line?.message).toContain(CODE);
    expect(line?.message).toContain("from process5: read ok");
    expect((await IngestionRun.findById(out.runId).lean())?.outcomeSummary).toContain("(process5 read 1, unreadable 0, errors 0; BMA portal read 0, unreadable 0, errors 0)");
  });

  it("an open TOR whose process5 PDF download fails is logged as a failure from process5", async () => {
    await seedCode({ sourceListingUrl: listing("r5") });
    const extractor = { async extractBidDeadline() { return null; } };
    const storage = { async put(key: string) { return { key, size: 1 }; } } as unknown as BlobStorage;
    const g = fakeGproc({
      rows: [{ announceType: "D0", announceDate: "2026-10-05T17:00:00.000Z", announceFlag: "A" }],
      detail: { projectId: CODE, projectStatus: "A", announceType: "B0", methodId: "16", stepId: "M03" },
      pdf: new Error("gprocurement 503"),
    });
    const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: g, deadlineExtractor: extractor as any, storage }));
    const line = await SystemLog.findOne({ ingestionRunId: out.runId, message: /^open TOR / }).lean();
    expect(line?.severity).toBe("warning");
    expect(line?.message).toContain("from process5: failed (gprocurement 503)");
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
