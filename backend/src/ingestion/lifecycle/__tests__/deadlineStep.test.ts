import mongoose from "mongoose";
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

  it("propagates an extractor error without recording an attempt", async () => {
    const p = procurementOf();
    const tor = await seed(p);
    await expect(runDeadlineStep(args(p, tor._id), harness(new Error("Gemini 500")))).rejects.toThrow("Gemini 500");
    expect(((await Tor.findById(tor._id).lean())?.procurement?.deadlineAttempt ?? null)).toBeNull();
  });
});
