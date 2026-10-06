import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { zipSync } from "fflate";
import { EnrichmentJob, IngestionRun, SystemLog, Tor } from "../../../models";
import type { GprocCaptureClientLike, GprocAnnouncement, GprocProjectDetail } from "../../../scraper/gprocClient.types";
import type { BlobStorage } from "../../../storage/storage.types";
import { captureProjects, type CaptureDeps, type CaptureProject } from "../captureProjects";

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
  await Promise.all([Tor.deleteMany({}), IngestionRun.deleteMany({}), SystemLog.deleteMany({}), EnrichmentJob.deleteMany({})]);
});

const NOW = new Date("2026-10-07T00:00:00Z");
const CODE = "69099312832";

const pdf = Buffer.from("%PDF-1.7 tor body");
const goodZip = Buffer.from(zipSync({ "Attach_TOR_1.pdf": new Uint8Array(pdf), "doc_1.pdf": new Uint8Array(Buffer.from("%PDF-x")) }));
const noTorZip = Buffer.from(zipSync({ "doc_1.pdf": new Uint8Array(Buffer.from("%PDF-x")) }));
const invitation = Buffer.from("%PDF-1.7 invitation");
const detail = (code: string, over: Record<string, unknown> = {}): GprocProjectDetail => ({
  projectId: code, projectStatus: "A", announceType: "D0", methodId: "16", stepId: "M03",
  projectName: "ประกวดราคาจ้างพัฒนาระบบสารสนเทศ", deptName: "กรุงเทพมหานคร", deptSubName: "สำนักดิจิทัล", ...over,
});
const rows: GprocAnnouncement[] = [{ announceType: "D0", announceDate: "2026-09-30T17:00:00.000Z", announceFlag: "A", priceBuild: 4890000 }];

function fakeGproc(opts: {
  detail?: (code: string) => GprocProjectDetail | null | Error;
  bundle?: (code: string, draft: boolean) => { zipId: string; name: string | null } | null | Error;
  zip?: Buffer | Error;
  invitation?: Buffer | null | Error;
} = {}): GprocCaptureClientLike & { detailCalls: string[]; zipCalls: string[]; invitationCalls: number } {
  const g = {
    detailCalls: [] as string[],
    zipCalls: [] as string[],
    invitationCalls: 0,
    async projectDetail(code: string) {
      g.detailCalls.push(code);
      const d = opts.detail ? opts.detail(code) : detail(code);
      if (d instanceof Error) throw d;
      return d;
    },
    async announcements() { return rows; },
    async invitationPdf() {
      g.invitationCalls += 1;
      const i = opts.invitation === undefined ? null : opts.invitation;
      if (i instanceof Error) throw i;
      return i;
    },
    async documentBundle(code: string, o: { draft: boolean }) {
      const b = opts.bundle ? opts.bundle(code, o.draft) : o.draft ? { zipId: "z-draft", name: "d.zip" } : null;
      if (b instanceof Error) throw b;
      return b;
    },
    async downloadBundle(zipId: string) {
      g.zipCalls.push(zipId);
      const z = opts.zip ?? goodZip;
      if (z instanceof Error) throw z;
      return z;
    },
  };
  return g;
}

const storage = (puts: string[] = []) => ({
  async put(key: string, body: Buffer) { puts.push(key); return { key, size: body.length }; },
  publicUrl: () => null,
} as unknown as BlobStorage);

async function run(projects: CaptureProject[], deps: Partial<CaptureDeps> & { gproc: GprocCaptureClientLike }) {
  const r = await IngestionRun.create({ trigger: "manual", phase: "capture", status: "running", stats: { torsFound: projects.length } });
  const enq = jest.fn(async () => {});
  await captureProjects(r._id, projects, {
    storage: storage(),
    enqueueEnrichment: enq,
    parse: async () => ({ numpages: 2, text: "x".repeat(900) }),
    now: () => NOW,
    env: {},
    ...deps,
  });
  return { run: await IngestionRun.findById(r._id).lean(), enq };
}

const seedSource = (over: Record<string, unknown> = {}) => ({
  egpUrl: "https://x",
  filename: "f.pdf",
  storageKey: `tor-pdfs/${CODE}/f.pdf`,
  textLayer: "digital",
  pageCount: 2,
  byteSize: 10,
  sha256: "abc",
  kind: "tor",
  ...over,
});
const seedTor = (over: Record<string, unknown> = {}) =>
  Tor.create({ title: "โครงการระบบสารสนเทศ", projectCode: CODE, sourceContentHash: "old", pipelineStatus: "enriched", procurement: { stage: "inviting", announcements: [], source: "gproc", lastCheckedAt: NOW }, ...over });

describe("captureProjects", () => {
  it("1. creates, stores the TOR file, enqueues once", async () => {
    const gproc = fakeGproc();
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    const tor = (await Tor.findOne({ projectCode: CODE }))!;
    expect(tor.title).toBe("ประกวดราคาจ้างพัฒนาระบบสารสนเทศ");
    expect(tor.agency).toBe("สำนักดิจิทัล");
    expect(tor.department).toBe("กรุงเทพมหานคร");
    expect(tor.referencePrice).toBe(4890000);
    expect(tor.procurement?.source).toBe("gproc");
    expect(tor.procurement?.stage).toBe("inviting");
    expect(tor.sourceListingUrl).toBeUndefined();
    expect(tor.sourceDocument?.storageKey?.startsWith(`tor-pdfs/${CODE}/`)).toBe(true);
    expect(tor.sourceDocument?.filename).toBe("Attach_TOR_1.pdf");
    expect(tor.sourceDocument?.kind).toBe("tor");
    expect(gproc.invitationCalls).toBe(0);
    expect(enq).toHaveBeenCalledTimes(1);
    expect(enq).toHaveBeenCalledWith(tor._id, tor.sourceContentHash);
    expect(r?.stats.torsCreated).toBe(1);
    expect(r?.status).toBe("success");
    expect(r?.outcomeSummary).toContain("created 1");
  });

  it("2. leaves an existing TOR alone", async () => {
    const t = await seedTor({ sourceDocument: seedSource() });
    const gproc = fakeGproc();
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    expect(gproc.detailCalls).toEqual([]);
    expect(r?.stats.torsUnchanged).toBe(1);
    const after = (await Tor.findById(t._id))!;
    expect(after.sourceContentHash).toBe("old");
    expect(after.sourceDocument?.sha256).toBe("abc");
    expect(enq).not.toHaveBeenCalled();
  });

  it("3. retries a gproc TOR with no source document, leaves the others alone", async () => {
    await seedTor({ pipelineStatus: "pending" });
    const gproc = fakeGproc();
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    const tor = (await Tor.findOne({ projectCode: CODE }))!;
    expect(tor.sourceDocument?.kind).toBe("tor");
    expect(tor.sourceDocument?.storageKey).toBeTruthy();
    expect(enq).toHaveBeenCalledTimes(1);
    expect(r?.stats.torsUnchanged).toBe(1);

    await Tor.deleteMany({});
    await seedTor({ pipelineStatus: "rejected", sourceDocument: seedSource({ storageKey: `tor-pdfs/${CODE}/invitation.pdf`, kind: "invitation" }) });
    const g2 = fakeGproc();
    const o2 = await run([{ projectCode: CODE }], { gproc: g2 });
    expect(g2.zipCalls).toEqual([]);
    expect(o2.enq).not.toHaveBeenCalled();

    await Tor.deleteMany({});
    await seedTor({ sourceDocument: seedSource() });
    const g3 = fakeGproc();
    const o3 = await run([{ projectCode: CODE }], { gproc: g3 });
    expect(g3.zipCalls).toEqual([]);
    expect(o3.enq).not.toHaveBeenCalled();

    await Tor.deleteMany({});
    await seedTor({ pipelineStatus: "pending", procurement: { stage: "inviting", announcements: [], source: "egp2", lastCheckedAt: NOW } });
    const g4 = fakeGproc();
    const o4 = await run([{ projectCode: CODE }], { gproc: g4 });
    expect(g4.zipCalls).toEqual([]);
    expect(g4.detailCalls).toEqual([]);
    expect(o4.enq).not.toHaveBeenCalled();
  });

  it("3b. upgrades an invitation-sourced TOR when a TOR file appears", async () => {
    await seedTor({ sourceDocument: seedSource({ storageKey: `tor-pdfs/${CODE}/invitation.pdf`, kind: "invitation" }) });
    const gproc = fakeGproc();
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    const tor = (await Tor.findOne({ projectCode: CODE }))!;
    expect(tor.sourceDocument?.kind).toBe("tor");
    expect(tor.sourceDocument?.filename).toBe("Attach_TOR_1.pdf");
    expect(tor.sourceContentHash).not.toBe("old");
    expect(enq).toHaveBeenCalledTimes(1);
    expect(enq).toHaveBeenCalledWith(tor._id, tor.sourceContentHash);
    expect(r?.stats.torsUnchanged).toBe(1);
    expect(gproc.invitationCalls).toBe(0);

    await Tor.deleteMany({});
    await seedTor({ sourceDocument: seedSource({ storageKey: `tor-pdfs/${CODE}/invitation.pdf`, kind: "invitation" }) });
    const g2 = fakeGproc({ zip: noTorZip });
    const o2 = await run([{ projectCode: CODE }], { gproc: g2 });
    const same = (await Tor.findOne({ projectCode: CODE }))!;
    expect(same.sourceDocument?.kind).toBe("invitation");
    expect(same.sourceContentHash).toBe("old");
    expect(o2.enq).not.toHaveBeenCalled();
    expect(o2.run?.stats.torsUnchanged).toBe(1);
    expect(g2.invitationCalls).toBe(0);
  });

  it.each(["rejected", "failed", "processing"] as const)("3b. never upgrades an invitation-sourced %s TOR", async (status) => {
    await seedTor({ pipelineStatus: status, sourceDocument: seedSource({ storageKey: `tor-pdfs/${CODE}/invitation.pdf`, kind: "invitation" }) });
    const gproc = fakeGproc();
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    const tor = (await Tor.findOne({ projectCode: CODE }))!;
    expect(gproc.zipCalls).toEqual([]);
    expect(gproc.detailCalls).toEqual([]);
    expect(gproc.invitationCalls).toBe(0);
    expect(enq).not.toHaveBeenCalled();
    expect(tor.sourceDocument?.kind).toBe("invitation");
    expect(tor.sourceContentHash).toBe("old");
    expect(tor.pipelineStatus).toBe(status);
    expect(r?.stats.torsUnchanged).toBe(1);
  });

  it("3c. a pending gproc TOR that already has a stored document is just queued (self-heal), once", async () => {
    await seedTor({ pipelineStatus: "pending", sourceDocument: seedSource() });
    const gproc = fakeGproc();
    const first = await run([{ projectCode: CODE }], { gproc, enqueueEnrichment: undefined });
    expect(first.run?.stats.torsUnchanged).toBe(1);
    expect(gproc.zipCalls).toEqual([]);
    expect(await EnrichmentJob.countDocuments()).toBe(1);
    const second = await run([{ projectCode: CODE }], { gproc, enqueueEnrichment: undefined });
    expect(second.run?.stats.torsUnchanged).toBe(1);
    expect(await EnrichmentJob.countDocuments()).toBe(1);
  });

  it("4. skips on a title hint that fails the gate, and on a lying hint", async () => {
    const gproc = fakeGproc();
    const { run: r } = await run([{ projectCode: CODE, title: "จ้างเหมาทำความสะอาด" }], { gproc });
    expect(gproc.detailCalls).toEqual([]);
    expect(r?.stats.torsSkipped).toBe(1);
    expect(await Tor.countDocuments()).toBe(0);

    const g2 = fakeGproc({ detail: (c) => detail(c, { projectName: "จ้างเหมาทำความสะอาด" }) });
    const o2 = await run([{ projectCode: CODE, title: "ซอฟต์แวร์" }], { gproc: g2 });
    expect(g2.detailCalls).toEqual([CODE]);
    expect(o2.run?.stats.torsSkipped).toBe(1);
    expect(await Tor.countDocuments()).toBe(0);
    expect(await SystemLog.countDocuments({ message: /not software related \(keyword gate\)/ })).toBe(1);
  });

  it("5. applies the keyword gate to the server title", async () => {
    const gproc = fakeGproc({ detail: (c) => detail(c, { projectName: "จ้างเหมาทำความสะอาด" }) });
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    expect(r?.stats.torsSkipped).toBe(1);
    expect(await Tor.countDocuments()).toBe(0);
    expect(enq).not.toHaveBeenCalled();
  });

  it("6. honours CAPTURE_AGENCIES", async () => {
    const gproc = fakeGproc();
    const a = await run([{ projectCode: CODE }], { gproc, env: { CAPTURE_AGENCIES: "สำนักการแพทย์" } });
    expect(a.run?.stats.torsSkipped).toBe(1);
    expect(await Tor.countDocuments()).toBe(0);

    const b = await run([{ projectCode: CODE }], { gproc: fakeGproc(), env: { CAPTURE_AGENCIES: "สำนักดิจิทัล" } });
    expect(b.run?.stats.torsCreated).toBe(1);

    await Tor.deleteMany({});
    const g3 = fakeGproc();
    const c = await run([{ projectCode: CODE, agency: "สำนักการแพทย์" }], { gproc: g3, env: { CAPTURE_AGENCIES: "สำนักดิจิทัล" } });
    expect(g3.detailCalls).toEqual([]);
    expect(c.run?.stats.torsSkipped).toBe(1);
  });

  it("7. skips a project unknown to process5", async () => {
    const { run: r } = await run([{ projectCode: CODE }], { gproc: fakeGproc({ detail: () => null }) });
    expect(r?.stats.torsSkipped).toBe(1);
    expect(await Tor.countDocuments()).toBe(0);
    expect(await SystemLog.countDocuments({ message: /unknown to process5/ })).toBe(1);
  });

  describe("8. no TOR file -> the invitation PDF", () => {
    const cases: Array<[string, Parameters<typeof fakeGproc>[0]]> = [
      ["no TOR entry in the zip", { zip: noTorZip, invitation }],
      ["no bundle at all", { bundle: () => null, invitation }],
      ["a corrupt zip", { zip: Buffer.from("PK\u0003\u0004junk"), invitation }],
      ["a failing download", { zip: new Error("boom"), invitation }],
    ];
    it.each(cases)("%s", async (_name, opts) => {
      const { run: r, enq } = await run([{ projectCode: CODE }], { gproc: fakeGproc(opts) });
      const tor = (await Tor.findOne({ projectCode: CODE }))!;
      expect(tor.sourceDocument?.kind).toBe("invitation");
      expect(tor.sourceDocument?.filename).toBe(`${CODE}-invitation.pdf`);
      expect(tor.sourceDocument?.storageKey?.endsWith("/invitation.pdf")).toBe(true);
      expect(enq).toHaveBeenCalledTimes(1);
      expect(r?.stats.torsCreated).toBe(1);
    });
  });

  it("8b. creates the TOR without a source document when there is none at all", async () => {
    for (const inv of [null, new Error("nope")]) {
      await Tor.deleteMany({});
      await SystemLog.deleteMany({});
      const { run: r, enq } = await run([{ projectCode: CODE }], { gproc: fakeGproc({ zip: noTorZip, invitation: inv }) });
      const tor = (await Tor.findOne({ projectCode: CODE }))!;
      expect(tor.procurement?.source).toBe("gproc");
      expect(tor.sourceDocument?.storageKey).toBeFalsy();
      expect(enq).not.toHaveBeenCalled();
      expect(r?.stats.torsCreated).toBe(1);
      expect(await SystemLog.countDocuments({ severity: "warning", message: new RegExp(CODE) })).toBeGreaterThanOrEqual(inv ? 2 : 1);
    }
  });

  it("9. falls back from the draft bundle to the published bundle", async () => {
    const gproc = fakeGproc({ bundle: (_c, draft) => (draft ? null : { zipId: "z-pub", name: "p.zip" }) });
    const { enq } = await run([{ projectCode: CODE }], { gproc });
    expect(gproc.zipCalls).toEqual(["z-pub"]);
    expect(enq).toHaveBeenCalledTimes(1);
  });

  it("10. isolates process5 errors and trips the breaker", async () => {
    const gproc = fakeGproc({ detail: () => new Error("503") });
    const codes = ["1", "2", "3", "4", "5"].map((n) => ({ projectCode: `6909931283${n}` }));
    const { run: r } = await run(codes, { gproc });
    expect(gproc.detailCalls.length).toBe(3);
    expect(r?.stats.torsFailed).toBe(3);
    expect(r?.stats.torsSkipped).toBe(2);
    expect(r?.status).toBe("partial");
    expect(r?.outcomeSummary).toContain("process5 paused");
    expect(await SystemLog.countDocuments({ severity: "warning", message: /paused/ })).toBe(1);

    // a success resets the counter: error, error, ok, error, error never trips it
    await IngestionRun.deleteMany({});
    await SystemLog.deleteMany({});
    const pattern = ["e", "e", "ok", "e", "e", "ok"];
    const g2 = fakeGproc({ detail: (c) => (pattern[Number(c.slice(-1)) - 1] === "e" ? new Error("503") : detail(c)) });
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({ projectCode: `6909931283${n}` }));
    const o2 = await run(six, { gproc: g2 });
    expect(g2.detailCalls.length).toBe(6);
    expect(o2.run?.stats.torsFailed).toBe(4);
    expect(o2.run?.stats.torsCreated).toBe(2);
    expect(o2.run?.outcomeSummary).not.toContain("paused");
  });

  it("10b. a run where every project failed and none was skipped is failed", async () => {
    const { run: r } = await run([{ projectCode: "69099312831" }, { projectCode: "69099312832" }], { gproc: fakeGproc({ detail: () => new Error("503") }) });
    expect(r?.stats.torsFailed).toBe(2);
    expect(r?.status).toBe("failed");
  });

  it("11. tolerates a duplicate code created while the detail was fetched", async () => {
    const gproc = fakeGproc({
      detail: (c) => {
        // fire-and-forget would race; insert synchronously via a pre-resolved promise chain below
        pending = Tor.create({ title: "ระบบสารสนเทศ", projectCode: c, pipelineStatus: "enriched" });
        return detail(c);
      },
    });
    let pending: Promise<unknown> = Promise.resolve();
    const origDetail = gproc.projectDetail.bind(gproc);
    gproc.projectDetail = async (c: string) => {
      const d = await origDetail(c);
      await pending;
      return d;
    };
    const { run: r, enq } = await run([{ projectCode: CODE }], { gproc });
    expect(r?.stats.torsUnchanged).toBe(1);
    expect(r?.stats.torsFailed).toBe(0);
    expect(await Tor.countDocuments({ projectCode: CODE })).toBe(1);
    expect(enq).not.toHaveBeenCalled();
  });

  it("12. dedupes the input", async () => {
    const gproc = fakeGproc();
    await run([{ projectCode: CODE }, { projectCode: CODE }], { gproc });
    expect(gproc.detailCalls).toEqual([CODE]);
  });

  it("13. sets ingestionRunId on the created TOR", async () => {
    const r = await IngestionRun.create({ trigger: "manual", phase: "capture", status: "running", stats: { torsFound: 1 } });
    await captureProjects(r._id, [{ projectCode: CODE }], {
      gproc: fakeGproc(), storage: storage(), enqueueEnrichment: async () => {}, parse: async () => ({ numpages: 1, text: "x".repeat(900) }), now: () => NOW, env: {},
    });
    const tor = (await Tor.findOne({ projectCode: CODE }))!;
    expect(String(tor.ingestionRunId)).toBe(String(r._id));
  });
});
