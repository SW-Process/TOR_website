import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../models";
import {
  CLOSING_SOON_DAYS,
  TOR_STATUSES,
  computeTorStatus,
  statusClause,
  withDisplayStatus,
  type StatusInput,
  type TorDisplayStatus,
} from "../torStatus";

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

const NOW = new Date("2026-10-04T00:00:00.000Z");
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const stage = (s: string) => ({ stage: s, announcements: [], lastCheckedAt: NOW });
const inviting = (deadline?: Date) => ({
  ...stage("inviting"),
  ...(deadline ? { bidDeadline: { date: deadline, source: "admin", extractedAt: NOW } } : {}),
});

const cases: { name: string; doc: Record<string, unknown>; expected: TorDisplayStatus }[] = [
  { name: "no procurement yet", doc: {}, expected: "draft" },
  { name: "stored closing_soon but no procurement", doc: { status: "closing_soon" }, expected: "draft" },
  { name: "procurement explicitly null", doc: { procurement: null }, expected: "draft" },
  { name: "draft stage", doc: { procurement: stage("draft") }, expected: "draft" },
  { name: "awarded", doc: { procurement: stage("awarded") }, expected: "awarded" },
  { name: "cancelled", doc: { procurement: stage("cancelled") }, expected: "cancelled" },
  { name: "awarded with a stored bid deadline (past)", doc: { procurement: { ...stage("awarded"), bidDeadline: { date: at(-5 * DAY), source: "invitation-pdf", extractedAt: NOW } } }, expected: "awarded" },
  { name: "awarded with a stored bid deadline (soon)", doc: { procurement: { ...stage("awarded"), bidDeadline: { date: at(2 * DAY), source: "invitation-pdf", extractedAt: NOW } } }, expected: "awarded" },
  { name: "inviting, deadline unknown", doc: { procurement: inviting() }, expected: "open" },
  { name: "inviting, 10 days away", doc: { procurement: inviting(at(10 * DAY)) }, expected: "open" },
  { name: "inviting, 1 ms beyond the closing-soon window", doc: { procurement: inviting(at(CLOSING_SOON_DAYS * DAY + 1)) }, expected: "open" },
  { name: "inviting, exactly at the closing-soon window", doc: { procurement: inviting(at(CLOSING_SOON_DAYS * DAY)) }, expected: "closing_soon" },
  { name: "inviting, 3 days away", doc: { procurement: inviting(at(3 * DAY)) }, expected: "closing_soon" },
  { name: "inviting, deadline exactly now", doc: { procurement: inviting(at(0)) }, expected: "closing_soon" },
  { name: "inviting, deadline 1 ms ago", doc: { procurement: inviting(at(-1)) }, expected: "closed" },
  { name: "manually closed overrides inviting", doc: { status: "closed", procurement: inviting(at(10 * DAY)) }, expected: "closed" },
  { name: "manually closed overrides awarded", doc: { status: "closed", procurement: stage("awarded") }, expected: "closed" },
  { name: "manually closed with no procurement", doc: { status: "closed" }, expected: "closed" },
];

describe("computeTorStatus", () => {
  it.each(cases)("$name → $expected", ({ doc, expected }) => {
    expect(computeTorStatus(doc as StatusInput, NOW)).toBe(expected);
  });

  it("reads plain JSON too (ISO date strings, null procurement)", () => {
    expect(computeTorStatus({ procurement: { stage: "inviting", bidDeadline: { date: at(2 * DAY).toISOString() } } }, NOW)).toBe("closing_soon");
    expect(computeTorStatus({ procurement: null }, NOW)).toBe("draft");
  });

  it("treats an unparseable deadline as unknown and an unknown stage as draft", () => {
    expect(computeTorStatus({ procurement: { stage: "inviting", bidDeadline: { date: "not-a-date" } } }, NOW)).toBe("open");
    expect(computeTorStatus({ procurement: { stage: "bogus" } }, NOW)).toBe("draft");
  });
});

describe("statusClause agrees with computeTorStatus", () => {
  it("every case matches exactly the one clause computeTorStatus names", async () => {
    await Tor.insertMany(cases.map((c, i) => ({ title: `case-${i}`, pipelineStatus: "enriched", ...c.doc })));

    for (const status of TOR_STATUSES) {
      const found = (await Tor.find(statusClause(status, NOW)).lean()).map((t) => t.title).sort();
      const expected = cases
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.expected === status)
        .map(({ i }) => `case-${i}`)
        .sort();
      expect({ status, found }).toEqual({ status, found: expected });
    }
  });
});

describe("statusClause with an unknown stage", () => {
  it("treats it as draft in both computeTorStatus and the draft clause only", async () => {
    // Raw insert: the schema enum would reject this through Mongoose.
    const doc = { title: "unknown-stage", pipelineStatus: "enriched", procurement: { stage: "bogus", announcements: [], lastCheckedAt: NOW } };
    await Tor.collection.insertOne({ ...doc });
    expect(computeTorStatus(doc as StatusInput, NOW)).toBe("draft");
    for (const status of TOR_STATUSES) {
      const found = (await Tor.find(statusClause(status, NOW)).lean()).map((t) => t.title);
      expect({ status, found }).toEqual({ status, found: status === "draft" ? ["unknown-stage"] : [] });
    }
  });
});

describe("withDisplayStatus", () => {
  it("adds displayStatus without mutating or dropping fields", () => {
    const row = { title: "x", procurement: { stage: "awarded" } };
    const out = withDisplayStatus(row, NOW);
    expect(out).toEqual({ title: "x", procurement: { stage: "awarded" }, displayStatus: "awarded" });
    expect(row).not.toHaveProperty("displayStatus");
  });
});
