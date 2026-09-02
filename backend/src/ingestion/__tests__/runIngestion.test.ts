import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor, IngestionRun, SystemLog } from "../../models";
import type {
  EgpAnnouncement,
  EgpClientLike,
  EgpProjectDetail,
  EgpSearchProject,
} from "../../scraper/egpClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import { runIngestion, markInterruptedRunsFailed } from "../runIngestion";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), IngestionRun.deleteMany({}), SystemLog.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const projects: EgpSearchProject[] = [
  { projectId: "p-1", projectNumber: "69000000001" },
  { projectId: "p-2", projectNumber: "69000000002" },
];

function detailFor(name: string): EgpProjectDetail {
  return {
    projectName: name,
    masterOrgGroupName: "สำนักการแพทย์",
    masterOrgDepartmentName: "โรงพยาบาลกลาง",
    projectBudget: 1_000_000,
    projectAverageBudget: 950_000,
    masterMethodIdName: "ประกวดราคา",
    masterTypeIdName: "จ้าง",
    masterGoodsIdName: "งานจ้างพัฒนาระบบ",
    masterContractAvailableName: "ระหว่างดำเนินการ",
  };
}

const torAnnFor = (id: string): EgpAnnouncement[] => [
  {
    id: `ann-${id}`,
    masterAnnounceTypeName: "ร่างขอบเขตของงาน (TOR)",
    projectAnnouncementPublishDate: "2026-08-23T17:00:00Z",
    projectAnnouncementPath: "tor.pdf",
  },
];

function fakeStorage(): BlobStorage {
  const saved = new Map<string, Buffer>();
  return {
    async put(key, body) {
      saved.set(key, body);
      return { key, size: body.length };
    },
    async getStream() {
      throw new Error("unused");
    },
    async exists(key) {
      return saved.has(key);
    },
    publicUrl() {
      return null;
    },
  };
}

interface FakeClientOpts {
  detailNames?: Record<string, string>;
  failDetailFor?: string;
}

function fakeClient(opts: FakeClientOpts = {}): EgpClientLike {
  return {
    async searchProjects({ page }) {
      return page === 1
        ? { totalCount: 2, hasNextPage: false, data: projects }
        : { totalCount: 2, hasNextPage: false, data: [] };
    },
    async projectDetail(projectId) {
      if (opts.failDetailFor === projectId) throw new Error("e-GP 500");
      const num = projects.find((p) => p.projectId === projectId)?.projectNumber ?? "?";
      return detailFor(opts.detailNames?.[projectId] ?? `โครงการ ${num}`);
    },
    async announcements(projectId) {
      return torAnnFor(projectId);
    },
    async downloadFile() {
      return Buffer.from("%PDF-1.4 bytes");
    },
  };
}

const baseOpts = {
  trigger: "manual" as const,
  triggeredBy: null,
  maxProjects: 50,
  searchText: "ซอฟต์แวร์",
};

const parse = async () => ({ numpages: 3, text: "x".repeat(50) }); // -> scanned

describe("runIngestion", () => {
  it("creates a Tor per project, stores its pdf, and finishes the run as success", async () => {
    const { runId, done } = await runIngestion(baseOpts, { client: fakeClient(), storage: fakeStorage(), parse });
    await done;

    const tors = await Tor.find({}).sort({ projectCode: 1 }).lean();
    expect(tors.map((t) => t.projectCode)).toEqual(["69000000001", "69000000002"]);
    expect(tors[0]?.sourceDocument?.textLayer).toBe("scanned");
    expect(tors[0]?.sourceContentHash).toHaveLength(64);

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.status).toBe("success");
    expect(run?.stats).toMatchObject({ torsFound: 2, torsCreated: 2, torsUpdated: 0, torsFailed: 0 });
    expect(run?.completedAt).toBeTruthy();
  });

  it("is idempotent — a second run with unchanged detail creates and updates nothing", async () => {
    const client = fakeClient();
    const downloadFileSpy = jest.spyOn(client, "downloadFile");
    const deps = { client, storage: fakeStorage(), parse };

    await (await runIngestion(baseOpts, deps)).done;
    expect(downloadFileSpy).toHaveBeenCalledTimes(2); // first run downloads both TOR pdfs
    downloadFileSpy.mockClear();

    const { runId, done } = await runIngestion(baseOpts, deps);
    await done;

    // RULING: an unchanged TOR that already has a stored document is not re-downloaded (NFR-07).
    expect(downloadFileSpy).not.toHaveBeenCalled();

    expect(await Tor.countDocuments({})).toBe(2);
    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsCreated: 0, torsUpdated: 0 });
  });

  it("updates a Tor when the e-GP detail changed", async () => {
    const deps1 = { client: fakeClient(), storage: fakeStorage(), parse };
    await (await runIngestion(baseOpts, deps1)).done;

    const deps2 = {
      client: fakeClient({ detailNames: { "p-1": "โครงการ 69000000001 (แก้ไข)" } }),
      storage: fakeStorage(),
      parse,
    };
    const { runId, done } = await runIngestion(baseOpts, deps2);
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsCreated: 0, torsUpdated: 1 });
    const t = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(t?.title).toBe("โครงการ 69000000001 (แก้ไข)");
  });

  it("records a per-project failure, logs it, and finishes partial", async () => {
    const { runId, done } = await runIngestion(baseOpts, {
      client: fakeClient({ failDetailFor: "p-1" }),
      storage: fakeStorage(),
      parse,
    });
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.status).toBe("partial");
    expect(run?.stats).toMatchObject({ torsFound: 2, torsCreated: 1, torsFailed: 1 });
    expect(await Tor.countDocuments({})).toBe(1);

    const errs = await SystemLog.find({ severity: "error", ingestionRunId: runId }).lean();
    expect(errs.length).toBeGreaterThanOrEqual(1);
  });

  it("honours maxProjects", async () => {
    const { done, runId } = await runIngestion(
      { ...baseOpts, maxProjects: 1 },
      { client: fakeClient(), storage: fakeStorage(), parse }
    );
    await done;
    expect(await Tor.countDocuments({})).toBe(1);
    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats.torsFound).toBe(1);
  });

  it("finalises the run as failed when project collection throws", async () => {
    const client: EgpClientLike = {
      ...fakeClient(),
      searchProjects: async () => {
        throw new Error("e-GP down");
      },
    };
    const { runId, done } = await runIngestion(baseOpts, { client, storage: fakeStorage(), parse });
    await done;
    const run = await IngestionRun.findById(runId).lean();
    expect(run?.status).toBe("failed");
    expect(run?.outcomeSummary).toMatch(/^run aborted:/);
    expect(await Tor.countDocuments({})).toBe(0);
  });

  it("passes a lookback window to searchProjects", async () => {
    const client = fakeClient();
    const spy = jest.spyOn(client, "searchProjects");
    await (await runIngestion(baseOpts, { client, storage: fakeStorage(), parse })).done;
    const arg = spy.mock.calls[0]?.[0];
    expect(arg?.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg?.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("retries the PDF on the next run when the first download failed", async () => {
    const storage = fakeStorage();
    const failing: EgpClientLike = {
      ...fakeClient(),
      downloadFile: async () => {
        throw new Error("e-GP 503");
      },
    };
    await (await runIngestion(baseOpts, { client: failing, storage, parse })).done;
    let tor = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(tor?.sourceDocument?.storageKey ?? null).toBeNull();

    const working = fakeClient();
    const spy = jest.spyOn(working, "downloadFile");
    await (await runIngestion(baseOpts, { client: working, storage, parse })).done;
    expect(spy).toHaveBeenCalled();
    tor = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(tor?.sourceDocument?.storageKey).toBeTruthy();
  });
});

describe("markInterruptedRunsFailed", () => {
  it("flips running rows to failed and leaves finished ones alone", async () => {
    await IngestionRun.create({ trigger: "manual", status: "running" });
    await IngestionRun.create({ trigger: "manual", status: "success", completedAt: new Date() });
    const n = await markInterruptedRunsFailed();
    expect(n).toBe(1);
    expect(await IngestionRun.countDocuments({ status: "running" })).toBe(0);
    expect(await IngestionRun.countDocuments({ status: "success" })).toBe(1);
    const failed = await IngestionRun.findOne({ status: "failed" }).lean();
    expect(failed?.outcomeSummary).toBe("interrupted by a server restart");
  });
});
