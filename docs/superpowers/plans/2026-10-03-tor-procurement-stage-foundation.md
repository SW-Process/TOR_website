# TOR Procurement Stage — Foundation (Delivery Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `Tor` a `procurement` sub-document (stage, announcements, contract status) that discovery fills in, and stop a contract-status change from re-triggering AI enrichment.

**Architecture:** A pure module (`procurementStage.ts`) classifies e-GP announcements and derives the stage; `mapProject` emits a fresh `procurement` payload and a contract-status-free content hash; `runIngestion` merges the payload onto the `Tor` (preserving fields later steps own: `bidDeadline`, per-announcement `storageKey`) and adopts the new hash quietly when the stored one is the legacy form.

**Tech Stack:** TypeScript, Mongoose 9, Express 5, Jest + mongodb-memory-server (`npm test` in `backend/`).

**Spec:** `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md` (this plan is delivery step 1 of 4; steps 2–4 get their own plans once this lands).

## Global Constraints

- Stage values exactly: `draft | inviting | awarded | cancelled`.
- Announcement kinds exactly: `tor-draft | bidding-draft | reference-price | invitation | cancellation | winner | plan | unknown`.
- Stage precedence: `cancelled` (contract status "ยกเลิกโครงการ", or the latest of invitation/cancellation is a cancellation) → `awarded` (any winner) → `inviting` (any invitation) → `draft`. `unknown` announcements never decide the stage.
- Nothing in this plan may enqueue enrichment for a TOR whose only change is contract status.
- Do not touch the AI enrichment pipeline, `submissionDeadline`, or the public `status` field (those are steps 3–4).
- Commits: Conventional Commits (`<type>(<scope>): <what>`, imperative, no trailing period), one thing per commit, **no `Co-Authored-By` trailer** (project memory rule). Stage only the named files — the working tree has unrelated modified files.
- Branch off `main` as `feat/tor-procurement-stage`; never push to `main`.
- Verification gate for every task: `cd backend && npm run typecheck` and the task's jest command.

## Review Focus

Failure modes the spec implies that are most likely to bite a person using this:

1. An announcement with a null/"ไม่ระบุ" type or no publish date (23 of 70 sampled projects had null types) must not decide or break the stage → pinned in Task 2.
2. A cancellation and a re-invitation with the same publish timestamp (e-GP dates are day-granular) must read as still inviting, not cancelled → pinned in Task 2.
3. A TOR whose stored hash is the legacy form must be adopted silently — not re-enriched and not counted as updated → pinned in Task 5.
4. A refresh must keep an admin-entered `bidDeadline` and a stored `storageKey` instead of wiping them → pinned in Tasks 3 and 5.
5. The public `GET /api/tors/:id` must not leak `procurement.announcements[].storageKey` (internal blob keys) → pinned in Task 6.

---

### Task 0: Branch and commit the design docs

**Files:**
- Add: `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md`
- Add: `docs/superpowers/plans/2026-10-03-tor-procurement-stage-foundation.md`

- [ ] **Step 1: Create the branch from main**

```bash
git checkout main
git pull
git checkout -b feat/tor-procurement-stage
git status --short
```

Expected: on `feat/tor-procurement-stage`; `git status` still lists the two untracked docs (and any unrelated pre-existing changes, which you must leave alone).

- [ ] **Step 2: Commit only the two docs**

```bash
git add docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md docs/superpowers/plans/2026-10-03-tor-procurement-stage-foundation.md
git commit -m "docs(backend): add procurement lifecycle spec and step-1 plan"
```

---

### Task 1: `Tor.procurement` schema

**Files:**
- Modify: `backend/src/models/Tor.ts`
- Modify: `backend/src/models/index.ts:30`
- Test: `backend/src/models/__tests__/tor.procurement.test.ts` (create)

**Interfaces:**
- Produces (exported from `models/Tor.ts`, re-exported as types from `models/index.ts`):
  - `type ProcurementStage = "draft" | "inviting" | "awarded" | "cancelled"`
  - `type AnnouncementKind = "tor-draft" | "bidding-draft" | "reference-price" | "invitation" | "cancellation" | "winner" | "plan" | "unknown"`
  - `interface IProcurementAnnouncement { announcementId: string; typeName?: string; kind: AnnouncementKind; publishedAt?: Date; hasFile: boolean; storageKey?: string | null }`
  - `interface IBidDeadline { date: Date; source: "invitation-pdf" | "admin"; extractedAt: Date }`
  - `interface IProcurement { stage: ProcurementStage; contractStatus?: string; announcements: IProcurementAnnouncement[]; bidDeadline?: IBidDeadline | null; lastCheckedAt: Date }`
  - `ITor.procurement?: IProcurement | null`
  - Indexes `{ "procurement.stage": 1 }` and `{ "procurement.lastCheckedAt": 1 }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/models/__tests__/tor.procurement.test.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../Tor";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Tor.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Tor.deleteMany({});
});

describe("Tor.procurement", () => {
  it("defaults to null", async () => {
    const tor = await Tor.create({ title: "x" });
    expect(tor.procurement).toBeNull();
  });

  it("round-trips stage, announcements and bidDeadline", async () => {
    const lastCheckedAt = new Date("2026-10-03T00:00:00Z");
    const tor = await Tor.create({
      title: "x",
      procurement: {
        stage: "inviting",
        contractStatus: "ระหว่างดำเนินการ",
        announcements: [
          {
            announcementId: "a-1",
            typeName: "ประกาศเชิญชวน",
            kind: "invitation",
            publishedAt: new Date("2026-09-01T00:00:00Z"),
            hasFile: true,
            storageKey: "tor-pdfs/1/a-1.pdf",
          },
        ],
        bidDeadline: { date: new Date("2026-10-20T00:00:00Z"), source: "admin", extractedAt: lastCheckedAt },
        lastCheckedAt,
      },
    });
    const saved = await Tor.findById(tor.id).lean();
    expect(saved?.procurement?.stage).toBe("inviting");
    expect(saved?.procurement?.announcements[0]).toMatchObject({ kind: "invitation", hasFile: true });
    expect(saved?.procurement?.bidDeadline?.source).toBe("admin");
  });

  it("rejects an unknown stage", async () => {
    await expect(
      Tor.create({ title: "x", procurement: { stage: "bogus", announcements: [], lastCheckedAt: new Date() } as never })
    ).rejects.toThrow();
  });

  it("rejects an unknown announcement kind", async () => {
    await expect(
      Tor.create({
        title: "x",
        procurement: {
          stage: "draft",
          announcements: [{ announcementId: "a", kind: "bogus", hasFile: false }],
          lastCheckedAt: new Date(),
        } as never,
      })
    ).rejects.toThrow();
  });

  it("indexes stage and lastCheckedAt", async () => {
    const keys = (await Tor.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(keys).toContain(JSON.stringify({ "procurement.stage": 1 }));
    expect(keys).toContain(JSON.stringify({ "procurement.lastCheckedAt": 1 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --runInBand src/models/__tests__/tor.procurement.test.ts`
Expected: FAIL (TypeScript error: `procurement` does not exist on type, or `tor.procurement` is `undefined` not `null`).

- [ ] **Step 3: Implement the types and schema**

In `backend/src/models/Tor.ts`, after the `TorPipelineStatus` type (line 6) add:

```ts
export type ProcurementStage = "draft" | "inviting" | "awarded" | "cancelled";

export const ANNOUNCEMENT_KINDS = [
  "tor-draft",
  "bidding-draft",
  "reference-price",
  "invitation",
  "cancellation",
  "winner",
  "plan",
  "unknown",
] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];
```

After the `ISourceDocument` interface (ends line 25) add:

```ts
export interface IProcurementAnnouncement {
  announcementId: string;
  typeName?: string;
  kind: AnnouncementKind;
  publishedAt?: Date;
  hasFile: boolean;
  /** Our stored copy's blob key. Internal — never exposed publicly. */
  storageKey?: string | null;
}

export interface IBidDeadline {
  date: Date;
  source: "invitation-pdf" | "admin";
  extractedAt: Date;
}

export interface IProcurement {
  stage: ProcurementStage;
  /** Raw e-GP contract status, e.g. "ระหว่างดำเนินการ". */
  contractStatus?: string;
  announcements: IProcurementAnnouncement[];
  bidDeadline?: IBidDeadline | null;
  lastCheckedAt: Date;
}
```

In `interface ITor`, after `sourceDocument?: ISourceDocument | null;` add:

```ts
  procurement?: IProcurement | null;
```

After the `sourceDocumentSchema` definition (ends line 163) add:

```ts
/**
 * procurement — where the project sits in the e-GP procurement lifecycle, derived from its
 * announcements and contract status. Always fetched with the TOR.
 */
const procurementAnnouncementSchema = new Schema<IProcurementAnnouncement>(
  {
    announcementId: { type: String, required: true },
    typeName: { type: String },
    kind: { type: String, enum: ANNOUNCEMENT_KINDS, required: true },
    publishedAt: { type: Date },
    hasFile: { type: Boolean, default: false },
    storageKey: { type: String, default: null },
  },
  { _id: false }
);

const bidDeadlineSchema = new Schema<IBidDeadline>(
  {
    date: { type: Date, required: true },
    source: { type: String, enum: ["invitation-pdf", "admin"], required: true },
    extractedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const procurementSchema = new Schema<IProcurement>(
  {
    stage: { type: String, enum: ["draft", "inviting", "awarded", "cancelled"], required: true },
    contractStatus: { type: String },
    announcements: { type: [procurementAnnouncementSchema], default: [] },
    bidDeadline: { type: bidDeadlineSchema, default: null },
    lastCheckedAt: { type: Date, required: true },
  },
  { _id: false }
);
```

In `torSchema`, after `sourceDocument: { type: sourceDocumentSchema, default: null },` add:

```ts
    procurement: { type: procurementSchema, default: null },
```

After `torSchema.index({ categoryTags: 1 });` add:

```ts
// Procurement lifecycle (stage filter; refresh job picks the oldest-checked first)
torSchema.index({ "procurement.stage": 1 });
torSchema.index({ "procurement.lastCheckedAt": 1 });
```

In `backend/src/models/index.ts` line 30, extend the type export:

```ts
export type { ITor, IAiSummary, IFairnessFlag, ISourceDocument, SourceTextLayer, TorPipelineStatus, IClassification, ProcurementStage, AnnouncementKind, IProcurementAnnouncement, IBidDeadline, IProcurement } from "./Tor";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/models`
Expected: typecheck clean; all model tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/Tor.ts backend/src/models/index.ts backend/src/models/__tests__/tor.procurement.test.ts
git commit -m "feat(backend): add procurement sub-document to Tor"
```

---

### Task 2: Announcement classification and stage derivation

**Files:**
- Create: `backend/src/ingestion/procurementStage.ts`
- Test: `backend/src/ingestion/__tests__/procurementStage.test.ts` (create)

**Interfaces:**
- Consumes: `AnnouncementKind`, `ProcurementStage`, `IProcurementAnnouncement` from `../models/Tor`.
- Produces:
  - `classifyAnnouncement(typeName: string | null | undefined): AnnouncementKind`
  - `deriveStage(announcements: ReadonlyArray<Pick<IProcurementAnnouncement, "kind" | "publishedAt">>, contractStatus: string | null | undefined): ProcurementStage`

- [ ] **Step 1: Write the failing test**

Create `backend/src/ingestion/__tests__/procurementStage.test.ts`:

```ts
import type { AnnouncementKind } from "../../models/Tor";
import { classifyAnnouncement, deriveStage } from "../procurementStage";

describe("classifyAnnouncement", () => {
  it.each([
    ["ร่างขอบเขตของงาน (TOR)", "tor-draft"],
    ["ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา", "bidding-draft"],
    ["ประกาศราคากลาง", "reference-price"],
    ["ประกาศเชิญชวน", "invitation"],
    ["ยกเลิกประกาศเชิญชวน", "cancellation"],
    ["ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศรายชื่อผู้ได้รับการคัดเลือก", "winner"],
    ["แผนการจัดซื้อจัดจ้าง", "plan"],
    ["ไม่ระบุ", "unknown"],
    ["  ", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
    ["ประกาศอื่นที่ไม่เคยเห็น", "unknown"],
  ] as [string | null | undefined, AnnouncementKind][])("%p → %s", (name, kind) => {
    expect(classifyAnnouncement(name)).toBe(kind);
  });

  it("tolerates surrounding whitespace", () => {
    expect(classifyAnnouncement("  ประกาศเชิญชวน ")).toBe("invitation");
  });
});

const at = (day: number) => new Date(Date.UTC(2026, 8, day));
const a = (kind: AnnouncementKind, day?: number) => ({
  kind,
  publishedAt: day === undefined ? undefined : at(day),
});

describe("deriveStage", () => {
  it("is draft with only drafts, a reference price or a plan", () => {
    expect(deriveStage([a("tor-draft", 1)], null)).toBe("draft");
    expect(deriveStage([a("tor-draft", 1), a("bidding-draft", 2), a("reference-price", 3)], null)).toBe("draft");
    expect(deriveStage([a("plan", 1)], null)).toBe("draft");
    expect(deriveStage([], null)).toBe("draft");
  });

  it("is inviting once an invitation exists and nothing later settles it", () => {
    expect(deriveStage([a("tor-draft", 1), a("invitation", 2)], "ระหว่างดำเนินการ")).toBe("inviting");
  });

  it("is awarded when a winner announcement exists, with or without an invitation", () => {
    expect(deriveStage([a("tor-draft", 1), a("invitation", 2), a("winner", 3)], null)).toBe("awarded");
    expect(deriveStage([a("winner", 3)], null)).toBe("awarded");
  });

  it("is cancelled when a cancellation is the latest invitation-related announcement", () => {
    expect(deriveStage([a("bidding-draft", 1), a("invitation", 2), a("cancellation", 3)], null)).toBe("cancelled");
  });

  it("is inviting again when re-invited after a cancellation", () => {
    expect(deriveStage([a("invitation", 1), a("cancellation", 2), a("invitation", 3)], null)).toBe("inviting");
  });

  it("treats a cancellation and invitation with the same timestamp as still inviting, in either order", () => {
    expect(deriveStage([a("cancellation", 2), a("invitation", 2)], null)).toBe("inviting");
    expect(deriveStage([a("invitation", 2), a("cancellation", 2)], null)).toBe("inviting");
  });

  it("lets a contract status of ยกเลิกโครงการ override everything, ignoring whitespace", () => {
    expect(deriveStage([a("winner", 3)], "ยกเลิกโครงการ")).toBe("cancelled");
    expect(deriveStage([a("invitation", 2)], "  ยกเลิกโครงการ ")).toBe("cancelled");
  });

  it("ignores unknown announcements and tolerates missing dates", () => {
    expect(deriveStage([a("unknown"), a("unknown", 5)], null)).toBe("draft");
    expect(deriveStage([a("unknown", 5), a("invitation", 1)], null)).toBe("inviting");
    // a dateless invitation counts as the earliest event, so a dated cancellation after it wins
    expect(deriveStage([a("invitation"), a("cancellation", 3)], null)).toBe("cancelled");
    expect(deriveStage([a("invitation"), a("cancellation")], null)).toBe("inviting"); // tie → invitation
  });

  it("does not depend on input order", () => {
    expect(deriveStage([a("cancellation", 3), a("invitation", 2)], null)).toBe("cancelled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --runInBand src/ingestion/__tests__/procurementStage.test.ts`
Expected: FAIL — `Cannot find module '../procurementStage'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/ingestion/procurementStage.ts`:

```ts
import type { AnnouncementKind, IProcurementAnnouncement, ProcurementStage } from "../models/Tor";

const CANCELLED_CONTRACT_STATUS = "ยกเลิกโครงการ";

/** Map an e-GP `masterAnnounceTypeName` onto our fixed set of announcement kinds. */
export function classifyAnnouncement(typeName: string | null | undefined): AnnouncementKind {
  const name = typeName?.trim() ?? "";
  if (name === "" || name === "ไม่ระบุ") return "unknown";
  if (name.startsWith("ยกเลิก")) return "cancellation";
  if (name.startsWith("ร่างขอบเขตของงาน")) return "tor-draft";
  if (name.startsWith("ร่างเอกสารประกวดราคา")) return "bidding-draft";
  if (name.startsWith("ประกาศเชิญชวน")) return "invitation";
  if (name.includes("ผู้ชนะ") || name.includes("ผู้ได้รับการคัดเลือก")) return "winner";
  if (name.includes("ราคากลาง")) return "reference-price";
  if (name.startsWith("แผนการจัดซื้อ")) return "plan";
  return "unknown";
}

type StageInput = Pick<IProcurementAnnouncement, "kind" | "publishedAt">;

const timeOf = (a: StageInput): number => a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

/**
 * Is `a` a later invitation-related event than `best`? A missing date sorts earliest. On an
 * exact tie the invitation wins, so a same-day cancel + re-invite is not read as cancelled
 * (e-GP publish dates are day-granular).
 */
function isLater(a: StageInput, best: StageInput): boolean {
  const ta = timeOf(a);
  const tb = timeOf(best);
  return ta > tb || (ta === tb && a.kind === "invitation");
}

/**
 * Where the project sits in the procurement lifecycle. Precedence: cancelled → awarded →
 * inviting → draft. `unknown` announcements never decide anything.
 */
export function deriveStage(
  announcements: ReadonlyArray<StageInput>,
  contractStatus: string | null | undefined
): ProcurementStage {
  if (contractStatus?.trim() === CANCELLED_CONTRACT_STATUS) return "cancelled";

  const invitationEvents = announcements.filter((a) => a.kind === "invitation" || a.kind === "cancellation");
  const latest = invitationEvents.reduce<StageInput | null>(
    (best, a) => (best === null || isLater(a, best) ? a : best),
    null
  );
  if (latest?.kind === "cancellation") return "cancelled";

  if (announcements.some((a) => a.kind === "winner")) return "awarded";
  if (announcements.some((a) => a.kind === "invitation")) return "inviting";
  return "draft";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion/__tests__/procurementStage.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/procurementStage.ts backend/src/ingestion/__tests__/procurementStage.test.ts
git commit -m "feat(backend): derive procurement stage from e-GP announcements"
```

---

### Task 3: Build and merge the `procurement` payload

**Files:**
- Modify: `backend/src/ingestion/procurementStage.ts`
- Test: `backend/src/ingestion/__tests__/procurementStage.test.ts`

**Interfaces:**
- Consumes: `EgpAnnouncement` from `../scraper/egpClient.types`; `IProcurement`, `IProcurementAnnouncement` from `../models/Tor`; `classifyAnnouncement`, `deriveStage` (Task 2).
- Produces:
  - `buildProcurement(announcements: EgpAnnouncement[], contractStatus: string | null | undefined, now: Date): IProcurement` — announcements sorted oldest first (undated first, stable), `storageKey` unset, no `bidDeadline`.
  - `mergeProcurement(existing: IProcurement | null | undefined, fresh: IProcurement): IProcurement` — returns `fresh` plus the existing `bidDeadline` and, per `announcementId`, the existing `storageKey` (else `null`).

- [ ] **Step 1: Write the failing test**

Append to `backend/src/ingestion/__tests__/procurementStage.test.ts` (add the imports at the top of the file: `import type { EgpAnnouncement } from "../../scraper/egpClient.types";` and extend the existing import to `import { buildProcurement, classifyAnnouncement, deriveStage, mergeProcurement } from "../procurementStage";` and `import type { AnnouncementKind, IProcurement } from "../../models/Tor";`):

```ts
const NOW = new Date("2026-10-03T00:00:00Z");

const egp = (id: string, typeName: string | null, publishDate: string | null, path: string | null = "f.pdf"): EgpAnnouncement => ({
  id,
  masterAnnounceTypeName: typeName,
  projectAnnouncementPublishDate: publishDate,
  projectAnnouncementPath: path,
});

describe("buildProcurement", () => {
  it("classifies, sorts oldest first, and derives the stage", () => {
    const p = buildProcurement(
      [
        egp("inv", "ประกาศเชิญชวน", "2026-09-10T00:00:00Z"),
        egp("tor", "ร่างขอบเขตของงาน (TOR)", "2026-09-01T00:00:00Z"),
        egp("nodate", null, null, null),
      ],
      " ระหว่างดำเนินการ ",
      NOW
    );
    expect(p.announcements.map((x) => x.announcementId)).toEqual(["nodate", "tor", "inv"]);
    expect(p.announcements[0]).toMatchObject({ kind: "unknown", hasFile: false, publishedAt: undefined });
    expect(p.announcements[2]).toMatchObject({ kind: "invitation", hasFile: true });
    expect(p.announcements[2]?.publishedAt).toEqual(new Date("2026-09-10T00:00:00Z"));
    expect(p.stage).toBe("inviting");
    expect(p.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(p.lastCheckedAt).toBe(NOW);
    expect(p.bidDeadline).toBeUndefined();
  });

  it("ignores an unparseable publish date and an empty contract status", () => {
    const p = buildProcurement([egp("a", "ประกาศเชิญชวน", "not-a-date")], "  ", NOW);
    expect(p.announcements[0]?.publishedAt).toBeUndefined();
    expect(p.contractStatus).toBeUndefined();
  });

  it("returns draft with no announcements", () => {
    expect(buildProcurement([], null, NOW).stage).toBe("draft");
  });
});

describe("mergeProcurement", () => {
  const fresh = (): IProcurement =>
    buildProcurement(
      [egp("tor", "ร่างขอบเขตของงาน (TOR)", "2026-09-01T00:00:00Z"), egp("inv", "ประกาศเชิญชวน", "2026-09-10T00:00:00Z")],
      "ระหว่างดำเนินการ",
      NOW
    );

  it("returns fresh data with null storageKeys and no deadline when nothing existed", () => {
    const merged = mergeProcurement(null, fresh());
    expect(merged.stage).toBe("inviting");
    expect(merged.announcements.every((x) => x.storageKey === null)).toBe(true);
    expect(merged.bidDeadline).toBeNull();
  });

  it("keeps the existing bidDeadline and per-announcement storageKey across a refresh", () => {
    const existing: IProcurement = {
      ...fresh(),
      stage: "draft",
      bidDeadline: { date: new Date("2026-10-20T00:00:00Z"), source: "admin", extractedAt: NOW },
      announcements: fresh().announcements.map((x) =>
        x.announcementId === "inv" ? { ...x, storageKey: "tor-pdfs/1/inv.pdf" } : x
      ),
    };
    const merged = mergeProcurement(existing, { ...fresh(), contractStatus: "ส่งงานครบถ้วน" });
    expect(merged.contractStatus).toBe("ส่งงานครบถ้วน"); // fresh data wins
    expect(merged.stage).toBe("inviting"); // fresh stage wins
    expect(merged.bidDeadline?.source).toBe("admin");
    expect(merged.announcements.find((x) => x.announcementId === "inv")?.storageKey).toBe("tor-pdfs/1/inv.pdf");
    expect(merged.announcements.find((x) => x.announcementId === "tor")?.storageKey).toBeNull();
  });

  it("drops a storageKey whose announcement no longer exists", () => {
    const existing: IProcurement = {
      ...fresh(),
      announcements: [{ announcementId: "gone", kind: "invitation", hasFile: true, storageKey: "k" }],
    };
    const merged = mergeProcurement(existing, fresh());
    expect(merged.announcements.map((x) => x.announcementId)).not.toContain("gone");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --runInBand src/ingestion/__tests__/procurementStage.test.ts`
Expected: FAIL — `buildProcurement` / `mergeProcurement` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/ingestion/procurementStage.ts`, extend the imports at the top:

```ts
import type { EgpAnnouncement } from "../scraper/egpClient.types";
import type {
  AnnouncementKind,
  IProcurement,
  IProcurementAnnouncement,
  ProcurementStage,
} from "../models/Tor";
```

(replacing the existing `import type { AnnouncementKind, IProcurementAnnouncement, ProcurementStage } ...` line) and append:

```ts
function parsePublishDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function compareByDate(a: IProcurementAnnouncement, b: IProcurementAnnouncement): number {
  const ta = a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const tb = b.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return ta === tb ? 0 : ta < tb ? -1 : 1;
}

/**
 * Pure transform: e-GP announcements + contract status → a fresh `procurement` payload.
 * Announcements are stored oldest first (undated first) for the detail-page timeline.
 */
export function buildProcurement(
  announcements: EgpAnnouncement[],
  contractStatus: string | null | undefined,
  now: Date
): IProcurement {
  const items: IProcurementAnnouncement[] = announcements
    .map((a) => ({
      announcementId: a.id,
      typeName: a.masterAnnounceTypeName?.trim() || undefined,
      kind: classifyAnnouncement(a.masterAnnounceTypeName),
      publishedAt: parsePublishDate(a.projectAnnouncementPublishDate),
      hasFile: Boolean(a.projectAnnouncementPath),
    }))
    .sort(compareByDate); // Array#sort is stable, so equal dates keep e-GP's order

  return {
    stage: deriveStage(items, contractStatus),
    contractStatus: contractStatus?.trim() || undefined,
    announcements: items,
    lastCheckedAt: now,
  };
}

/**
 * Apply a fresh payload over what is stored, keeping the fields other pipeline stages own:
 * `bidDeadline` (invitation-PDF extraction / admin edit) and each announcement's `storageKey`.
 */
export function mergeProcurement(
  existing: IProcurement | null | undefined,
  fresh: IProcurement
): IProcurement {
  const storedKeys = new Map(
    (existing?.announcements ?? []).map((a) => [a.announcementId, a.storageKey ?? null])
  );
  return {
    ...fresh,
    announcements: fresh.announcements.map((a) => ({
      ...a,
      storageKey: storedKeys.get(a.announcementId) ?? null,
    })),
    bidDeadline: existing?.bidDeadline ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion/__tests__/procurementStage.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/procurementStage.ts backend/src/ingestion/__tests__/procurementStage.test.ts
git commit -m "feat(backend): build and merge procurement payloads"
```

---

### Task 4: `mapProject` — contract-free hash and procurement payload

**Files:**
- Modify: `backend/src/ingestion/mapProject.ts`
- Test: `backend/src/ingestion/__tests__/mapProject.test.ts`

**Interfaces:**
- Consumes: `buildProcurement` (Task 3); `IProcurement` from `../models/Tor`.
- Produces:
  - `canonicalDetailHash(detail)` — now excludes `masterContractAvailableName`.
  - `legacyDetailHash(detail: EgpProjectDetail): string` — the old hash (includes contract status).
  - `MappedProject` gains `legacySourceContentHash: string` and `procurement: IProcurement`.
  - `mapProject(project, detail, announcements, opts: { fileBase: string; listingBase: string; now?: Date })`.

- [ ] **Step 1: Write the failing test**

In `backend/src/ingestion/__tests__/mapProject.test.ts`, change the import line to:

```ts
import { createHash } from "node:crypto";
import { canonicalDetailHash, legacyDetailHash, mapProject } from "../mapProject";
```

(keep the existing `import type { EgpAnnouncement, ... }` line), and append at the end of the file:

```ts
describe("source content hash and contract status", () => {
  it("canonicalDetailHash ignores the contract status", () => {
    expect(canonicalDetailHash({ ...detail, masterContractAvailableName: "ส่งงานครบถ้วน" })).toBe(
      canonicalDetailHash(detail)
    );
    expect(canonicalDetailHash({ ...detail, masterContractAvailableName: null })).toBe(canonicalDetailHash(detail));
  });

  it("legacyDetailHash is exactly the pre-change hash and does depend on contract status", () => {
    const oldHash = createHash("sha256")
      .update(
        JSON.stringify([
          detail.projectName,
          detail.masterOrgGroupName,
          detail.masterOrgDepartmentName,
          detail.projectBudget,
          detail.projectAverageBudget,
          detail.masterMethodIdName,
          detail.masterTypeIdName,
          detail.masterGoodsIdName,
          detail.masterContractAvailableName,
        ])
      )
      .digest("hex");
    expect(legacyDetailHash(detail)).toBe(oldHash);
    expect(legacyDetailHash({ ...detail, masterContractAvailableName: "ส่งงานครบถ้วน" })).not.toBe(oldHash);
  });

  it("mapProject exposes both hashes", () => {
    const m = mapProject(project, detail, [torAnn], OPTS);
    expect(m.sourceContentHash).toBe(canonicalDetailHash(detail));
    expect(m.legacySourceContentHash).toBe(legacyDetailHash(detail));
    expect(m.sourceContentHash).not.toBe(m.legacySourceContentHash);
  });
});

describe("mapProject procurement", () => {
  const NOW = new Date("2026-10-03T00:00:00Z");

  it("builds the procurement payload from the announcements and contract status", () => {
    const m = mapProject(project, detail, [priceAnn, torAnn], { ...OPTS, now: NOW });
    expect(m.procurement.stage).toBe("draft");
    expect(m.procurement.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(m.procurement.lastCheckedAt).toBe(NOW);
    expect(m.procurement.announcements.map((a) => a.kind)).toEqual(["tor-draft", "reference-price"]);
  });

  it("reflects an invitation in the stage", () => {
    const inv: EgpAnnouncement = {
      id: "ann-inv",
      masterAnnounceTypeName: "ประกาศเชิญชวน",
      projectAnnouncementPublishDate: "2026-09-10T00:00:00Z",
      projectAnnouncementPath: "inv.pdf",
    };
    expect(mapProject(project, detail, [torAnn, inv], OPTS).procurement.stage).toBe("inviting");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --runInBand src/ingestion/__tests__/mapProject.test.ts`
Expected: FAIL — `legacyDetailHash` not exported; `procurement` / `legacySourceContentHash` missing.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/ingestion/mapProject.ts`:

Add imports:

```ts
import type { IProcurement } from "../models/Tor";
import { buildProcurement } from "./procurementStage";
```

Extend `MappedProject`:

```ts
export interface MappedProject {
  projectCode: string;
  sourceContentHash: string;
  /** The pre-procurement-stage hash (also covered contract status); see runIngestion. */
  legacySourceContentHash: string;
  set: MappedProjectSet;
  procurement: IProcurement;
  torAnnouncement: TorAnnouncementRef | null;
  ingestErrors: string[];
}
```

Replace the `canonicalDetailHash` function with:

```ts
function sha256OfFields(fields: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

function coreDetailFields(detail: EgpProjectDetail): unknown[] {
  return [
    detail.projectName,
    detail.masterOrgGroupName,
    detail.masterOrgDepartmentName,
    detail.projectBudget,
    detail.projectAverageBudget,
    detail.masterMethodIdName,
    detail.masterTypeIdName,
    detail.masterGoodsIdName,
  ];
}

/**
 * sha256 of the detail fields we persist, with a fixed key order. Deliberately excludes the
 * contract status: it changes as a project progresses and must not re-trigger AI enrichment
 * (it lives on `Tor.procurement` instead).
 */
export function canonicalDetailHash(detail: EgpProjectDetail): string {
  return sha256OfFields(coreDetailFields(detail));
}

/** The hash stored before procurement stages existed: the core fields plus contract status. */
export function legacyDetailHash(detail: EgpProjectDetail): string {
  return sha256OfFields([...coreDetailFields(detail), detail.masterContractAvailableName]);
}
```

Change the `mapProject` signature's `opts` and the returned object:

```ts
export function mapProject(
  project: EgpSearchProject,
  detail: EgpProjectDetail,
  announcements: EgpAnnouncement[],
  opts: { fileBase: string; listingBase: string; now?: Date }
): MappedProject {
```

and replace the final `return { ... }` with:

```ts
  return {
    projectCode: project.projectNumber,
    sourceContentHash: canonicalDetailHash(detail),
    legacySourceContentHash: legacyDetailHash(detail),
    set,
    procurement: buildProcurement(announcements, detail.masterContractAvailableName, opts.now ?? new Date()),
    torAnnouncement,
    ingestErrors,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion/__tests__/mapProject.test.ts`
Expected: all PASS, including the pre-existing hash test (its `reordered` object still hashes identically).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/mapProject.ts backend/src/ingestion/__tests__/mapProject.test.ts
git commit -m "feat(backend): exclude contract status from the source hash and map procurement"
```

---

### Task 5: Wire procurement and the legacy-hash fallback into `runIngestion`

**Files:**
- Modify: `backend/src/ingestion/runIngestion.ts` (imports; `ProcessContext` use; lines 91–112 branch; new tail before the PDF block)
- Test: `backend/src/ingestion/__tests__/runIngestion.test.ts`

**Interfaces:**
- Consumes: `mapped.legacySourceContentHash`, `mapped.procurement` (Task 4); `mergeProcurement` (Task 3); `ctx.now()`.
- Produces: after `processProject`, every sighted `Tor` has `procurement` set (merged), its stored hash is in the new form, and an unchanged-except-contract-status TOR is counted `torsUnchanged` and not enqueued.

- [ ] **Step 1: Write the failing tests**

In `backend/src/ingestion/__tests__/runIngestion.test.ts`:

(a) Add to the imports: `import { canonicalDetailHash, legacyDetailHash } from "../mapProject";`

(b) Change `detailFor` to take a contract status, and extend the fake client:

```ts
function detailFor(name: string, contractStatus = "ระหว่างดำเนินการ"): EgpProjectDetail {
  return {
    projectName: name,
    masterOrgGroupName: "สำนักการแพทย์",
    masterOrgDepartmentName: "โรงพยาบาลกลาง",
    projectBudget: 1_000_000,
    projectAverageBudget: 950_000,
    masterMethodIdName: "ประกวดราคา",
    masterTypeIdName: "จ้าง",
    masterGoodsIdName: "งานจ้างพัฒนาระบบ",
    masterContractAvailableName: contractStatus,
  };
}
```

```ts
interface FakeClientOpts {
  detailNames?: Record<string, string>;
  failDetailFor?: string;
  contractStatus?: string;
  extraAnnouncements?: EgpAnnouncement[];
}
```

In `fakeClient`, replace the `projectDetail` return and `announcements` body:

```ts
      return detailFor(opts.detailNames?.[projectId] ?? `โครงการ ${num}`, opts.contractStatus);
```

```ts
    async announcements(projectId) {
      return [...torAnnFor(projectId), ...(opts.extraAnnouncements ?? [])];
    },
```

(c) Add these tests inside `describe("runIngestion", ...)`, before its closing `});`:

```ts
  it("stores the procurement stage and announcements on a new Tor", async () => {
    const invitation: EgpAnnouncement = {
      id: "ann-inv",
      masterAnnounceTypeName: "ประกาศเชิญชวน",
      projectAnnouncementPublishDate: "2026-09-10T00:00:00Z",
      projectAnnouncementPath: "inv.pdf",
    };
    await (
      await runIngestion(baseOpts, {
        client: fakeClient({ extraAnnouncements: [invitation] }),
        storage: fakeStorage(),
        parse,
        enqueueEnrichment: jest.fn(),
      })
    ).done;

    const t = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(t?.procurement?.stage).toBe("inviting");
    expect(t?.procurement?.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(t?.procurement?.announcements.map((a) => a.kind)).toEqual(["tor-draft", "invitation"]);
    expect(t?.procurement?.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("a contract-status change refreshes procurement but is not an update and does not re-enqueue", async () => {
    const enqueue = jest.fn();
    const deps = { storage: fakeStorage(), parse, enqueueEnrichment: enqueue };
    await (await runIngestion(baseOpts, { ...deps, client: fakeClient() })).done;
    enqueue.mockClear();

    const { runId, done } = await runIngestion(baseOpts, {
      ...deps,
      client: fakeClient({ contractStatus: "ส่งงานครบถ้วน" }),
    });
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsCreated: 0, torsUpdated: 0, torsUnchanged: 2 });
    expect(enqueue).not.toHaveBeenCalled();
    const t = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(t?.procurement?.contractStatus).toBe("ส่งงานครบถ้วน");
  });

  it("adopts the new hash quietly when the stored hash is the legacy (contract-inclusive) form", async () => {
    const enqueue = jest.fn();
    const deps = { client: fakeClient(), storage: fakeStorage(), parse, enqueueEnrichment: enqueue };
    await (await runIngestion(baseOpts, deps)).done;
    for (const p of projects) {
      await Tor.updateOne(
        { projectCode: p.projectNumber },
        { sourceContentHash: legacyDetailHash(detailFor(`โครงการ ${p.projectNumber}`)) }
      );
    }
    enqueue.mockClear();

    const { runId, done } = await runIngestion(baseOpts, deps);
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsUpdated: 0, torsUnchanged: 2 });
    expect(enqueue).not.toHaveBeenCalled();
    for (const p of projects) {
      const t = await Tor.findOne({ projectCode: p.projectNumber }).lean();
      expect(t?.sourceContentHash).toBe(canonicalDetailHash(detailFor(`โครงการ ${p.projectNumber}`)));
    }
  });

  it("still treats a genuine detail change on a legacy-hash Tor as an update", async () => {
    const enqueue = jest.fn();
    const deps = { storage: fakeStorage(), parse, enqueueEnrichment: enqueue };
    await (await runIngestion(baseOpts, { ...deps, client: fakeClient() })).done;
    await Tor.updateOne(
      { projectCode: "69000000001" },
      { sourceContentHash: legacyDetailHash(detailFor("โครงการ 69000000001")) }
    );
    enqueue.mockClear();

    const { runId, done } = await runIngestion(baseOpts, {
      ...deps,
      client: fakeClient({ detailNames: { "p-1": "โครงการ 69000000001 (แก้ไข)" } }),
    });
    await done;

    const run = await IngestionRun.findById(runId).lean();
    expect(run?.stats).toMatchObject({ torsUpdated: 1, torsUnchanged: 1 });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("keeps an existing bidDeadline and stored announcement copy across a re-sighting", async () => {
    const deps = { storage: fakeStorage(), parse, enqueueEnrichment: jest.fn() };
    await (await runIngestion(baseOpts, { ...deps, client: fakeClient() })).done;
    await Tor.updateOne(
      { projectCode: "69000000001" },
      {
        $set: {
          "procurement.bidDeadline": {
            date: new Date("2026-10-20T00:00:00Z"),
            source: "admin",
            extractedAt: new Date("2026-10-01T00:00:00Z"),
          },
          "procurement.announcements.0.storageKey": "tor-pdfs/69000000001/ann-p-1.pdf",
        },
      }
    );

    await (await runIngestion(baseOpts, { ...deps, client: fakeClient({ contractStatus: "ส่งงานครบถ้วน" }) })).done;

    const t = await Tor.findOne({ projectCode: "69000000001" }).lean();
    expect(t?.procurement?.bidDeadline?.source).toBe("admin");
    expect(t?.procurement?.bidDeadline?.date).toEqual(new Date("2026-10-20T00:00:00Z"));
    expect(t?.procurement?.announcements[0]?.storageKey).toBe("tor-pdfs/69000000001/ann-p-1.pdf");
    expect(t?.procurement?.contractStatus).toBe("ส่งงานครบถ้วน");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest --runInBand src/ingestion/__tests__/runIngestion.test.ts`
Expected: the five new tests FAIL (no `procurement` on the saved Tor; the contract-change run counts `torsUpdated: 2` and enqueues); pre-existing tests still PASS.

- [ ] **Step 3: Implement**

In `backend/src/ingestion/runIngestion.ts`, add to the imports:

```ts
import { mergeProcurement } from "./procurementStage";
```

Replace the block from `let tor = await Tor.findOne(...)` through the closing brace of the `unchanged` branch (currently lines 91–112) with:

```ts
  let tor = await Tor.findOne({ projectCode: mapped.projectCode });
  let created = false;
  let updated = false;
  if (!tor) {
    tor = await Tor.create({
      ...mapped.set,
      projectCode: mapped.projectCode,
      sourceContentHash: mapped.sourceContentHash,
      ingestionRunId: runId,
    });
    created = true;
    stats.torsCreated += 1;
  } else {
    // A hash stored before procurement stages existed also covered the contract status. When
    // that is the only difference, adopt the new hash quietly instead of calling it a change
    // (which would re-download the PDF and re-run AI enrichment).
    if (
      tor.sourceContentHash === mapped.legacySourceContentHash &&
      tor.sourceContentHash !== mapped.sourceContentHash
    ) {
      tor.sourceContentHash = mapped.sourceContentHash;
    }

    if (tor.sourceContentHash !== mapped.sourceContentHash) {
      tor.set({ ...mapped.set, sourceContentHash: mapped.sourceContentHash, ingestionRunId: runId });
      await tor.save();
      updated = true;
      stats.torsUpdated += 1;
    } else {
      // Found, but the source content hash matches what we already have — a
      // deliberate idempotent no-op, not an unaccounted-for outcome.
      stats.torsUnchanged += 1;
    }
  }

  // Procurement is refreshed on every sighting. mergeProcurement keeps `bidDeadline` and each
  // announcement's stored copy, which other pipeline stages own.
  tor.procurement = mergeProcurement(tor.toObject().procurement, mapped.procurement);
  await tor.save();
```

(`mapProject` is already called a few lines above — change that call to pass the run clock: `const mapped = mapProject(project, detail, announcements, { fileBase: ..., listingBase: ..., now: ctx.now() });`, i.e. add `now: ctx.now(),` to its options object.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion`
Expected: all PASS (new and pre-existing, including `runIngestion.enrichment.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/runIngestion.ts backend/src/ingestion/__tests__/runIngestion.test.ts
git commit -m "feat(backend): record procurement stage during ingestion and adopt the legacy hash quietly"
```

---

### Task 6: Keep internal blob keys out of the public TOR detail, update the spec

**Files:**
- Modify: `backend/src/controllers/torController.ts:272-274`
- Test: `backend/src/__tests__/torProcurementExposure.test.ts` (create)
- Modify: `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md`

**Interfaces:**
- Consumes: `Tor.procurement` (Task 1).
- Produces: `GET /api/tors/:id` returns `tor.procurement` (stage, contractStatus, announcements without `storageKey`, bidDeadline, lastCheckedAt).

- [ ] **Step 1: Write the failing test**

Create `backend/src/__tests__/torProcurementExposure.test.ts`:

```ts
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "7d";

import app from "../app";
import { Tor } from "../models";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Tor.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /api/tors/:id — procurement", () => {
  it("returns procurement but never the internal storageKey of an announcement", async () => {
    const tor = await Tor.create({
      title: "ระบบ",
      pipelineStatus: "enriched",
      procurement: {
        stage: "inviting",
        contractStatus: "ระหว่างดำเนินการ",
        announcements: [
          {
            announcementId: "a-1",
            typeName: "ประกาศเชิญชวน",
            kind: "invitation",
            publishedAt: new Date("2026-09-10T00:00:00Z"),
            hasFile: true,
            storageKey: "tor-pdfs/1/a-1.pdf",
          },
        ],
        lastCheckedAt: new Date("2026-10-03T00:00:00Z"),
      },
    });

    const res = await request(app).get(`/api/tors/${tor.id}`);

    expect(res.status).toBe(200);
    expect(res.body.tor.procurement.stage).toBe("inviting");
    expect(res.body.tor.procurement.announcements[0]).toMatchObject({ kind: "invitation", hasFile: true });
    expect(res.body.tor.procurement.announcements[0]).not.toHaveProperty("storageKey");
    expect(JSON.stringify(res.body)).not.toContain("tor-pdfs/1/a-1.pdf");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --runInBand src/__tests__/torProcurementExposure.test.ts`
Expected: FAIL — `storageKey` is present in the response.

- [ ] **Step 3: Implement the exclusion**

In `backend/src/controllers/torController.ts`, in `getTor`, extend the `.select(...)` string:

```ts
    .select(
      "-sourceContentHash -classification -ingestionRunId -__v -sourceDocument.storageKey -sourceDocument.sha256 -procurement.announcements.storageKey"
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/__tests__/torProcurementExposure.test.ts src/__tests__/torRoutes.test.ts`
Expected: all PASS.

- [ ] **Step 5: Update the spec to match what was built, then run the full suite**

In `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md`, replace the bullet that begins `- **Hash fix in discovery:**` (in section 2) with:

```markdown
- **Hash fix in discovery:** `canonicalDetailHash` no longer includes
  `masterContractAvailableName`. Instead of a one-time migration script, discovery
  adopts the new hash lazily: when a stored hash equals the *legacy* hash
  (`legacyDetailHash`, which still includes contract status) of the freshly fetched
  detail, the new hash is written silently and the TOR counts as unchanged (no PDF
  re-download, no enrichment). This is robust to admin edits of `title`/`budget`, which
  a script recomputing hashes from stored fields would not be. Known residual: a TOR
  whose contract status changed *before* its first sighting after this change matches
  neither hash and is re-enriched once.
```

and in the **Testing** section replace `- Hash migration: hashes recomputed, no jobs enqueued.` with `- Legacy-hash adoption: unchanged detail → no update and no enqueue; genuine change → still an update.`

Then run the whole backend gate:

Run: `cd backend && npm run typecheck && npx jest --runInBand`
Expected: typecheck clean; all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/torController.ts backend/src/__tests__/torProcurementExposure.test.ts docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md
git commit -m "fix(backend): keep announcement blob keys out of the public TOR detail"
```

---

## After this plan

Open a PR into `main` from `feat/tor-procurement-stage` (needs 1 review; do not merge your own). Then write the step-2 plan (lifecycle refresh job, run record, admin trigger) against the interfaces above: `buildProcurement`, `mergeProcurement`, `deriveStage`, `IProcurement`, and the `procurement.lastCheckedAt` / `procurement.stage` indexes.
