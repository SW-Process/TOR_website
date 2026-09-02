import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { Tor, IngestionRun, EnrichmentJob } from "../../models";
import { runIngestion } from "../runIngestion";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import { setStorageForTest, type BlobStorage } from "../../storage";

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await EnrichmentJob.init(); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  await Promise.all([Tor.deleteMany({}), IngestionRun.deleteMany({}), EnrichmentJob.deleteMany({})]);
  setStorageForTest(null);
  delete process.env.INGEST_AGENCIES;
});

const storage: BlobStorage = {
  put: async (k, b) => ({ key: k, size: b.length }),
  getStream: async () => { throw new Error("no"); },
  exists: async () => false,
  publicUrl: () => null,
};

function clientFor(projects: { projectId: string; projectNumber: string }[], detailByName: Record<string, string>): EgpClientLike {
  return {
    searchProjects: async ({ page }) => ({
      totalCount: projects.length,
      hasNextPage: false,
      data: page === 1 ? projects : [],
    }),
    projectDetail: async (projectId) => {
      const p = projects.find((x) => x.projectId === projectId)!;
      return {
        projectName: `โครงการ ${p.projectNumber}`,
        masterOrgGroupName: detailByName[p.projectId] ?? "สำนักการแพทย์",
        masterOrgDepartmentName: null,
        projectBudget: 1_000_000,
        projectAverageBudget: 950_000,
        masterMethodIdName: "e-bidding",
        masterTypeIdName: "จ้าง",
        masterGoodsIdName: p.projectNumber.endsWith("9") ? "งานพัฒนาระบบสารสนเทศ" : "งานดูแลต้นไม้",
        masterContractAvailableName: "ระหว่างดำเนินการ",
      };
    },
    announcements: async () => [
      { id: "a1", masterAnnounceTypeName: "ร่างขอบเขตของงาน (TOR)", projectAnnouncementPublishDate: "2026-08-20T00:00:00Z", projectAnnouncementPath: "tor.pdf" },
    ],
    downloadFile: async () => Buffer.from("%PDF-1.4 fake"),
  };
}

describe("runIngestion — agency filter + keyword gate + enqueue", () => {
  it("skips agencies outside INGEST_AGENCIES", async () => {
    process.env.INGEST_AGENCIES = "สำนักดิจิทัลกรุงเทพมหานคร";
    const projects = [
      { projectId: "p1", projectNumber: "69000000019" },
      { projectId: "p2", projectNumber: "69000000029" },
    ];
    const client = clientFor(projects, { p1: "สำนักดิจิทัลกรุงเทพมหานคร", p2: "สำนักการคลัง" });
    const { done } = await runIngestion(
      { trigger: "manual", triggeredBy: null, maxProjects: 10, searchText: "" },
      { client, storage }
    );
    await done;
    expect(await Tor.countDocuments({})).toBe(1);
    const run = await IngestionRun.findOne({}).lean();
    expect(run?.stats.torsSkipped).toBe(1);
    expect(run?.stats.torsCreated).toBe(1);
  });

  it("enqueues an EnrichmentJob for a keyword-positive TOR, and rejects a keyword-negative one without enqueue", async () => {
    const projects = [
      { projectId: "p1", projectNumber: "69000000019" }, // goods -> "งานพัฒนาระบบสารสนเทศ" -> passes
      { projectId: "p2", projectNumber: "69000000020" }, // goods -> "งานดูแลต้นไม้" -> fails gate
    ];
    const client = clientFor(projects, {});
    const { done } = await runIngestion(
      { trigger: "manual", triggeredBy: null, maxProjects: 10, searchText: "" },
      { client, storage }
    );
    await done;

    const passed = await Tor.findOne({ projectCode: "69000000019" }).lean();
    const gated = await Tor.findOne({ projectCode: "69000000020" }).lean();
    expect(await EnrichmentJob.countDocuments({ torId: passed?._id })).toBe(1);
    expect(await EnrichmentJob.countDocuments({ torId: gated?._id })).toBe(0);
    expect(gated?.pipelineStatus).toBe("rejected");
    expect(gated?.classification?.model).toBe("keyword-gate");
  });

  it("does not enqueue when a re-run finds the TOR unchanged", async () => {
    const projects = [{ projectId: "p1", projectNumber: "69000000019" }];
    const client = clientFor(projects, {});
    const opts = { trigger: "manual" as const, triggeredBy: null, maxProjects: 10, searchText: "" };
    await (await runIngestion(opts, { client, storage })).done;
    await EnrichmentJob.deleteMany({}); // simulate the job already drained
    await (await runIngestion(opts, { client, storage })).done;
    expect(await EnrichmentJob.countDocuments({})).toBe(0);
  });
});
