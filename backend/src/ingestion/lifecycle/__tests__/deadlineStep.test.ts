import mongoose from "mongoose";
import { ZodError } from "zod";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../../models";
import type { IProcurement } from "../../../models";
import type { EgpClientLike } from "../../../scraper/egpClient.types";
import type { BlobStorage } from "../../../storage/storage.types";
import type { BidDeadlineExtractor, BidDeadlineResult } from "../../enrichment/torExtractor";
import { runDeadlineStep } from "../deadlineStep";

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

const T = new Date("2026-10-03T00:00:00Z");
const PUBLISHED = new Date("2026-10-01T00:00:00Z");
const READ: BidDeadlineResult = { date: "2026-10-20", time: "16:30", confidence: 0.9 };
const NOT_READ: BidDeadlineResult = { date: null, time: null, confidence: 0 };

function procurementOf(over: Partial<IProcurement> = {}): IProcurement {
  return {
    stage: "inviting",
    contractStatus: "ระหว่างดำเนินการ",
    announcements: [
      { announcementId: "inv-1", kind: "invitation", hasFile: true, publishedAt: PUBLISHED, storageKey: null },
    ],
    lastCheckedAt: T,
    ...over,
  };
}

async function seed(p: IProcurement) {
  return Tor.create({ title: "โครงการ", projectCode: "code-1", pipelineStatus: "enriched", procurement: p });
}

function harness(result: BidDeadlineResult | Error = READ) {
  const downloads: string[] = [];
  const puts: string[] = [];
  const extractCalls: unknown[] = [];
  const client = {
    async downloadFile(id: string, name: string) {
      downloads.push(`${id}/${name}`);
      return Buffer.from("%PDF-1.4 fake");
    },
  } as unknown as EgpClientLike;
  const storage = {
    async put(key: string) {
      puts.push(key);
      return { key, size: 1 };
    },
  } as unknown as BlobStorage;
  const extractor: BidDeadlineExtractor = {
    async extractBidDeadline(input) {
      extractCalls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, storage, extractor, downloads, puts, extractCalls, now: () => T };
}

const filenames = new Map([["inv-1", "inv-1.pdf"], ["inv-2", "inv-2.pdf"]]);
const args = (p: IProcurement, torId: mongoose.Types.ObjectId) => ({
  torId,
  projectCode: "code-1",
  title: "โครงการ",
  procurement: p,
  filenames,
});

describe("runDeadlineStep", () => {
  it("downloads, reads and stores the deadline, the attempt and the storage key", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    const h = harness();

    const out = await runDeadlineStep(args(p, tor._id), h);

    expect(out).toBe("read");
    expect(h.downloads).toEqual(["inv-1/inv-1.pdf"]);
    expect(h.puts).toEqual(["tor-pdfs/code-1/inv-1.pdf"]);
    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.bidDeadline).toMatchObject({ source: "invitation-pdf", date: new Date("2026-10-20T09:30:00.000Z") });
    expect(saved?.deadlineAttempt).toMatchObject({ announcementId: "inv-1", outcome: "read" });
    expect(saved?.announcements[0]?.storageKey).toBe("tor-pdfs/code-1/inv-1.pdf");
  });

  it("records an unreadable attempt and leaves the deadline empty", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    expect(await runDeadlineStep(args(p, tor._id), harness(NOT_READ))).toBe("unreadable");
    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.bidDeadline ?? null).toBeNull();
    expect(saved?.deadlineAttempt).toMatchObject({ announcementId: "inv-1", outcome: "unreadable" });
  });

  it("discards a date earlier than the invitation's own publish date", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    const out = await runDeadlineStep(args(p, tor._id), harness({ date: "2026-09-01", time: null, confidence: 0.95 }));
    expect(out).toBe("unreadable");
    expect(((await Tor.findById(tor._id).lean())?.procurement?.bidDeadline ?? null)).toBeNull();
  });

  it("does nothing for a stage other than inviting", async () => {
    for (const stage of ["draft", "awarded", "cancelled"] as const) {
      const p = procurementOf({ stage });
      const tor = await seed(p);
      const h = harness();
      expect(await runDeadlineStep(args(p, tor._id), h)).toBe("skipped");
      expect(h.downloads).toEqual([]);
      await Tor.deleteMany({});
    }
  });

  it("does nothing when there is no invitation with a file", async () => {
    const p = procurementOf({
      announcements: [{ announcementId: "inv-1", kind: "invitation", hasFile: false, publishedAt: PUBLISHED }],
    });
    const tor = await seed(p);
    const h = harness();
    expect(await runDeadlineStep(args(p, tor._id), h)).toBe("skipped");
    expect(h.extractCalls).toHaveLength(0);
  });

  it("is tried once per announcement id", async () => {
    const p = procurementOf({ deadlineAttempt: { announcementId: "inv-1", at: T, outcome: "unreadable" } });
    const tor = await seed(p);
    const h = harness();
    expect(await runDeadlineStep(args(p, tor._id), h)).toBe("skipped");
    expect(h.extractCalls).toHaveLength(0);
  });

  it("never overrides an admin deadline", async () => {
    const adminBid = { date: new Date("2026-10-25T16:59:00Z"), source: "admin" as const, extractedAt: T };
    const p = procurementOf({ bidDeadline: adminBid });
    const tor = await seed(p);
    const h = harness();
    expect(await runDeadlineStep(args(p, tor._id), h)).toBe("skipped");
    expect(h.extractCalls).toHaveLength(0);
    expect((await Tor.findById(tor._id).lean())?.procurement?.bidDeadline?.source).toBe("admin");
  });

  it("uses the LATEST invitation and clears a stale AI deadline when the new one is unreadable", async () => {
    const oldBid = { date: new Date("2026-10-10T16:59:00Z"), source: "invitation-pdf" as const, extractedAt: PUBLISHED };
    const p = procurementOf({
      bidDeadline: oldBid,
      deadlineAttempt: { announcementId: "inv-1", at: PUBLISHED, outcome: "read" },
      announcements: [
        { announcementId: "inv-1", kind: "invitation", hasFile: true, publishedAt: PUBLISHED, storageKey: "k1" },
        { announcementId: "inv-2", kind: "invitation", hasFile: true, publishedAt: new Date("2026-10-02T00:00:00Z"), storageKey: null },
      ],
    });
    const tor = await seed(p);
    const h = harness(NOT_READ);

    expect(await runDeadlineStep(args(p, tor._id), h)).toBe("unreadable");

    expect(h.downloads).toEqual(["inv-2/inv-2.pdf"]);
    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.bidDeadline ?? null).toBeNull();
    expect(saved?.deadlineAttempt?.announcementId).toBe("inv-2");
    expect(saved?.announcements.find((a) => a.announcementId === "inv-1")?.storageKey).toBe("k1");
    expect(saved?.announcements.find((a) => a.announcementId === "inv-2")?.storageKey).toBe("tor-pdfs/code-1/inv-2.pdf");
  });

  it("writes nothing and reports a conflict when procurement moved after the refresh wrote it", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    await Tor.updateOne({ _id: tor._id }, { $set: { "procurement.lastCheckedAt": new Date("2026-10-03T00:00:05Z") } }, { timestamps: false });

    expect(await runDeadlineStep(args(p, tor._id), harness())).toBe("conflict");

    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.bidDeadline ?? null).toBeNull();
    expect(saved?.deadlineAttempt ?? null).toBeNull(); // retried next run
  });

  it("reports a conflict and keeps an admin deadline set while the PDF was being read", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    const adminDate = new Date("2026-10-25T16:59:00Z");
    const h = harness();
    const slow: BidDeadlineExtractor = {
      async extractBidDeadline(input) {
        await Tor.updateOne(
          { _id: tor._id },
          { $set: { "procurement.bidDeadline": { date: adminDate, source: "admin", extractedAt: T } } },
          { timestamps: false }
        );
        return h.extractor.extractBidDeadline(input);
      },
    };

    expect(await runDeadlineStep(args(p, tor._id), { ...h, extractor: slow })).toBe("conflict");

    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.bidDeadline).toMatchObject({ source: "admin", date: adminDate });
    expect(saved?.deadlineAttempt ?? null).toBeNull();
  });

  describe("latest invitation without a usable file", () => {
    const staleBid = { date: new Date("2026-10-10T16:59:00Z"), source: "invitation-pdf" as const, extractedAt: PUBLISHED };
    const twoInvitations = (over: Partial<IProcurement> = {}, newHasFile = false) =>
      procurementOf({
        bidDeadline: staleBid,
        deadlineAttempt: { announcementId: "inv-1", at: PUBLISHED, outcome: "read" },
        announcements: [
          { announcementId: "inv-1", kind: "invitation", hasFile: true, publishedAt: PUBLISHED, storageKey: "k1" },
          { announcementId: "inv-2", kind: "invitation", hasFile: newHasFile, publishedAt: new Date("2026-10-02T00:00:00Z") },
        ],
        ...over,
      });

    it("clears a stale AI deadline without calling Gemini or recording an attempt", async () => {
      const p = twoInvitations();
      const tor = await seed(p);
      const h = harness();
      expect(await runDeadlineStep(args(p, tor._id), h)).toBe("cleared");
      expect(h.extractCalls).toHaveLength(0);
      expect(h.downloads).toEqual([]);
      const saved = (await Tor.findById(tor._id).lean())?.procurement;
      expect(saved?.bidDeadline ?? null).toBeNull();
      expect(saved?.deadlineAttempt?.announcementId).toBe("inv-1"); // no attempt for inv-2
      expect(saved?.lastCheckedAt).toEqual(T);
    });

    it("leaves an admin deadline untouched", async () => {
      const adminBid = { date: new Date("2026-10-25T16:59:00Z"), source: "admin" as const, extractedAt: T };
      const p = twoInvitations({ bidDeadline: adminBid });
      const tor = await seed(p);
      const h = harness();
      expect(await runDeadlineStep(args(p, tor._id), h)).toBe("skipped");
      expect((await Tor.findById(tor._id).lean())?.procurement?.bidDeadline?.source).toBe("admin");
    });

    it("clears the same way when the latest invitation has a file but no e-GP file name", async () => {
      const p = twoInvitations({}, true);
      const tor = await seed(p);
      const h = harness();
      const noName = new Map([["inv-1", "inv-1.pdf"]]);
      expect(await runDeadlineStep({ ...args(p, tor._id), filenames: noName }, h)).toBe("cleared");
      expect(h.extractCalls).toHaveLength(0);
      expect(((await Tor.findById(tor._id).lean())?.procurement?.bidDeadline ?? null)).toBeNull();
    });

    it("skips when there is nothing stale to clear", async () => {
      const p = twoInvitations({ bidDeadline: undefined });
      const tor = await seed(p);
      expect(await runDeadlineStep(args(p, tor._id), harness())).toBe("skipped");
    });
  });

  describe("extractor errors", () => {
    it.each([
      ["a ZodError", () => new ZodError([])],
      ["invalid JSON", () => new Error("Gemini returned invalid JSON: {")],
      ["a 400", () => Object.assign(new Error("bad request"), { status: 400 })],
      ["a 422 code", () => Object.assign(new Error("unprocessable"), { code: 422 })],
      ["a 413", () => Object.assign(new Error("too large"), { status: 413 })],
    ])("treats %s as unreadable and records the attempt", async (_n, make) => {
      const p = procurementOf();
      const tor = await seed(p);
      expect(await runDeadlineStep(args(p, tor._id), harness(make()))).toBe("unreadable");
      const saved = (await Tor.findById(tor._id).lean())?.procurement;
      expect(saved?.deadlineAttempt).toMatchObject({ announcementId: "inv-1", outcome: "unreadable" });
      expect(saved?.announcements[0]?.storageKey).toBe("tor-pdfs/code-1/inv-1.pdf");
    });

    it.each([
      ["a 401", () => Object.assign(new Error("unauthenticated"), { status: 401 })],
      ["a 403", () => Object.assign(new Error("permission denied"), { code: 403 })],
      ["a 404", () => Object.assign(new Error("model not found"), { status: 404 })],
      ["a 408", () => Object.assign(new Error("timeout"), { status: 408 })],
      ["a string code", () => Object.assign(new Error("x"), { code: "PERMISSION_DENIED" })],
      ["a 429", () => Object.assign(new Error("rate"), { status: 429 })],
      ["a 503", () => Object.assign(new Error("down"), { code: 503 })],
      ["a network error", () => new Error("ECONNRESET")],
    ])("rethrows %s and records nothing", async (_n, make) => {
      const p = procurementOf();
      const tor = await seed(p);
      await expect(runDeadlineStep(args(p, tor._id), harness(make()))).rejects.toThrow();
      expect(((await Tor.findById(tor._id).lean())?.procurement?.deadlineAttempt ?? null)).toBeNull();
    });

    it("a 403 does not clear an existing AI deadline", async () => {
      const bid = { date: new Date("2026-10-30T16:59:00Z"), source: "invitation-pdf" as const, extractedAt: PUBLISHED };
      const p = procurementOf({ bidDeadline: bid });
      const tor = await seed(p);
      const err = Object.assign(new Error("permission denied"), { code: 403 });
      await expect(runDeadlineStep(args(p, tor._id), harness(err))).rejects.toThrow();
      expect((await Tor.findById(tor._id).lean())?.procurement?.bidDeadline?.date).toEqual(bid.date);
    });
  });

  it("propagates an extractor error without recording an attempt", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    await expect(runDeadlineStep(args(p, tor._id), harness(new Error("Gemini 500")))).rejects.toThrow("Gemini 500");
    expect(((await Tor.findById(tor._id).lean())?.procurement?.deadlineAttempt ?? null)).toBeNull();
  });
});
