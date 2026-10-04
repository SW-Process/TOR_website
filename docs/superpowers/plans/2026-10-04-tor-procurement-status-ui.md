# TOR Procurement Status in the API and Public UI (Delivery Step 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every TOR in listings, search, the detail page, bookmarks, vendor matches and the admin records page shows its true procurement status (draft / open / closing soon / closed / awarded / cancelled), computed from `Tor.procurement`, with a filter for each status and an announcement timeline on the detail page.

**Architecture:** One pure backend module (`utils/torStatus.ts`) owns the status rules twice, as a JS function (`computeTorStatus`, used to stamp `displayStatus` on responses) and as a MongoDB clause (`statusClause`, used by the `status=` filter and the vendor-match candidate filter); a table-driven test proves the two always agree. The frontend stops deriving status from a deadline and instead maps the server's `displayStatus`; a small shared `lib/torStatus.ts` holds labels, helpers and the one-line status note every card/table/page uses.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, Jest + mongodb-memory-server (backend); Next.js 16 / React 19 / Tailwind v4 (frontend, no test framework — `tsc` + `eslint` only).

**Spec:** `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md` §1 (status table) and §4 (API and UI). This is delivery step 3 of 4. It depends on steps 1–2 (`Tor.procurement` is populated for every public TOR by discovery and the lifecycle refresh).

## Global Constraints

- API status enum (query `status=` and response `displayStatus`), exactly: `draft | open | closing_soon | closed | awarded | cancelled`. Thai labels, exactly: `ร่าง TOR`, `เปิดรับ`, `ใกล้ปิดรับ`, `ปิดรับแล้ว`, `ประกาศผู้ชนะแล้ว`, `ยกเลิก`.
- Precedence (first match wins): stored `status === "closed"` (admin manual close) → `closed`; `procurement.stage === "cancelled"` → `cancelled`; `"awarded"` → `awarded`; `"inviting"` → by `procurement.bidDeadline.date`: in the past → `closed`, within `CLOSING_SOON_DAYS` (7) days inclusive → `closing_soon`, later **or unknown** → `open`; anything else, including a TOR with no `procurement` → `draft`.
- The deadline used for status is **only** `procurement.bidDeadline.date`. The legacy `submissionDeadline` is not used for status; it keeps driving the deadline sort, the deadline-range filter, the calendar and the bookmark "closing in 3 days" list unchanged (its meaning is a spec open item).
- Public endpoints still serve only `pipelineStatus: "enriched"` TORs. List/bookmark/match rows may include `procurement.stage|contractStatus|bidDeadline|lastCheckedAt` but never `procurement.announcements`; only the detail response includes announcements, and never an announcement's `storageKey`.
- Admin PATCH keeps accepting the stored `status` enum `open | closing_soon | closed`; only `closed` has an effect (manual close). The frontend must never send any other value.
- No frontend code may treat `status !== "ปิดรับแล้ว"` as "open", and no status text may use the mock clock (`daysUntil`/`TODAY_ISO` from `mockData.ts`); use the real clock.
- UI copy is neutral status text; do not touch the fairness-signal wording rules (CLAUDE.md "Defamation constraint").
- Commits: Conventional Commits (`<type>(<scope>): <what>`, imperative, no trailing period, one subject line), one thing per commit, **no `Co-Authored-By` trailer or any other trailer** (verify with `git log -1 --format=%B`). Stage only the files a task names. Never push to `main`.
- Verification gates: backend — `cd backend && npm run typecheck` plus the task's jest command; frontend — `cd frontend && npx tsc --noEmit 2>&1 | grep -c "<changed file names>"` must print `0` (a worktree without a generated `next-env.d.ts` / `.next` also shows unrelated errors such as `LayoutProps`; copy the gitignored `next-env.d.ts` from the main checkout if needed) and `npx eslint <changed files>` must be clean.

## Review Focus

Failure modes the spec implies that no single task's happy path covers, each pinned by a test or a grep in the task named:

1. The Mongo `status=` filter and the JS `displayStatus` must agree on every boundary: deadline exactly now, exactly now + 7 days, ±1 ms, admin-closed over every stage, missing `procurement` → Task 1.
2. An admin-closed TOR must stay closed everywhere: list filter, vendor matches exclusion, and the admin edit dialog must not silently re-open it on save → Tasks 1, 3, 9.
3. Vendor matches must stop recommending awarded / cancelled / closed TORs but must still include TORs that have no `procurement` yet (they read as `draft`) → Task 3.
4. List rows must never leak the announcement list or any `storageKey`; the detail response must carry the timeline without `storageKey` → Task 2.
5. No frontend consumer may still use `!== "ปิดรับแล้ว"` as "open" or the mock clock for status text → Tasks 5–8 (grep verification step in Task 8).

**Not in this plan:** the admin "pipeline" view (showing `pending` / `rejected` / `failed` TORs and their last job error) — delivery step 3b, planned separately; real bid deadlines from the invitation PDF (step 4) — until then every `inviting` TOR reads `open` with an unknown deadline and none reads `closing_soon`.

---

### Task 0: Branch and commit the plan

**Files:**
- Add: `docs/superpowers/plans/2026-10-04-tor-procurement-status-ui.md`

- [ ] **Step 1: Create the branch from the step-2 branch (stacked until it merges)**

```bash
git fetch origin
git worktree add ../TOR_website-status -b feat/tor-procurement-status-ui feat/tor-procurement-refresh
cd ../TOR_website-status
# SDD only: give the worktree the main checkout's dependencies without copying them
cmd //c "mklink /J backend\\node_modules ..\\TOR_website\\backend\\node_modules"
cmd //c "mklink /J frontend\\node_modules ..\\TOR_website\\frontend\\node_modules"
cp ../TOR_website/frontend/next-env.d.ts frontend/next-env.d.ts   # gitignored, generated by Next
```

If steps 1–2 have already been merged into `main`, branch from `origin/main` instead. When finished, remove the junctions with `cmd //c "rmdir backend\\node_modules"` and the frontend one **before** `git worktree remove` — never delete through a junction.

- [ ] **Step 2: Commit the plan**

```bash
git add docs/superpowers/plans/2026-10-04-tor-procurement-status-ui.md
git commit -m "docs(backend): add procurement status API and UI plan (step 3)"
```

---

### Task 1: Status rules — `computeTorStatus`, `statusClause`, `withDisplayStatus`

**Files:**
- Create: `backend/src/utils/torStatus.ts`
- Test: `backend/src/utils/__tests__/torStatus.test.ts` (create)

**Interfaces:**
- Produces (all exported from `backend/src/utils/torStatus.ts`):
  - `TOR_STATUSES: readonly ["draft","open","closing_soon","closed","awarded","cancelled"]`, `type TorDisplayStatus`
  - `CLOSING_SOON_DAYS = 7`
  - `interface StatusInput { status?: string | null; procurement?: { stage?: string | null; bidDeadline?: { date?: Date | string | null } | null } | null }`
  - `computeTorStatus(tor: StatusInput, now?: Date): TorDisplayStatus`
  - `statusClause(status: TorDisplayStatus, now: Date): QueryFilter<ITor>`
  - `withDisplayStatus<T extends StatusInput>(row: T, now?: Date): T & { displayStatus: TorDisplayStatus }`

- [ ] **Step 1: Write the failing test**

Create `backend/src/utils/__tests__/torStatus.test.ts`:

```ts
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
  { name: "draft stage", doc: { procurement: stage("draft") }, expected: "draft" },
  { name: "awarded", doc: { procurement: stage("awarded") }, expected: "awarded" },
  { name: "cancelled", doc: { procurement: stage("cancelled") }, expected: "cancelled" },
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
    await Tor.create(cases.map((c, i) => ({ title: `case-${i}`, pipelineStatus: "enriched", ...c.doc })));

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

describe("withDisplayStatus", () => {
  it("adds displayStatus without mutating or dropping fields", () => {
    const row = { title: "x", procurement: { stage: "awarded" } };
    const out = withDisplayStatus(row, NOW);
    expect(out).toEqual({ title: "x", procurement: { stage: "awarded" }, displayStatus: "awarded" });
    expect(row).not.toHaveProperty("displayStatus");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/utils/__tests__/torStatus.test.ts`
Expected: FAIL — `Cannot find module '../torStatus'`.

- [ ] **Step 3: Implement**

Create `backend/src/utils/torStatus.ts`:

```ts
// backend/src/utils/torStatus.ts
import type { QueryFilter } from "mongoose";
import type { ITor } from "../models";

/**
 * User-facing lifecycle status of a TOR (spec §1). Derived from `Tor.procurement` — and the
 * admin's manual close — never from the legacy `submissionDeadline`.
 */
export const TOR_STATUSES = ["draft", "open", "closing_soon", "closed", "awarded", "cancelled"] as const;
export type TorDisplayStatus = (typeof TOR_STATUSES)[number];

/** A TOR whose bid deadline is at most this many days away is "closing soon". */
export const CLOSING_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

/** The minimal shape the rules read; satisfied by hydrated docs, lean docs and plain JSON. */
export interface StatusInput {
  /** The stored, admin-controlled status. Only "closed" matters (manual close). */
  status?: string | null;
  procurement?: {
    stage?: string | null;
    bidDeadline?: { date?: Date | string | null } | null;
  } | null;
}

/**
 * Precedence (first match wins): manual close → cancelled → awarded → inviting (by bid
 * deadline: passed = closed, within CLOSING_SOON_DAYS = closing_soon, later or unknown = open)
 * → draft (also for a TOR with no procurement yet). Keep `statusClause` in step with this.
 */
export function computeTorStatus(tor: StatusInput, now: Date = new Date()): TorDisplayStatus {
  if (tor.status === "closed") return "closed";
  const stage = tor.procurement?.stage;
  if (stage === "cancelled") return "cancelled";
  if (stage === "awarded") return "awarded";
  if (stage === "inviting") {
    const raw = tor.procurement?.bidDeadline?.date;
    const deadline = raw ? new Date(raw).getTime() : Number.NaN;
    if (Number.isNaN(deadline)) return "open";
    if (deadline < now.getTime()) return "closed";
    return deadline <= now.getTime() + CLOSING_SOON_DAYS * DAY_MS ? "closing_soon" : "open";
  }
  return "draft";
}

/** MongoDB mirror of `computeTorStatus`: matches exactly the TORs it would label `status`. */
export function statusClause(status: TorDisplayStatus, now: Date): QueryFilter<ITor> {
  const soon = new Date(now.getTime() + CLOSING_SOON_DAYS * DAY_MS);
  const notManuallyClosed = { status: { $ne: "closed" as const } };
  const inviting = { "procurement.stage": "inviting" };
  switch (status) {
    case "closed":
      return {
        $or: [{ status: "closed" }, { ...inviting, "procurement.bidDeadline.date": { $lt: now } }],
      } as QueryFilter<ITor>;
    case "cancelled":
      return { $and: [notManuallyClosed, { "procurement.stage": "cancelled" }] } as QueryFilter<ITor>;
    case "awarded":
      return { $and: [notManuallyClosed, { "procurement.stage": "awarded" }] } as QueryFilter<ITor>;
    case "draft":
      // `$in` with null also matches a missing stage (no procurement yet).
      return { $and: [notManuallyClosed, { "procurement.stage": { $in: ["draft", null] } }] } as QueryFilter<ITor>;
    case "closing_soon":
      return {
        $and: [notManuallyClosed, inviting, { "procurement.bidDeadline.date": { $gte: now, $lte: soon } }],
      } as QueryFilter<ITor>;
    case "open":
      return {
        $and: [
          notManuallyClosed,
          inviting,
          { $or: [{ "procurement.bidDeadline.date": { $gt: soon } }, { "procurement.bidDeadline.date": null }] },
        ],
      } as QueryFilter<ITor>;
  }
}

/** Stamp the computed status on a response row. Returns a new object. */
export function withDisplayStatus<T extends StatusInput>(
  row: T,
  now: Date = new Date()
): T & { displayStatus: TorDisplayStatus } {
  return { ...row, displayStatus: computeTorStatus(row, now) };
}
```

(The `as QueryFilter<ITor>` casts are there because dotted subdocument paths and `null` inside `$in` are not expressible in Mongoose's strict filter types; the runtime test is what proves the clauses correct. If a cast is unnecessary for some branch, drop it.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/utils/__tests__/torStatus.test.ts`
Expected: PASS. If the agreement test fails for a boundary case, fix the **clause or the function** until they agree — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/torStatus.ts backend/src/utils/__tests__/torStatus.test.ts
git commit -m "feat(backend): derive a TOR's status from its procurement stage"
```

---

### Task 2: Public API — `status=` filter, `displayStatus`, procurement summary

**Files:**
- Modify: `backend/src/controllers/torController.ts`
- Test: `backend/src/__tests__/torRoutes.test.ts`

**Interfaces:**
- Consumes: `TOR_STATUSES`, `statusClause`, `withDisplayStatus`, `StatusInput` (Task 1).
- Produces:
  - `GET /api/tors?status=<draft|open|closing_soon|closed|awarded|cancelled>` (repeatable); `400` for any other value.
  - Every list row and the detail `tor` carry `displayStatus`; list rows also carry `procurement` limited to `stage`, `contractStatus`, `bidDeadline`, `lastCheckedAt` (no `announcements`); the detail `tor.procurement` carries the full timeline (already without `storageKey`).
  - `LIST_PROJECTION` now includes those four `procurement.*` paths (admin and bookmark projections reuse this string).

- [ ] **Step 1: Rewrite the status test and add the new tests**

In `backend/src/__tests__/torRoutes.test.ts` replace the whole test `it("filters by effective status, derived from the deadline rather than what is stored", …)` with:

```ts
  it("filters by the six effective statuses, derived from procurement rather than the stored status", async () => {
    const day = 86_400_000;
    const stage = (s: string) => ({ stage: s, announcements: [], lastCheckedAt: new Date() });
    const inviting = (daysAhead?: number) => ({
      ...stage("inviting"),
      ...(daysAhead === undefined
        ? {}
        : { bidDeadline: { date: new Date(Date.now() + daysAhead * day), source: "admin", extractedAt: new Date() } }),
    });
    await Tor.create([
      { title: "เปิด 10 วัน", pipelineStatus: "enriched", procurement: inviting(10) },
      { title: "เปิด ไม่ระบุวันปิด", pipelineStatus: "enriched", procurement: inviting() },
      { title: "ใกล้ปิด 3 วัน", pipelineStatus: "enriched", procurement: inviting(3) },
      { title: "เลยกำหนด", pipelineStatus: "enriched", procurement: inviting(-1) },
      { title: "แอดมินปิดแล้ว", pipelineStatus: "enriched", status: "closed", procurement: inviting(10) },
      { title: "ประกาศผู้ชนะแล้ว", pipelineStatus: "enriched", procurement: stage("awarded") },
      { title: "ยกเลิก", pipelineStatus: "enriched", procurement: stage("cancelled") },
      { title: "ร่าง", pipelineStatus: "enriched", procurement: stage("draft") },
      { title: "ยังไม่มีข้อมูลสถานะ", pipelineStatus: "enriched" },
      { title: "ยังไม่ผ่าน AI", pipelineStatus: "pending", procurement: stage("awarded") },
    ]);
    const titles = async (qs: string) =>
      (await request(app).get(`/api/tors?${qs}`)).body.data.map((t: { title: string }) => t.title).sort();

    expect(await titles("status=open")).toEqual(["เปิด 10 วัน", "เปิด ไม่ระบุวันปิด"].sort());
    expect(await titles("status=closing_soon")).toEqual(["ใกล้ปิด 3 วัน"]);
    expect(await titles("status=closed")).toEqual(["เลยกำหนด", "แอดมินปิดแล้ว"].sort());
    expect(await titles("status=awarded")).toEqual(["ประกาศผู้ชนะแล้ว"]);
    expect(await titles("status=cancelled")).toEqual(["ยกเลิก"]);
    expect(await titles("status=draft")).toEqual(["ยังไม่มีข้อมูลสถานะ", "ร่าง"].sort());
    expect(await titles("status=open&status=closing_soon")).toEqual(
      ["เปิด 10 วัน", "เปิด ไม่ระบุวันปิด", "ใกล้ปิด 3 วัน"].sort()
    );
    expect((await request(app).get("/api/tors?status=bogus")).status).toBe(400);
  });

  it("stamps displayStatus and a procurement summary (no announcements) on list rows", async () => {
    await Tor.create({
      title: "มีขั้นตอน",
      pipelineStatus: "enriched",
      procurement: {
        stage: "inviting",
        contractStatus: "ระหว่างดำเนินการ",
        announcements: [{ announcementId: "a-1", kind: "invitation", hasFile: true, storageKey: "tor-pdfs/x/a-1.pdf" }],
        bidDeadline: { date: new Date(Date.now() + 3 * 86_400_000), source: "admin", extractedAt: new Date() },
        lastCheckedAt: new Date(),
      },
    });
    const res = await request(app).get("/api/tors");
    const row = res.body.data[0];
    expect(row.displayStatus).toBe("closing_soon");
    expect(row.procurement).toMatchObject({ stage: "inviting", contractStatus: "ระหว่างดำเนินการ" });
    expect(row.procurement.bidDeadline.date).toBeTruthy();
    expect(row.procurement).not.toHaveProperty("announcements");
    expect(JSON.stringify(res.body)).not.toContain("tor-pdfs/x/a-1.pdf");
  });

  it("returns displayStatus and the announcement timeline (never a storageKey) on the detail", async () => {
    const tor = await Tor.create({
      title: "รายละเอียด",
      pipelineStatus: "enriched",
      procurement: {
        stage: "awarded",
        announcements: [
          { announcementId: "a-1", kind: "invitation", typeName: "ประกาศเชิญชวน", hasFile: true, storageKey: "tor-pdfs/x/a-1.pdf" },
          { announcementId: "a-2", kind: "winner", hasFile: false },
        ],
        lastCheckedAt: new Date(),
      },
    });
    const res = await request(app).get(`/api/tors/${tor.id}`);
    expect(res.body.tor.displayStatus).toBe("awarded");
    expect(res.body.tor.procurement.announcements.map((a: { kind: string }) => a.kind)).toEqual(["invitation", "winner"]);
    expect(JSON.stringify(res.body)).not.toContain("tor-pdfs/x/a-1.pdf");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/__tests__/torRoutes.test.ts`
Expected: the three rewritten/new tests FAIL (status values `draft` etc. are rejected with 400; no `displayStatus`); all other tests PASS.

- [ ] **Step 3: Implement**

In `backend/src/controllers/torController.ts`:

1. Add the import (next to the other local imports):
```ts
import { TOR_STATUSES, statusClause, withDisplayStatus, type StatusInput } from "../utils/torStatus";
```
2. Delete the local `const TOR_STATUSES = [...] as const;` (line ~20), the `export const CLOSING_SOON_DAYS = 7;` and `const DAY_MS = 86_400_000;` lines, the doc comment above `statusClause` and the whole local `function statusClause(...)` (lines ~66–91). The zod schema's `status: z.preprocess(asArray, z.array(z.enum(TOR_STATUSES)).optional()),` keeps working with the imported constant, and `buildFilter` keeps calling `statusClause(s, now)` unchanged. (If `DAY_MS` is used elsewhere in the file, keep that line.)
3. Extend `LIST_PROJECTION`:
```ts
export const LIST_PROJECTION =
  "title agency category budget referencePrice announcementDate submissionDeadline status projectCode projectType technologyStack sourceListingUrl procurement.stage procurement.contractStatus procurement.bidDeadline procurement.lastCheckedAt";
```
4. In `listTors`, replace `data: result?.data ?? [],` with:
```ts
    data: (result?.data ?? []).map((row) => withDisplayStatus(row as StatusInput)),
```
5. In `getTor`, replace `res.status(200).json({ tor });` with `res.status(200).json({ tor: withDisplayStatus(tor) });` and extend the `.select(...)` exclusion string only if the type system requires it (it must still end with `-procurement.announcements.storageKey`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/__tests__/torRoutes.test.ts src/__tests__/torProcurementExposure.test.ts src/__tests__/adminTors.test.ts`
Expected: all PASS (the admin tests share `buildFilter`/`LIST_PROJECTION`; they use `toMatchObject`, so the extra fields do not break them).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/torController.ts backend/src/__tests__/torRoutes.test.ts
git commit -m "feat(backend): filter and label TORs by procurement status in the public API"
```

---

### Task 3: Bookmarks and vendor matches use the same status

**Files:**
- Modify: `backend/src/controllers/bookmarkController.ts`
- Modify: `backend/src/controllers/matchController.ts`
- Test: `backend/src/__tests__/vendorBookmarks.test.ts`, `backend/src/__tests__/vendorMatches.test.ts`

**Interfaces:**
- Consumes: `statusClause`, `withDisplayStatus` (Task 1); the extended `LIST_PROJECTION` string (Task 2) for bookmarks.
- Produces: bookmark rows' `tor` and match rows' `tor` carry `displayStatus` and the `procurement` summary (never `announcements`); `GET /api/vendor/matches` only ranks TORs whose status is `draft`, `open` or `closing_soon`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/vendorMatches.test.ts` add (inside the existing top-level `describe`, reusing its `vendorAgent`/`Tor` helpers):

```ts
  it("only ranks TORs a vendor can still act on, and keeps TORs with no procurement yet", async () => {
    const stage = (s: string) => ({ stage: s, announcements: [], lastCheckedAt: new Date() });
    const inviting = (daysAhead: number) => ({
      ...stage("inviting"),
      bidDeadline: { date: new Date(Date.now() + daysAhead * 86_400_000), source: "admin", extractedAt: new Date() },
    });
    await Tor.create([
      { title: "ร่าง", pipelineStatus: "enriched", category: "gis", procurement: stage("draft") },
      { title: "ยังไม่มีข้อมูลสถานะ", pipelineStatus: "enriched", category: "gis" },
      { title: "เปิดรับ", pipelineStatus: "enriched", category: "gis", procurement: inviting(30) },
      { title: "ใกล้ปิด", pipelineStatus: "enriched", category: "gis", procurement: inviting(2) },
      { title: "ประกาศผู้ชนะแล้ว", pipelineStatus: "enriched", category: "gis", procurement: stage("awarded") },
      { title: "ยกเลิก", pipelineStatus: "enriched", category: "gis", procurement: stage("cancelled") },
      { title: "เลยกำหนด", pipelineStatus: "enriched", category: "gis", procurement: inviting(-2) },
      { title: "แอดมินปิดแล้ว", pipelineStatus: "enriched", status: "closed", category: "gis", procurement: inviting(30) },
    ]);
    const agent = await vendorAgent();

    const res = await agent.get("/api/vendor/matches?pageSize=100");

    const titles = res.body.data.map((m: { tor: { title: string } }) => m.tor.title).sort();
    expect(titles).toEqual(["ใกล้ปิด", "ร่าง", "เปิดรับ", "ยังไม่มีข้อมูลสถานะ"].sort());
    const closing = res.body.data.find((m: { tor: { title: string } }) => m.tor.title === "ใกล้ปิด");
    expect(closing.tor.displayStatus).toBe("closing_soon");
    expect(closing.tor.procurement).not.toHaveProperty("announcements");
  });
```

In `backend/src/__tests__/vendorBookmarks.test.ts` extend the existing list assertion (`expect(list.body.data[0]).toMatchObject({ … tor: { _id: a, title: "ระบบสารบรรณ", agency: "สำนักการแพทย์" } })`) by adding `displayStatus: "draft"` inside `tor: {…}` (the seeded TORs have no `procurement`), and add one new test next to it:

```ts
  it("returns a bookmarked TOR's real status, e.g. awarded", async () => {
    const tor = await Tor.create({
      title: "ได้ผู้ชนะแล้ว",
      pipelineStatus: "enriched",
      procurement: { stage: "awarded", announcements: [], lastCheckedAt: new Date() },
    });
    const agent = await vendorAgent();
    await agent.put(`/api/vendor/bookmarks/${tor.id}`);
    const list = await agent.get("/api/vendor/bookmarks");
    const row = list.body.data.find((b: { torId: string }) => b.torId === tor.id);
    expect(row.tor.displayStatus).toBe("awarded");
    expect(row.tor.procurement.stage).toBe("awarded");
  });
```

(Use the file's own existing helper names for the agent / seeding if they differ from `vendorAgent` / `Tor`; keep the assertions.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/__tests__/vendorMatches.test.ts src/__tests__/vendorBookmarks.test.ts`
Expected: the new and extended assertions FAIL (matches still rank awarded/cancelled/closed; no `displayStatus`).

- [ ] **Step 3: Implement**

`backend/src/controllers/bookmarkController.ts`:
- add `import { withDisplayStatus } from "../utils/torStatus";`
- extend the projection constant so it stays "the same public fields the TOR list exposes":
```ts
const TOR_PROJECTION =
  "title agency category budget referencePrice announcementDate submissionDeadline status projectCode projectType technologyStack sourceListingUrl procurement.stage procurement.contractStatus procurement.bidDeadline procurement.lastCheckedAt";
```
- in `listBookmarks` change `return tor ? [{ ...serialize(b), tor }] : [];` to `return tor ? [{ ...serialize(b), tor: withDisplayStatus(tor) }] : [];`

`backend/src/controllers/matchController.ts`:
- add `import { statusClause, withDisplayStatus } from "../utils/torStatus";`
- extend the projection:
```ts
const OPEN_TOR_PROJECTION =
  "title agency category budget referencePrice technologyStack announcementDate submissionDeadline status procurement.stage procurement.contractStatus procurement.bidDeadline procurement.lastCheckedAt";
```
- replace the candidate query (and its comment) with:
```ts
  // pipelineStatus gate mirrors the public read API. Candidates are TORs a vendor can still act
  // on — a draft ahead of bidding, or bidding itself; awarded, cancelled and closed (including
  // manually closed) projects are no opportunity. A TOR with no procurement yet reads as draft.
  const now = new Date();
  const openTors = await Tor.find({
    pipelineStatus: "enriched",
    $or: (["draft", "open", "closing_soon"] as const).map((s) => statusClause(s, now)),
  })
    .select(OPEN_TOR_PROJECTION)
    .lean<ITor[]>();
```
- in the response mapping change `tor,` (inside `data: page.map(({ tor, score, matchedCriteria }) => ({ tor, matchScore: score, matchedCriteria }))`) to `tor: withDisplayStatus(tor),`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/__tests__/vendorMatches.test.ts src/__tests__/vendorBookmarks.test.ts`
Expected: all PASS, including the pre-existing matches tests ("only the two enriched, non-closed TORs are candidates", "includes closing_soon TORs…", "returns only the projected TOR fields" — their fixtures have no `procurement`, so they read as `draft`, and a stored `closed` stays excluded).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/bookmarkController.ts backend/src/controllers/matchController.ts backend/src/__tests__/vendorBookmarks.test.ts backend/src/__tests__/vendorMatches.test.ts
git commit -m "feat(backend): use procurement status for bookmarks and vendor matches"
```

---

### Task 4: Admin list rows carry the same status

**Files:**
- Modify: `backend/src/controllers/adminTorController.ts`
- Test: `backend/src/__tests__/adminTors.test.ts`

**Interfaces:**
- Consumes: `withDisplayStatus` (Task 1); the extended `LIST_PROJECTION` (Task 2, already flows into `ADMIN_PROJECT_STAGE`).
- Produces: `GET /api/admin/tors` rows and the `PATCH /api/admin/tors/:id` response `tor` carry `displayStatus` and the `procurement` summary; the existing `?status=` filter (via `buildFilter`) accepts the six statuses; the PATCH body is unchanged (`status` stays `open | closing_soon | closed`).

- [ ] **Step 1: Write the failing test**

In `backend/src/__tests__/adminTors.test.ts` add (use the file's existing admin agent helper; name it as the file does):

```ts
  it("labels rows with their real status and filters by it; a manual close wins", async () => {
    const stage = (s: string) => ({ stage: s, announcements: [], lastCheckedAt: new Date() });
    const [awarded, manuallyClosed] = await Tor.create([
      { title: "ได้ผู้ชนะแล้ว", pipelineStatus: "enriched", procurement: stage("awarded") },
      { title: "ปิดโดยแอดมิน", pipelineStatus: "enriched", status: "closed", procurement: stage("awarded") },
    ]);
    const admin = await adminAgent();

    const all = await admin.get("/api/admin/tors?pageSize=100");
    const byTitle = Object.fromEntries(
      all.body.data.map((t: { title: string; displayStatus: string }) => [t.title, t.displayStatus])
    );
    expect(byTitle["ได้ผู้ชนะแล้ว"]).toBe("awarded");
    expect(byTitle["ปิดโดยแอดมิน"]).toBe("closed");

    const onlyAwarded = await admin.get("/api/admin/tors?status=awarded");
    expect(onlyAwarded.body.data.map((t: { _id: string }) => t._id)).toContain(String(awarded!._id));
    expect(onlyAwarded.body.data.map((t: { _id: string }) => t._id)).not.toContain(String(manuallyClosed!._id));

    const patched = await admin.patch(`/api/admin/tors/${awarded!._id}`).send({ status: "closed" });
    expect(patched.status).toBe(200);
    expect(patched.body.tor.displayStatus).toBe("closed");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/__tests__/adminTors.test.ts`
Expected: the new test FAILS (no `displayStatus`).

- [ ] **Step 3: Implement**

In `backend/src/controllers/adminTorController.ts` add `import { withDisplayStatus, type StatusInput } from "../utils/torStatus";`, then:
- in `listAdminTors` replace `data: result?.data ?? [],` with `data: (result?.data ?? []).map((row) => withDisplayStatus(row as StatusInput)),`
- in `updateAdminTor` replace `res.status(200).json({ tor: saved });` with `res.status(200).json({ tor: saved ? withDisplayStatus(saved) : saved });`

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/__tests__/adminTors.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit, then run the whole backend suite**

```bash
git add backend/src/controllers/adminTorController.ts backend/src/__tests__/adminTors.test.ts
git commit -m "feat(backend): label admin TOR rows with their procurement status"
```

Run: `cd backend && npm run typecheck && npx jest --runInBand`
Expected: typecheck clean, all suites PASS. Fix any regression before moving to the frontend tasks (do not proceed on a red backend).

---

### Task 5: Frontend status model — types, mapping, labels, helpers

**Files:**
- Modify: `frontend/src/lib/mockData.ts` (the `TORStatus` type, new view types, the `TOR` interface)
- Create: `frontend/src/lib/torStatus.ts`
- Modify: `frontend/src/lib/torApi.ts`
- Modify: `frontend/src/lib/torSearch.ts`

**Interfaces:**
- Consumes: API fields `displayStatus`, `procurement`, stored `status` (Tasks 2–4).
- Produces:
  - `type TORStatus` = `"เปิดรับ" | "ใกล้ปิดรับ" | "ปิดรับแล้ว" | "ร่าง TOR" | "ประกาศผู้ชนะแล้ว" | "ยกเลิก"`
  - `interface TorAnnouncementView { id: string; kind: string; typeName: string | null; publishedAt: string | null; hasFile: boolean }`
  - `interface TorProcurementView { stage: "draft" | "inviting" | "awarded" | "cancelled"; contractStatus: string | null; bidDeadline: string | null; lastCheckedAt: string | null; announcements: TorAnnouncementView[] }`
  - `TOR` gains optional `procurement?: TorProcurementView | null` and `manualClosed?: boolean`
  - from `lib/torStatus.ts`: `STATUS_FROM_API`, `ANNOUNCEMENT_KIND_LABELS`, `isBiddable(status)`, `isActiveOpportunity(status)`, `statusNote(tor)`
  - `STATUSES` (6, UI order) and `STATUS_API` (6) in `lib/torSearch.ts`

There is no frontend test framework, so verification is the gate in Step 4.

- [ ] **Step 1: Types in `mockData.ts`**

Replace `export type TORStatus = "เปิดรับ" | "ใกล้ปิดรับ" | "ปิดรับแล้ว";` with:

```ts
export type TORStatus =
  | "เปิดรับ"
  | "ใกล้ปิดรับ"
  | "ปิดรับแล้ว"
  | "ร่าง TOR"
  | "ประกาศผู้ชนะแล้ว"
  | "ยกเลิก";

export interface TorAnnouncementView {
  id: string;
  /** Normalised kind from the backend (`invitation`, `winner`, …); see ANNOUNCEMENT_KIND_LABELS. */
  kind: string;
  typeName: string | null;
  publishedAt: string | null;
  hasFile: boolean;
}

/** Where the project sits in the e-GP procurement lifecycle (Tor.procurement). */
export interface TorProcurementView {
  stage: "draft" | "inviting" | "awarded" | "cancelled";
  /** Raw e-GP contract status, e.g. "ระหว่างดำเนินการ". */
  contractStatus: string | null;
  /** Real bid-submission deadline (ISO) when known; null until it has been read. */
  bidDeadline: string | null;
  lastCheckedAt: string | null;
  /** Dated timeline; only the detail response includes it. */
  announcements: TorAnnouncementView[];
}
```

and in `interface TOR` add after `fairnessFlags: FairnessFlag[];`:

```ts
  /** Optional so the mock rows below stay valid; real API rows always set it (or null). */
  procurement?: TorProcurementView | null;
  /** True when an admin closed the TOR by hand (stored status "closed"). */
  manualClosed?: boolean;
```

- [ ] **Step 2: Create `frontend/src/lib/torStatus.ts`**

```ts
import { formatThaiDate, type TOR, type TORStatus } from "@/lib/mockData";

/** Backend `displayStatus` → the Thai label used throughout the UI. */
export const STATUS_FROM_API: Record<string, TORStatus> = {
  draft: "ร่าง TOR",
  open: "เปิดรับ",
  closing_soon: "ใกล้ปิดรับ",
  closed: "ปิดรับแล้ว",
  awarded: "ประกาศผู้ชนะแล้ว",
  cancelled: "ยกเลิก",
};

/** Thai label for a backend announcement `kind` (Tor.procurement.announcements[].kind). */
export const ANNOUNCEMENT_KIND_LABELS: Record<string, string> = {
  "tor-draft": "ร่างขอบเขตของงาน (TOR)",
  "bidding-draft": "ร่างเอกสารประกวดราคา",
  "reference-price": "ประกาศราคากลาง",
  invitation: "ประกาศเชิญชวน",
  cancellation: "ยกเลิกประกาศเชิญชวน",
  winner: "ประกาศรายชื่อผู้ชนะ",
  plan: "แผนการจัดซื้อจัดจ้าง",
  unknown: "ประกาศอื่น",
};

/** Still taking bids: เปิดรับ or ใกล้ปิดรับ. */
export function isBiddable(status: TORStatus): boolean {
  return status === "เปิดรับ" || status === "ใกล้ปิดรับ";
}

/** Something a vendor can still act on: bidding is open, or the draft TOR is still ahead of it. */
export function isActiveOpportunity(status: TORStatus): boolean {
  return isBiddable(status) || status === "ร่าง TOR";
}

const DAY_MS = 86_400_000;

/** Whole days until `iso` on the real clock (negative = passed). Not the mock TODAY_ISO clock. */
function daysFromNow(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / DAY_MS);
}

/**
 * One-line status detail for cards and tables. The only deadline it ever uses is the real
 * bid-submission deadline (`procurement.bidDeadline`), never the legacy extracted date.
 */
export function statusNote(tor: Pick<TOR, "status" | "procurement">): string {
  const bid = tor.procurement?.bidDeadline ?? null;
  switch (tor.status) {
    case "ร่าง TOR":
      return "ยังไม่ประกาศเชิญชวน";
    case "ประกาศผู้ชนะแล้ว":
      return "ประกาศผู้ชนะแล้ว";
    case "ยกเลิก":
      return "ยกเลิกการจัดซื้อ";
    case "ปิดรับแล้ว":
      return bid ? `ปิดรับเมื่อ ${formatThaiDate(bid)}` : "ปิดรับแล้ว";
    case "ใกล้ปิดรับ":
    case "เปิดรับ": {
      if (!bid) return "ไม่ระบุวันปิดรับ";
      const days = daysFromNow(bid);
      return days <= 0 ? "ปิดรับวันนี้" : `เหลือ ${days} วัน`;
    }
  }
}
```

- [ ] **Step 3: Update `torApi.ts` and `torSearch.ts`**

`frontend/src/lib/torApi.ts`:
- change the import line to `import { type AISummary, type Category, type FairnessField, type FairnessFlag, type TOR, type TorProcurementView } from "@/lib/mockData";` and add `import { STATUS_FROM_API } from "@/lib/torStatus";`
- delete the `mapStatus` function and the 4-line comment above it (keep `export const CLOSING_SOON_DAYS = 7;` and its doc comment — the filter hint in `TORExplorer` uses it);
- add above `export interface ApiTor`:
```ts
interface ApiAnnouncement {
  announcementId: string;
  typeName?: string;
  kind?: string;
  publishedAt?: string;
  hasFile?: boolean;
}

interface ApiProcurement {
  stage?: string;
  contractStatus?: string;
  bidDeadline?: { date?: string } | null;
  lastCheckedAt?: string;
  /** Detail responses only. */
  announcements?: ApiAnnouncement[];
}

const PROCUREMENT_STAGES = ["draft", "inviting", "awarded", "cancelled"] as const;

function mapProcurement(raw: ApiProcurement | null | undefined): TorProcurementView | null {
  if (!raw?.stage) return null;
  return {
    stage: PROCUREMENT_STAGES.find((s) => s === raw.stage) ?? "draft",
    contractStatus: raw.contractStatus ?? null,
    bidDeadline: raw.bidDeadline?.date ?? null,
    lastCheckedAt: raw.lastCheckedAt ?? null,
    announcements: (raw.announcements ?? []).map((a) => ({
      id: a.announcementId,
      kind: a.kind ?? "unknown",
      typeName: a.typeName ?? null,
      publishedAt: a.publishedAt ?? null,
      hasFile: a.hasFile ?? false,
    })),
  };
}
```
- in `interface ApiTor` add after `status?: string;`:
```ts
  /** Server-computed effective status (draft | open | closing_soon | closed | awarded | cancelled). */
  displayStatus?: string;
  procurement?: ApiProcurement | null;
```
- in `mapApiTor` replace `status: mapStatus(raw.status, deadline),` with:
```ts
    // The server computes the status from the procurement stage; a missing value (an old
    // response) falls back to the pre-lifecycle default.
    status: STATUS_FROM_API[raw.displayStatus ?? ""] ?? "เปิดรับ",
    procurement: mapProcurement(raw.procurement),
    manualClosed: raw.status === "closed",
```
- update the doc comment above `fetchStatusCounts` to say it counts "per API status (draft / open / closing_soon / closed / awarded / cancelled)".

`frontend/src/lib/torSearch.ts`:
```ts
export const STATUSES: readonly TORStatus[] = [
  "เปิดรับ",
  "ใกล้ปิดรับ",
  "ร่าง TOR",
  "ปิดรับแล้ว",
  "ประกาศผู้ชนะแล้ว",
  "ยกเลิก",
];
```
```ts
export const STATUS_API: Record<TORStatus, string> = {
  เปิดรับ: "open",
  ใกล้ปิดรับ: "closing_soon",
  ปิดรับแล้ว: "closed",
  "ร่าง TOR": "draft",
  ประกาศผู้ชนะแล้ว: "awarded",
  ยกเลิก: "cancelled",
};
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "mockData|torStatus|torApi|torSearch|StatusBadge|StatusDonut|TORCard|TORRecords|TORPreviewTable"`
Expected at this point: errors **only** in the files Tasks 6–9 fix (the `Record<TORStatus, …>` objects in `StatusBadge.tsx` / `StatusDonut.tsx` are now missing keys) — none in `mockData.ts`, `torStatus.ts`, `torApi.ts`, `torSearch.ts`. Then `npx eslint src/lib/mockData.ts src/lib/torStatus.ts src/lib/torApi.ts src/lib/torSearch.ts` must be clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mockData.ts frontend/src/lib/torStatus.ts frontend/src/lib/torApi.ts frontend/src/lib/torSearch.ts
git commit -m "feat(frontend): map the server-computed TOR status and procurement"
```

---

### Task 6: Badge, card, preview table and donut show every status

**Files:**
- Modify: `frontend/src/components/StatusBadge.tsx`
- Modify: `frontend/src/components/TORCard.tsx`
- Modify: `frontend/src/components/admin/TORPreviewTable.tsx`
- Modify: `frontend/src/components/admin/StatusDonut.tsx`

**Interfaces:**
- Consumes: `TORStatus`, `statusNote` (Task 5).
- Produces: no new exports; all four files compile with the six-value `TORStatus`.

- [ ] **Step 1: `StatusBadge.tsx`** — replace the two style maps with:

```tsx
const styles: Record<TORStatus, string> = {
  เปิดรับ: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  ใกล้ปิดรับ: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  ปิดรับแล้ว: "bg-[var(--color-surface-alt)] text-[var(--color-text-faint)]",
  "ร่าง TOR": "bg-[var(--color-surface-alt)] text-[var(--color-ink-soft)]",
  ประกาศผู้ชนะแล้ว: "bg-[var(--color-rose-light)] text-[var(--color-rose-dark)]",
  ยกเลิก: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
};

const dotStyles: Record<TORStatus, string> = {
  เปิดรับ: "bg-[var(--color-success)]",
  ใกล้ปิดรับ: "bg-[var(--color-warning)]",
  ปิดรับแล้ว: "bg-[var(--color-text-faint)]",
  "ร่าง TOR": "bg-[var(--color-ink-soft)]",
  ประกาศผู้ชนะแล้ว: "bg-[var(--color-rose-dark)]",
  ยกเลิก: "bg-[var(--color-danger)]",
};
```

- [ ] **Step 2: `TORCard.tsx`** — replace the two imports
```tsx
import { TOR, daysUntil, formatBudget, formatThaiDate } from "@/lib/mockData";
import { isUnknownDeadline } from "@/lib/torApi";
```
with
```tsx
import { TOR, formatBudget } from "@/lib/mockData";
import { statusNote } from "@/lib/torStatus";
```
and replace the whole `const remaining = …; const deadlineLabel = …;` block (7 lines) with:
```tsx
  const deadlineLabel = statusNote(tor);
```
(the JSX that uses `deadlineLabel` and the `tor.status === "ใกล้ปิดรับ"` colour check stays unchanged).

- [ ] **Step 3: `TORPreviewTable.tsx`** — change the `torApi` import to `import { categoryToSlug, searchTors } from "@/lib/torApi";`, add `import { statusNote } from "@/lib/torStatus";`, delete the local `deadlineLabel` function (the 5-line function with `isUnknownDeadline` / `daysLeft`), and replace its single call site `deadlineLabel(tor)` with `statusNote(tor)` (grep for it in the file).

- [ ] **Step 4: `StatusDonut.tsx`** — extend the colour map:
```tsx
const STATUS_COLORS: Record<TORStatus, string> = {
  เปิดรับ: "var(--color-success)",
  ใกล้ปิดรับ: "var(--color-warning)",
  ปิดรับแล้ว: "var(--color-text-faint)",
  "ร่าง TOR": "var(--color-ink-soft)",
  ประกาศผู้ชนะแล้ว: "var(--color-rose-dark)",
  ยกเลิก: "var(--color-danger)",
};
```
(`fetchStatusCounts(STATUSES.map(...))` already fans out one request per status, so the donut gets six slices with no other change.)

- [ ] **Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "StatusBadge|TORCard|TORPreviewTable|StatusDonut|torStatus|torApi|torSearch|mockData"` → no output; `npx eslint src/components/StatusBadge.tsx src/components/TORCard.tsx src/components/admin/TORPreviewTable.tsx src/components/admin/StatusDonut.tsx` → clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StatusBadge.tsx frontend/src/components/TORCard.tsx frontend/src/components/admin/TORPreviewTable.tsx frontend/src/components/admin/StatusDonut.tsx
git commit -m "feat(frontend): show every procurement status on badges, cards and the donut"
```

---

### Task 7: Home and dashboard stop treating "not closed" as "open"

**Files:**
- Modify: `frontend/src/app/(site)/page.tsx`
- Modify: `frontend/src/app/(site)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `isBiddable`, `isActiveOpportunity` (Task 5).

- [ ] **Step 1: Home page** — add `import { isBiddable } from "@/lib/torStatus";` and replace the two filters:

```tsx
  const openTOR = torList.filter((t) => isBiddable(t.status));
```
```tsx
  const featured = latest.find((t) => isBiddable(t.status)) ?? latest[0];
```
(`openTOR` feeds the "TOR เปิดรับ" count and "งบประมาณเปิดรับ", so it must mean "taking bids", not "not closed".)

- [ ] **Step 2: Dashboard page** — add `import { isActiveOpportunity } from "@/lib/torStatus";` and replace:

```tsx
  const openTor = useMemo(() => torList.filter((t) => isActiveOpportunity(t.status)), [torList]);
```
(the dashboard's "recommended" fallback list should offer what a vendor can still act on: bidding is open, or the draft TOR is still ahead.)

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "page.tsx"` → no output for these two files; `npx eslint "src/app/(site)/page.tsx" "src/app/(site)/dashboard/page.tsx"` → clean.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(site)/page.tsx" "frontend/src/app/(site)/dashboard/page.tsx"
git commit -m "fix(frontend): count only TORs taking bids as open on the home and dashboard pages"
```

---

### Task 8: Detail page — status, real deadline and announcement timeline

**Files:**
- Modify: `frontend/src/app/(site)/tor/[id]/page.tsx`

**Interfaces:**
- Consumes: `tor.status`, `tor.procurement`, `statusNote`, `ANNOUNCEMENT_KIND_LABELS`, `isBiddable` (Task 5).

- [ ] **Step 1: Imports and derived values**

Change the two imports and add the helper import:
```tsx
import { formatBudget, formatThaiDate, type FairnessField, type FairnessFlag } from "@/lib/mockData";
import { fetchTorById, fetchTorList, isUnknownDeadline } from "@/lib/torApi";
import { ANNOUNCEMENT_KIND_LABELS, statusNote } from "@/lib/torStatus";
```
(`daysUntil` is no longer used by this page.) Replace `const remaining = daysUntil(tor.deadline);` with:
```tsx
  const procurement = tor.procurement ?? null;
  const bidDeadline = procurement?.bidDeadline ?? null;
```

- [ ] **Step 2: Timeline card** — insert directly before the `<div className="mt-8 card p-6 sm:p-7 bg-gradient-to-br from-white to-[var(--color-blush-soft)]">` block that starts the AI summary:

```tsx
          {procurement && procurement.announcements.length > 0 && (
            <div className="mt-8 card p-6 sm:p-7">
              <h2 className="font-[family-name:var(--font-heading)] font-bold text-[var(--color-text)]">
                ลำดับประกาศใน e-GP
              </h2>
              <ol className="mt-4 space-y-3">
                {procurement.announcements.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-rose-dark)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {ANNOUNCEMENT_KIND_LABELS[a.kind] ?? a.typeName ?? "ประกาศ"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {a.publishedAt ? formatThaiDate(a.publishedAt) : "ไม่ระบุวันที่"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)]">
                {procurement.contractStatus && <span>สถานะสัญญา: {procurement.contractStatus}</span>}
                {procurement.lastCheckedAt && (
                  <span>ตรวจสอบสถานะล่าสุด {formatThaiDate(procurement.lastCheckedAt)}</span>
                )}
              </div>
            </div>
          )}

```

- [ ] **Step 3: Deadline block in the aside** — replace the whole `<div className="mt-4 rounded-2xl bg-[var(--color-surface-alt)] px-3.5 py-3"> … </div>` that shows `กำหนดยื่นข้อเสนอ` (from the `<p …>กำหนดยื่นข้อเสนอ</p>` through the `{tor.status !== "ปิดรับแล้ว" && … )}` paragraph) with:

```tsx
            <div className="mt-4 rounded-2xl bg-[var(--color-surface-alt)] px-3.5 py-3">
              <p className="text-xs text-[var(--color-text-muted)]">กำหนดยื่นข้อเสนอ</p>
              <p className="text-sm font-medium text-[var(--color-text)] mt-0.5">
                {bidDeadline ? formatThaiDate(bidDeadline) : "ไม่ระบุ"}
              </p>
              <p
                className={`text-xs mt-1 font-medium ${
                  tor.status === "ใกล้ปิดรับ" ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"
                }`}
              >
                {statusNote(tor)}
              </p>
              {!bidDeadline && !isUnknownDeadline(tor.deadline) && (
                <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-text-faint)]">
                  วันที่ระบุในเอกสาร TOR (อ่านโดย AI): {formatThaiDate(tor.deadline)}
                </p>
              )}
            </div>
```

- [ ] **Step 4: Verify, including the Review-Focus grep**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "tor/\[id\]/page.tsx"` → `0`; `npx eslint "src/app/(site)/tor/[id]/page.tsx"` → clean.

Run the grep that pins Review Focus item 5 across the whole frontend source:
`grep -rn "!== \"ปิดรับแล้ว\"\|=== \"ปิดรับแล้ว\"\|isUnknownDeadline(tor.deadline)" frontend/src --include=*.tsx --include=*.ts`
Expected: no remaining use of `!== "ปิดรับแล้ว"` as an "open" test (any remaining `=== "ปิดรับแล้ว"` must be a genuine closed-state check, e.g. `statusNote`'s switch); the only `isUnknownDeadline(tor.deadline)` left in a *status* decision must be none (the detail page's secondary legacy-date row is allowed). Report every hit and why it is acceptable.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(site)/tor/[id]/page.tsx"
git commit -m "feat(frontend): show the procurement status, bid deadline and timeline on the TOR page"
```

---

### Task 9: Admin records — all statuses, and a manual-close checkbox

**Files:**
- Modify: `frontend/src/components/admin/TORRecords.tsx`

**Interfaces:**
- Consumes: `STATUSES` (Task 5), `tor.manualClosed` (Task 5), admin API `status` PATCH contract (Global Constraints).

- [ ] **Step 1: Tabs from the status list**

Add `STATUSES` to the existing import `import { STATUS_API } from "@/lib/torSearch";` → `import { STATUS_API, STATUSES } from "@/lib/torSearch";` and replace the `statusTabs` constant with:

```tsx
const statusTabs: { label: string; value: TabValue }[] = [
  { label: "ทั้งหมด", value: "ทั้งหมด" },
  { label: "ต้องตรวจสอบ", value: "ต้องตรวจสอบ" },
  ...STATUSES.map((s) => ({ label: s, value: s as TabValue })),
];
```

- [ ] **Step 2: Draft holds a manual-close flag instead of a status**

In `interface Draft` replace `status: TORStatus;` with:
```tsx
  /** Close the TOR by hand: it then shows as ปิดรับแล้ว whatever its real stage is. */
  manualClosed: boolean;
```
In `toDraft` replace `status: tor.status,` with `manualClosed: tor.manualClosed ?? false,`. In `saveDraft`'s PATCH body replace `status: STATUS_API[draft.status],` with:
```tsx
        // Only "closed" has an effect (manual close); any other stored value means "no override".
        status: draft.manualClosed ? "closed" : "open",
```
(`STATUS_API` stays imported — the tab filter still uses it. Remove `TORStatus` from the `mockData` import only if it becomes unused.)

- [ ] **Step 3: The dialog field** — replace the whole `<label className="flex flex-col gap-1.5"> <span …>สถานะ</span> <select …> … </select> </label>` block (the status select with its three options) with:

```tsx
              <label className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-surface-alt)] px-3.5 py-3 text-sm text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={draft.manualClosed}
                  onChange={(e) => setDraft({ ...draft, manualClosed: e.target.checked })}
                  className="mt-0.5 accent-[var(--color-rose-dark)]"
                />
                <span>
                  ปิดรับด้วยตนเอง
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    แสดงเป็น “ปิดรับแล้ว” ไม่ว่าสถานะการจัดซื้อจริงจะเป็นอย่างไร
                  </span>
                </span>
              </label>
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "TORRecords"` → `0` (and re-run `npx tsc --noEmit 2>&1 | grep -E "TORStatus|Record<TORStatus"` → no output); `npx eslint src/components/admin/TORRecords.tsx` → clean.

- [ ] **Step 5: Manual check against a running stack** (skip and say so plainly in the report if no MongoDB / admin account is available — never claim it was done if it was not)

Start backend and frontend, sign in as an admin. Check: `/tor` filter sidebar lists six statuses and each filters correctly; cards show the right badge and note (a TOR the lifecycle refresh marked awarded shows "ประกาศผู้ชนะแล้ว", not "เปิดรับ"); a TOR detail page shows the timeline card with Thai announcement names and the contract status; `/admin/records` has a tab per status; opening a TOR's edit dialog and saving **without** ticking the manual-close box leaves its status unchanged, and ticking it makes it read "ปิดรับแล้ว"; the vendor dashboard no longer recommends awarded or cancelled TORs.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/TORRecords.tsx
git commit -m "feat(frontend): filter admin records by every status and replace the status select with a manual-close option"
```

---

### Task 8b: Tracking board shows the same status note (added after Task 8's grep)

Found by Task 8's Review-Focus grep: `frontend/src/components/TrackingBoard.tsx` still derives a status-like line ("ไม่ระบุวันปิดรับ" / "ปิดรับเมื่อ …" / "เหลือ N วัน") from the legacy `tor.deadline` and the mock clock (`daysUntil`), which contradicts Global Constraints and Review Focus 5.

**Files:**
- Modify: `frontend/src/components/TrackingBoard.tsx`

**Interfaces:**
- Consumes: `statusNote` (Task 5).

- [ ] **Step 1: Replace the deadline text and the colour rule**

Read the whole file first. Add `import { statusNote } from "@/lib/torStatus";`. Replace the `<span className={\`text-[11px] font-medium ${ remaining <= 3 && remaining >= 0 ? … : … }\`}> {isUnknownDeadline(tor.deadline) ? … : … } </span>` block (around lines 120-135, the one that prints the deadline under the agency line) with:

```tsx
                      <span
                        className={`text-[11px] font-medium ${
                          tor.status === "ใกล้ปิดรับ"
                            ? "text-[var(--color-warning)]"
                            : "text-[var(--color-text-faint)]"
                        }`}
                      >
                        {statusNote(tor)}
                      </span>
```

Delete the now-unused `const remaining = daysUntil(tor.deadline);` (wherever it is defined in the item renderer) and remove the imports that become unused (`daysUntil`, `formatThaiDate`, `isUnknownDeadline` — check each before removing). Change nothing else in the file.

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "TrackingBoard"` → `0`; `npx eslint src/components/TrackingBoard.tsx` exits 0 with no new warnings. Re-run the Task 8 grep (`grep -rn "daysUntil" frontend/src --include=*.tsx --include=*.ts`) and report the remaining `daysUntil` users with a one-line reason each (the dashboard `upcoming`/`byUrgency` logic, the calendar and mock data legitimately use the legacy deadline — they are deadline views, not status text).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TrackingBoard.tsx
git commit -m "fix(frontend): show the real status note on the bookmark tracking board"
```

---

## After this plan

Open a PR into `main` from `feat/tor-procurement-status-ui` (stacked on `feat/tor-procurement-refresh` until steps 1–2 merge; rebase after). Then plan step 3b (admin pipeline view: show `pending` / `rejected` / `failed` TORs and their last job error, plus `procurement.lastCheckedAt`) and step 4 (invitation-PDF bid deadline — which also makes `closing_soon` reachable, and must first add the optimistic-precondition guard to both `procurement` writers, see the spec's Open items).
