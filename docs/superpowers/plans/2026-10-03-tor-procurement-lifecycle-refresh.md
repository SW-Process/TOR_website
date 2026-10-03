# TOR Procurement Lifecycle Refresh (Delivery Step 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily job (plus an admin "run now" button) that re-checks existing TORs against e-GP and keeps `Tor.procurement` (stage, contract status, announcements) fresh, within a bounded request budget and without ever costing an AI call.

**Architecture:** A new `ingestion/lifecycle/` module selects eligible TORs (enriched, not finished, oldest-checked first, capped), calls e-GP `projectDetail` + `announcements` for each, rebuilds `procurement` with the step-1 helpers and writes **only** the refresh-owned paths with a targeted `$set`. It is recorded as an `IngestionRun` with `phase: "lifecycle"`, exposed as a Cloud Run Job entrypoint and as two admin endpoints, and surfaced as a third card on the scraper-status page.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, Jest + mongodb-memory-server (backend); Next.js 16 / React 19 / Tailwind v4 (frontend, no test framework — typecheck + lint only).

**Spec:** `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md` §2 (this plan is delivery step 2 of 4). **Depends on step 1** (`feat/tor-procurement-stage`): `buildProcurement`, `mergeProcurement`, `IProcurement`, the `procurement.stage` / `procurement.lastCheckedAt` indexes.

## Global Constraints

- The refresh may write only `procurement.stage`, `procurement.contractStatus`, `procurement.announcements` and `procurement.lastCheckedAt` (or the whole `procurement` when it is currently `null`). It must **never** modify `procurement.bidDeadline`, `sourceContentHash`, `pipelineStatus`, `sourceDocument`, and must **never** enqueue an `EnrichmentJob` or download a file. Writes use `{ timestamps: false }` so `Tor.updatedAt` is not bumped.
- Eligible TORs: `pipelineStatus: "enriched"`, a non-empty `sourceListingUrl`, `procurement.stage` not `"cancelled"`, `procurement.contractStatus` not `"ส่งงานครบถ้วน"`. Order: never-checked (`procurement.lastCheckedAt` missing) first, then oldest `lastCheckedAt`, tie-break `_id`. Cap: `MAX_LIFECYCLE_REFRESH_PER_RUN` (default `100`); the admin endpoint accepts `maxTors` 1–300.
- Run record: `IngestionRun` with `phase: "lifecycle"`; stats reuse existing fields — `torsFound` = TORs selected, `torsUpdated` = procurement changed, `torsUnchanged`, `torsSkipped`, `torsFailed`. `outcomeSummary` = `checked N, changed X, unchanged Y, skipped S, failed F`.
- A per-TOR failure is logged to `SystemLog` (`source: "ingestion"`, `component: "lifecycleRefresh"`), does **not** advance that TOR's `lastCheckedAt`, and never stops the batch.
- A manual run while a lifecycle run is `running` → `409`. A lifecycle run idle longer than the job lease (10 min) or running longer than 35 min is swept to `failed` before the check (reuse/generalise `sweepStaleEnrichmentRuns`).
- Every new env var goes into `backend/.env.example`. Deployment doc `docs/deployment/gcp.md` gets the new job, IAM binding and schedule (daily).
- Commits: Conventional Commits (`<type>(<scope>): <what>`, imperative, no trailing period, one subject line), one thing per commit, **no `Co-Authored-By` trailer or any other trailer** (project memory rule — verify with `git log -1 --format=%B`). Stage only the files a task names. Never push to `main`.
- Verification gate for every backend task: `cd backend && npm run typecheck` plus the task's jest command; for frontend tasks: `cd frontend && npx tsc --noEmit && npx eslint <changed files>`.

## Review Focus

Failure modes the spec implies that are most likely to bite, each pinned by a test in the task named:

1. One TOR's e-GP failure (500, timeout) must not stop the batch or advance that TOR's `lastCheckedAt` → Task 3.
2. Ordering and the cap: never-checked TORs go first, the cap is respected so one run can never exceed the budget → Task 3.
3. The refresh must have zero AI-cost side effects: no `sourceContentHash`/`pipelineStatus` change, no `EnrichmentJob`, no `updatedAt` bump → Task 3.
4. `bidDeadline` and `storageKey` survive a refresh, and a TOR whose `procurement` is currently `null` is handled (a dotted `$set` on a `null` parent would error) → Task 3.
5. A dead lifecycle run (worker killed mid-batch) must not block the manual button forever, and a concurrent manual run gets `409` → Tasks 1 and 5.

**Known limitation (recorded as a spec open item in Task 3):** a TOR that fails *every* run keeps its old `lastCheckedAt`, so it stays at the front of the queue and occupies one slot of the daily cap. With a cap of 100 and few permanent failures this is harmless; if many accumulate, add a `procurement.lastAttemptAt` used for ordering.

---

### Task 0: Branch and commit the plan

**Files:**
- Add: `docs/superpowers/plans/2026-10-03-tor-procurement-lifecycle-refresh.md`

- [ ] **Step 1: Create the branch from the step-1 branch (stacked until step 1 merges)**

```bash
git fetch origin
git worktree add ../TOR_website-lifecycle -b feat/tor-procurement-refresh feat/tor-procurement-stage
cd ../TOR_website-lifecycle
# SDD only: give the worktree the main checkout's dependencies without copying them
cmd //c "mklink /J backend\\node_modules ..\\TOR_website\\backend\\node_modules"
cmd //c "mklink /J frontend\\node_modules ..\\TOR_website\\frontend\\node_modules"
```

If `feat/tor-procurement-stage` has already been merged into `main`, branch from `origin/main` instead. When finished, remove the junctions with `cmd //c "rmdir backend\\node_modules"` (and the frontend one) **before** `git worktree remove` — never delete through the junction.

- [ ] **Step 2: Commit the plan**

```bash
git add docs/superpowers/plans/2026-10-03-tor-procurement-lifecycle-refresh.md
git commit -m "docs(backend): add procurement lifecycle refresh plan (step 2)"
```

---

### Task 1: `lifecycle` run phase and a generalised stale-run sweep

**Files:**
- Modify: `backend/src/models/IngestionRun.ts:5` and the `phase` enum (~line 47)
- Modify: `backend/src/ingestion/enrichment/sweepStaleRuns.ts`
- Test: `backend/src/ingestion/enrichment/__tests__/sweepStaleRuns.test.ts`

**Interfaces:**
- Produces:
  - `type IngestionPhase = "discovery" | "enrichment" | "lifecycle"`
  - `sweepStaleRuns(phase: IngestionPhase, now?: Date): Promise<number>` — fails runs of that phase that are `running` and either started > 35 min ago or idle (`updatedAt`) > 10 min; sets `outcomeSummary` to `interrupted (stale <phase> run swept)`.
  - `sweepStaleEnrichmentRuns(now?: Date): Promise<number>` — unchanged behaviour, now `sweepStaleRuns("enrichment", now)` (existing callers keep working).

- [ ] **Step 1: Write the failing tests**

In `backend/src/ingestion/enrichment/__tests__/sweepStaleRuns.test.ts`: widen the helper's phase parameter type to `"enrichment" | "discovery" | "lifecycle"`, change the import to `import { sweepStaleEnrichmentRuns, sweepStaleRuns } from "../sweepStaleRuns";`, and append:

```ts
describe("sweepStaleRuns", () => {
  it("fails a lifecycle run idle longer than a job lease and says which phase was swept", async () => {
    const run = await runningRun("lifecycle", 11);
    expect(await sweepStaleRuns("lifecycle")).toBe(1);
    const saved = await IngestionRun.findById(run._id).lean();
    expect(saved?.status).toBe("failed");
    expect(saved?.outcomeSummary).toBe("interrupted (stale lifecycle run swept)");
    expect(saved?.completedAt).toBeTruthy();
  });

  it("leaves a recently-updated lifecycle run alone", async () => {
    const run = await runningRun("lifecycle", 2);
    expect(await sweepStaleRuns("lifecycle")).toBe(0);
    expect((await IngestionRun.findById(run._id).lean())?.status).toBe("running");
  });

  it("only touches the requested phase", async () => {
    const lifecycle = await runningRun("lifecycle", 120);
    const enrichment = await runningRun("enrichment", 120);
    expect(await sweepStaleRuns("lifecycle")).toBe(1);
    expect((await IngestionRun.findById(lifecycle._id).lean())?.status).toBe("failed");
    expect((await IngestionRun.findById(enrichment._id).lean())?.status).toBe("running");
  });

  it("keeps sweepStaleEnrichmentRuns as the enrichment wrapper with its old summary text", async () => {
    const run = await runningRun("enrichment", 11);
    expect(await sweepStaleEnrichmentRuns()).toBe(1);
    expect((await IngestionRun.findById(run._id).lean())?.outcomeSummary).toBe(
      "interrupted (stale enrichment run swept)"
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/ingestion/enrichment/__tests__/sweepStaleRuns.test.ts`
Expected: FAIL — `sweepStaleRuns` is not exported (and `"lifecycle"` is not a valid phase).

- [ ] **Step 3: Implement**

In `backend/src/models/IngestionRun.ts` change the type and the enum:

```ts
export type IngestionPhase = "discovery" | "enrichment" | "lifecycle";
```

```ts
    phase: {
      type: String,
      enum: ["discovery", "enrichment", "lifecycle"],
      default: "discovery",
      index: true,
    },
```

Replace `backend/src/ingestion/enrichment/sweepStaleRuns.ts` with:

```ts
// backend/src/ingestion/enrichment/sweepStaleRuns.ts
import { IngestionRun } from "../../models";
import type { IngestionPhase } from "../../models/IngestionRun";
import { LEASE_MS } from "./enrichmentJobRepo";

/** Runs older than this while still "running" are treated as interrupted. */
export const STALE_RUN_MS = 35 * 60_000;
/**
 * A live worker writes its progress to the run row after every unit of work, and a single
 * job's lease is LEASE_MS. A run silent for longer than that lost its worker (e.g. the
 * process restarted mid-run), so it must not keep blocking new runs.
 */
export const IDLE_RUN_MS = LEASE_MS;

/** Mark runs of `phase` left "running" by a dead worker as failed. Returns how many. */
export async function sweepStaleRuns(phase: IngestionPhase, now: Date = new Date()): Promise<number> {
  const res = await IngestionRun.updateMany(
    {
      status: "running",
      phase,
      $or: [
        { startedAt: { $lt: new Date(now.getTime() - STALE_RUN_MS) } },
        { updatedAt: { $lt: new Date(now.getTime() - IDLE_RUN_MS) } },
      ],
    },
    {
      $set: {
        status: "failed",
        completedAt: now,
        outcomeSummary: `interrupted (stale ${phase} run swept)`,
      },
    }
  );
  return res.modifiedCount;
}

/** Enrichment-phase convenience wrapper (kept so existing callers need no change). */
export function sweepStaleEnrichmentRuns(now: Date = new Date()): Promise<number> {
  return sweepStaleRuns("enrichment", now);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion/enrichment src/__tests__/ingestionRoutes.test.ts`
Expected: typecheck clean; all PASS (the pre-existing enrichment sweep tests and route tests still pass).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/IngestionRun.ts backend/src/ingestion/enrichment/sweepStaleRuns.ts backend/src/ingestion/enrichment/__tests__/sweepStaleRuns.test.ts
git commit -m "feat(backend): add the lifecycle run phase and a per-phase stale-run sweep"
```

---

### Task 2: Candidate selection helpers

**Files:**
- Create: `backend/src/ingestion/lifecycle/candidates.ts`
- Test: `backend/src/ingestion/lifecycle/__tests__/candidates.test.ts` (create)

**Interfaces:**
- Produces:
  - `maxLifecycleRefreshPerRun(env?: NodeJS.ProcessEnv): number` — `MAX_LIFECYCLE_REFRESH_PER_RUN` if a positive integer, else `100`.
  - `lifecycleFilter(): QueryFilter<ITor>` — the eligibility filter from Global Constraints.
  - `countLifecycleCandidates(): Promise<number>`
  - `projectIdFromListingUrl(url: string | null | undefined): string | null` — last non-empty path segment of the URL; `null` for a missing/invalid URL or when the last segment is `project-detail`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/ingestion/lifecycle/__tests__/candidates.test.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../../models";
import {
  countLifecycleCandidates,
  lifecycleFilter,
  maxLifecycleRefreshPerRun,
  projectIdFromListingUrl,
} from "../candidates";

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

describe("maxLifecycleRefreshPerRun", () => {
  it("defaults to 100", () => {
    expect(maxLifecycleRefreshPerRun({})).toBe(100);
  });
  it("reads a positive integer from the env", () => {
    expect(maxLifecycleRefreshPerRun({ MAX_LIFECYCLE_REFRESH_PER_RUN: "25" })).toBe(25);
  });
  it.each(["0", "-3", "1.5", "abc", ""])("falls back to 100 for %p", (raw) => {
    expect(maxLifecycleRefreshPerRun({ MAX_LIFECYCLE_REFRESH_PER_RUN: raw })).toBe(100);
  });
});

describe("projectIdFromListingUrl", () => {
  it("returns the last path segment", () => {
    expect(
      projectIdFromListingUrl("https://egp2.bangkok.go.th/project-detail/d8d87f9e-acfc-4653-be90-6386c3f11662")
    ).toBe("d8d87f9e-acfc-4653-be90-6386c3f11662");
  });
  it("ignores a trailing slash, query string and hash", () => {
    expect(projectIdFromListingUrl("https://egp.test/project-detail/abc/")).toBe("abc");
    expect(projectIdFromListingUrl("https://egp.test/project-detail/abc?x=1#frag")).toBe("abc");
  });
  it.each([
    [undefined],
    [null],
    [""],
    ["not a url"],
    ["https://egp.test"],
    ["https://egp.test/project-detail/"],
  ])("returns null for %p", (url) => {
    expect(projectIdFromListingUrl(url as string | null | undefined)).toBeNull();
  });
});

describe("lifecycleFilter", () => {
  const url = (id: string) => `https://egp.test/project-detail/${id}`;
  const procurement = (stage: string, contractStatus?: string) => ({
    stage,
    contractStatus,
    announcements: [],
    lastCheckedAt: new Date("2026-09-01T00:00:00Z"),
  });

  it("selects enriched, unfinished TORs that have a listing URL", async () => {
    await Tor.create([
      { title: "never checked", pipelineStatus: "enriched", sourceListingUrl: url("a") },
      { title: "inviting", pipelineStatus: "enriched", sourceListingUrl: url("b"), procurement: procurement("inviting", "ระหว่างดำเนินการ") },
      { title: "awarded but contract open", pipelineStatus: "enriched", sourceListingUrl: url("c"), procurement: procurement("awarded", "จัดทำสัญญา/ PO แล้ว") },
      { title: "pending", pipelineStatus: "pending", sourceListingUrl: url("d") },
      { title: "rejected", pipelineStatus: "rejected", sourceListingUrl: url("e") },
      { title: "cancelled", pipelineStatus: "enriched", sourceListingUrl: url("f"), procurement: procurement("cancelled") },
      { title: "contract complete", pipelineStatus: "enriched", sourceListingUrl: url("g"), procurement: procurement("awarded", "ส่งงานครบถ้วน") },
      { title: "no listing url", pipelineStatus: "enriched" },
      { title: "empty listing url", pipelineStatus: "enriched", sourceListingUrl: "" },
    ]);
    const titles = (await Tor.find(lifecycleFilter()).sort({ title: 1 }).lean()).map((t) => t.title);
    expect(titles).toEqual(["awarded but contract open", "inviting", "never checked"]);
    expect(await countLifecycleCandidates()).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/ingestion/lifecycle/__tests__/candidates.test.ts`
Expected: FAIL — `Cannot find module '../candidates'`.

- [ ] **Step 3: Implement**

Create `backend/src/ingestion/lifecycle/candidates.ts`:

```ts
// backend/src/ingestion/lifecycle/candidates.ts
import type { QueryFilter } from "mongoose";
import { Tor, type ITor } from "../../models";

/** Contract status after which a project no longer changes, so it is no longer refreshed. */
const FINISHED_CONTRACT_STATUS = "ส่งงานครบถ้วน";

const DEFAULT_MAX_PER_RUN = 100;

/** Max TORs one lifecycle refresh may check (`MAX_LIFECYCLE_REFRESH_PER_RUN`, default 100). */
export function maxLifecycleRefreshPerRun(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MAX_LIFECYCLE_REFRESH_PER_RUN);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_PER_RUN;
}

/**
 * TORs worth re-checking: publicly visible (enriched), reachable (has a listing URL) and not
 * finished (not cancelled, contract not yet complete). `$ne` also matches a missing field, so
 * TORs that have never been checked are included.
 */
export function lifecycleFilter(): QueryFilter<ITor> {
  return {
    pipelineStatus: "enriched",
    sourceListingUrl: { $type: "string", $ne: "" },
    "procurement.stage": { $ne: "cancelled" },
    "procurement.contractStatus": { $ne: FINISHED_CONTRACT_STATUS },
  };
}

export function countLifecycleCandidates(): Promise<number> {
  return Tor.countDocuments(lifecycleFilter());
}

/**
 * e-GP's project id is the last path segment of the listing URL that `mapProject` stored
 * (`<listingBase>/<projectId>`). Returns null when it cannot be recovered.
 */
export function projectIdFromListingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last !== "project-detail" ? last : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion/lifecycle`
Expected: all PASS. If `QueryFilter<ITor>` rejects a dotted key or the `$type` operator, make the smallest typing fix (e.g. a typed object literal) without changing the filter's meaning.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ingestion/lifecycle/candidates.ts backend/src/ingestion/lifecycle/__tests__/candidates.test.ts
git commit -m "feat(backend): select TORs eligible for a lifecycle refresh"
```

---

### Task 3: The refresh itself

**Files:**
- Create: `backend/src/ingestion/lifecycle/refreshLifecycle.ts`
- Test: `backend/src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts` (create)
- Modify: `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md` (open item + stats mapping)

**Interfaces:**
- Consumes: `buildProcurement`, `mergeProcurement` (step 1, `../procurementStage`); `lifecycleFilter`, `maxLifecycleRefreshPerRun`, `projectIdFromListingUrl` (Task 2); `sweepStaleRuns` (Task 1); `logIngestionEvent` (`../log`); `EgpClient`, `egpConfigFromEnv`, `EgpClientLike`.
- Produces:
  - `refreshLifecycle(deps?: RefreshLifecycleDeps): Promise<RefreshLifecycleResult>` where
    `RefreshLifecycleDeps = { client?: EgpClientLike; maxTors?: number; now?: () => Date; trigger?: "manual" | "scheduled"; triggeredBy?: string | null }` and
    `RefreshLifecycleResult = { runId: string; selected: number; changed: number; unchanged: number; skipped: number; failed: number }` (`runId` is `""` and all counts `0` when nothing was eligible; no run row is written then).
  - `procurementChanged(before: IProcurement | null | undefined, after: IProcurement): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts`
Expected: FAIL — `Cannot find module '../refreshLifecycle'`.

- [ ] **Step 3: Implement**

Create `backend/src/ingestion/lifecycle/refreshLifecycle.ts`:

```ts
// backend/src/ingestion/lifecycle/refreshLifecycle.ts
import type { Types } from "mongoose";
import { IngestionRun, Tor } from "../../models";
import type { IProcurement } from "../../models";
import { EgpClient, egpConfigFromEnv } from "../../scraper/egpClient";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import { sweepStaleRuns } from "../enrichment/sweepStaleRuns";
import { logIngestionEvent } from "../log";
import { buildProcurement, mergeProcurement } from "../procurementStage";
import { lifecycleFilter, maxLifecycleRefreshPerRun, projectIdFromListingUrl } from "./candidates";

export interface RefreshLifecycleDeps {
  client?: EgpClientLike;
  /** Max TORs to check this run; defaults to MAX_LIFECYCLE_REFRESH_PER_RUN. */
  maxTors?: number;
  now?: () => Date;
  trigger?: "manual" | "scheduled";
  triggeredBy?: string | null;
}

export interface RefreshLifecycleResult {
  /** "" when nothing was eligible (no run row is written then). */
  runId: string;
  selected: number;
  changed: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

const COMPONENT = "lifecycleRefresh";

function announcementSignature(p: IProcurement): string {
  return p.announcements
    .map(
      (a) =>
        `${a.announcementId}|${a.kind}|${a.publishedAt ? new Date(a.publishedAt).getTime() : ""}|${a.hasFile}`
    )
    .join(";");
}

/** True when the refresh moved the stage, the contract status or the announcement set. */
export function procurementChanged(
  before: IProcurement | null | undefined,
  after: IProcurement
): boolean {
  if (!before) return true;
  if (before.stage !== after.stage) return true;
  if ((before.contractStatus ?? null) !== (after.contractStatus ?? null)) return true;
  return announcementSignature(before) !== announcementSignature(after);
}

/**
 * Persist a refresh. Writes only the refresh-owned paths so `bidDeadline` (admin edit /
 * invitation-PDF extraction) can never be clobbered, and skips timestamps so `Tor.updatedAt`
 * is not bumped by a status check. When the TOR has no `procurement` yet the whole object is
 * set (a dotted `$set` under a null parent would error).
 */
async function writeProcurement(
  torId: Types.ObjectId,
  existing: IProcurement | null | undefined,
  merged: IProcurement
): Promise<void> {
  if (!existing) {
    await Tor.updateOne({ _id: torId }, { $set: { procurement: merged } }, { timestamps: false });
    return;
  }
  const $set: Record<string, unknown> = {
    "procurement.stage": merged.stage,
    "procurement.announcements": merged.announcements,
    "procurement.lastCheckedAt": merged.lastCheckedAt,
  };
  const $unset: Record<string, 1> = {};
  if (merged.contractStatus === undefined) $unset["procurement.contractStatus"] = 1;
  else $set["procurement.contractStatus"] = merged.contractStatus;
  await Tor.updateOne(
    { _id: torId },
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { timestamps: false }
  );
}

/**
 * Re-check existing TORs against e-GP and refresh their `procurement`. Never touches the
 * source hash or pipeline status and never enqueues AI work — a status check must cost no
 * Gemini call.
 */
export async function refreshLifecycle(
  deps: RefreshLifecycleDeps = {}
): Promise<RefreshLifecycleResult> {
  const client = deps.client ?? new EgpClient(egpConfigFromEnv());
  const now = deps.now ?? (() => new Date());
  const cap = deps.maxTors ?? maxLifecycleRefreshPerRun();

  await sweepStaleRuns("lifecycle");

  // A missing lastCheckedAt sorts before any date, so never-checked TORs come first.
  const tors = await Tor.find(lifecycleFilter())
    .sort({ "procurement.lastCheckedAt": 1, _id: 1 })
    .limit(cap)
    .select("projectCode sourceListingUrl procurement")
    .lean();
  if (tors.length === 0) {
    return { runId: "", selected: 0, changed: 0, unchanged: 0, skipped: 0, failed: 0 };
  }

  const run = await IngestionRun.create({
    trigger: deps.trigger ?? "scheduled",
    triggeredBy: deps.triggeredBy ?? null,
    phase: "lifecycle",
    status: "running",
    stats: { torsFound: tors.length },
  });
  const runId = run._id as Types.ObjectId;

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;
  const flush = () =>
    IngestionRun.updateOne(
      { _id: runId },
      {
        $set: {
          "stats.torsUpdated": changed,
          "stats.torsUnchanged": unchanged,
          "stats.torsSkipped": skipped,
          "stats.torsFailed": failed,
        },
      }
    );

  try {
    for (const tor of tors) {
      const label = tor.projectCode ?? String(tor._id);
      try {
        const projectId = projectIdFromListingUrl(tor.sourceListingUrl);
        if (!projectId) {
          skipped += 1;
          await logIngestionEvent({
            severity: "warning",
            message: `lifecycle refresh skipped TOR ${label}: no e-GP project id in its listing URL`,
            component: COMPONENT,
            ingestionRunId: runId,
          });
        } else {
          const detail = await client.projectDetail(projectId);
          const announcements = await client.announcements(projectId);
          const fresh = buildProcurement(announcements, detail.masterContractAvailableName, now());
          const merged = mergeProcurement(tor.procurement, fresh);
          const didChange = procurementChanged(tor.procurement, merged);
          await writeProcurement(tor._id, tor.procurement, merged);
          if (didChange) changed += 1;
          else unchanged += 1;
        }
      } catch (err) {
        failed += 1;
        await logIngestionEvent({
          severity: "error",
          message: `lifecycle refresh failed for TOR ${label}: ${(err as Error).message}`,
          component: COMPONENT,
          context: { torId: String(tor._id), stack: (err as Error).stack },
          ingestionRunId: runId,
        });
      }
      await flush();
    }

    const status =
      failed === 0 ? "success" : changed + unchanged + skipped === 0 ? "failed" : "partial";
    const outcomeSummary = `checked ${tors.length}, changed ${changed}, unchanged ${unchanged}, skipped ${skipped}, failed ${failed}`;
    await IngestionRun.updateOne(
      { _id: runId },
      { $set: { completedAt: new Date(), status, outcomeSummary } }
    );
    await logIngestionEvent({
      severity: "info",
      message: outcomeSummary,
      component: COMPONENT,
      ingestionRunId: runId,
    });
  } catch (fatal) {
    const outcomeSummary = `lifecycle refresh aborted: ${(fatal as Error).message}`;
    await IngestionRun.updateOne(
      { _id: runId },
      { $set: { completedAt: new Date(), status: "failed", outcomeSummary } }
    );
    await logIngestionEvent({
      severity: "error",
      message: outcomeSummary,
      component: COMPONENT,
      context: { stack: (fatal as Error).stack },
      ingestionRunId: runId,
    });
  }

  return { runId: runId.toString(), selected: tors.length, changed, unchanged, skipped, failed };
}

export default refreshLifecycle;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/ingestion/lifecycle`
Expected: all PASS. If mongoose typing rejects the `$set`/`$unset` records or `timestamps: false`, make the smallest typing fix; do not change which paths are written.

- [ ] **Step 5: Update the spec to match what was built**

In `docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md`, in §2 replace the sentence `Recorded as an \`IngestionRun\` with \`phase: "lifecycle"\`;` with:

```markdown
Recorded as an `IngestionRun` with `phase: "lifecycle"` (stats reuse existing fields:
`torsFound` = selected, `torsUpdated` = procurement changed, plus `torsUnchanged`,
`torsSkipped`, `torsFailed`);
```

and append to the "Open items" list:

```markdown
- A TOR that fails every run keeps its old `lastCheckedAt`, so it stays at the front of
  the queue and takes one slot of the daily cap. Harmless for a few permanent failures;
  if many accumulate, order by a separate `procurement.lastAttemptAt`.
```

(Locate both by their surrounding text; if the first sentence has been reworded, apply the same meaning in place.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/ingestion/lifecycle/refreshLifecycle.ts backend/src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts docs/superpowers/specs/2026-10-03-tor-procurement-lifecycle-design.md
git commit -m "feat(backend): refresh the procurement stage of existing TORs from e-GP"
```

---

### Task 4: Cloud Run Job entrypoint, env and deployment docs

**Files:**
- Create: `backend/src/jobs/lifecycle.ts`
- Modify: `backend/src/jobs/__tests__/entrypoints.test.ts`
- Modify: `backend/package.json` (scripts)
- Modify: `backend/.env.example`
- Modify: `docs/deployment/gcp.md`
- Modify: `CLAUDE.md` (one short section)

**Interfaces:**
- Consumes: `refreshLifecycle` (Task 3).
- Produces: `runLifecycleJob(): Promise<void>` (exit code `1` on a thrown error, never `process.exit()`), npm script `job:lifecycle`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/jobs/__tests__/entrypoints.test.ts`, after the `drainEnrichmentQueue` mock block add:

```ts
const refreshLifecycle = jest.fn(async () => ({
  runId: "r3",
  selected: 2,
  changed: 1,
  unchanged: 1,
  skipped: 0,
  failed: 0,
}));
jest.mock("../../ingestion/lifecycle/refreshLifecycle", () => ({ refreshLifecycle }));
```

and inside the `describe("job entrypoints", …)` block add these tests (before its closing `});`):

```ts
  it("runLifecycleJob refreshes the lifecycle once as a scheduled run", async () => {
    const { runLifecycleJob } = await import("../lifecycle");
    await runLifecycleJob();
    expect(refreshLifecycle).toHaveBeenCalledTimes(1);
    expect(refreshLifecycle).toHaveBeenCalledWith(expect.objectContaining({ trigger: "scheduled" }));
    expect(process.exitCode).toBe(0);
  });

  it("runLifecycleJob sets exitCode 1 when the refresh throws", async () => {
    refreshLifecycle.mockRejectedValueOnce(new Error("boom"));
    const { runLifecycleJob } = await import("../lifecycle");
    await runLifecycleJob();
    expect(process.exitCode).toBe(1);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/jobs/__tests__/entrypoints.test.ts`
Expected: FAIL — `Cannot find module '../lifecycle'`.

- [ ] **Step 3: Implement**

Create `backend/src/jobs/lifecycle.ts`:

```ts
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { refreshLifecycle } from "../ingestion/lifecycle/refreshLifecycle";

/**
 * Cloud Run Job entrypoint: refresh the procurement stage of existing TORs once (up to
 * MAX_LIFECYCLE_REFRESH_PER_RUN), then exit. Triggered daily by Cloud Scheduler. On any error it
 * sets `process.exitCode = 1` (never `process.exit()` mid-write) so Cloud Run marks the
 * execution failed after Mongo is cleanly disconnected.
 */
export async function runLifecycleJob(): Promise<void> {
  try {
    await connectDB();
    const out = await refreshLifecycle({ trigger: "scheduled" });
    console.log(
      `lifecycle run ${out.runId || "(nothing to check)"}: checked ${out.selected}, changed ${out.changed}, unchanged ${out.unchanged}, skipped ${out.skipped}, failed ${out.failed}`
    );
  } catch (err) {
    console.error("lifecycle job failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) void runLifecycleJob();
```

In `backend/package.json` add to `scripts` (after `job:enrichment`):

```json
    "job:lifecycle": "node dist/jobs/lifecycle.js"
```

(add the comma to the previous line).

In `backend/.env.example`, directly after the `MAX_AI_CALLS_PER_RUN=50` line add:

```
# Max TORs the daily lifecycle refresh re-checks against e-GP per run (e-GP politeness cap)
MAX_LIFECYCLE_REFRESH_PER_RUN=100
```

In `docs/deployment/gcp.md`:
 - in the IAM block, after the `tor-enrichment` binding add:
```
  gcloud run jobs add-iam-policy-binding tor-lifecycle \
    --member="serviceAccount:tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com" \
    --role="roles/run.invoker" --region asia-southeast1
```
 - in "## Jobs", after the `tor-enrichment` deploy command add:
```
gcloud run jobs deploy tor-lifecycle \
  --image <IMG> --region asia-southeast1 --service-account tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com \
  --set-secrets MONGODB_URI=MONGODB_URI:latest \
  --set-env-vars "^::^MAX_LIFECYCLE_REFRESH_PER_RUN=100" \
  --command node --args dist/jobs/lifecycle.js --max-retries 0 --task-timeout 1800s --memory 512Mi
```
 - in "## Schedules", after the `tor-enrichment-cron` command add (daily, 02:00 Bangkok time = 19:00 UTC):
```
gcloud scheduler jobs create http tor-lifecycle-cron --location asia-southeast1 \
  --schedule "0 19 * * *" \
  --uri "https://<REGION>-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<PROJECT>/jobs/tor-lifecycle:run" \
  --http-method POST \
  --oauth-service-account-email tor-jobs-sa@<PROJECT>.iam.gserviceaccount.com
```
 - update the sentence at the top that says "two Cloud Run **jobs**" to "three Cloud Run **jobs** (`tor-discovery`, `tor-enrichment`, `tor-lifecycle`)".

In `CLAUDE.md`, after the "### AI enrichment" section add:

```markdown
### Lifecycle refresh (`backend/src/ingestion/lifecycle/`)
`Tor.procurement` (stage `draft|inviting|awarded|cancelled`, announcements, contract
status) is derived from e-GP announcements by `ingestion/procurementStage.ts`. Discovery
fills it for sighted TORs; a separate daily batch (`refreshLifecycle`, entrypoint
`dist/jobs/lifecycle.js`, admin `POST /api/ingestion/lifecycle/runs`) re-checks existing
enriched, unfinished TORs oldest-first up to `MAX_LIFECYCLE_REFRESH_PER_RUN`. It writes only
the refresh-owned `procurement` paths and never touches `sourceContentHash`,
`pipelineStatus` or the AI queue — a status check costs no Gemini call.
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/jobs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/jobs/lifecycle.ts backend/src/jobs/__tests__/entrypoints.test.ts backend/package.json backend/.env.example docs/deployment/gcp.md CLAUDE.md
git commit -m "feat(backend): add the lifecycle refresh job entrypoint and deployment config"
```

---

### Task 5: Admin API — run now and pending count

**Files:**
- Modify: `backend/src/controllers/ingestionController.ts`
- Modify: `backend/src/routes/ingestionRoutes.ts`
- Test: `backend/src/__tests__/ingestionRoutes.test.ts`

**Interfaces:**
- Consumes: `refreshLifecycle` (Task 3), `countLifecycleCandidates` / `maxLifecycleRefreshPerRun` (Task 2), `sweepStaleRuns` (Task 1).
- Produces:
  - `POST /api/ingestion/lifecycle/runs` (admin) body `{ maxTors?: 1..300 }` → `202 { status: "running" }`; `400` out of range; `409` when a lifecycle run is `running`.
  - `GET /api/ingestion/lifecycle/pending` (admin) → `200 { candidates, maxTors, willCheck }` where `willCheck = min(candidates, maxTors)`.
  - `GET /api/ingestion/runs` additionally sweeps dead lifecycle runs.

- [ ] **Step 1: Write the failing tests**

In `backend/src/__tests__/ingestionRoutes.test.ts`:

(a) next to the other module mocks add:

```ts
const refreshLifecycleMock = jest.fn();
jest.mock("../ingestion/lifecycle/refreshLifecycle", () => ({
  refreshLifecycle: (...args: unknown[]) => refreshLifecycleMock(...args),
}));
```

(b) extend the model import to include `Tor` (e.g. `import { IngestionRun, EnrichmentJob, Tor } from "../models";`).

(c) add before `describe("GET /api/ingestion/runs", …)`:

```ts
describe("POST /api/ingestion/lifecycle/runs", () => {
  const settled = {
    runId: "r",
    selected: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  it("401 without a session", async () => {
    expect((await request(app).post("/api/ingestion/lifecycle/runs").send({})).status).toBe(401);
  });

  it("403 for a vendor", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v4@test.com", password: "secret123" });
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(403);
  });

  it("202 for an admin and starts one manual refresh", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "running" });
    expect(refreshLifecycleMock).toHaveBeenCalledTimes(1);
    expect(refreshLifecycleMock.mock.calls[0][0]).toMatchObject({
      trigger: "manual",
      triggeredBy: expect.any(String),
    });
    expect(refreshLifecycleMock.mock.calls[0][0].maxTors).toBeUndefined();
  });

  it("passes an explicit maxTors through", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({ maxTors: 7 });
    expect(res.status).toBe(202);
    expect(refreshLifecycleMock.mock.calls[0][0]).toMatchObject({ maxTors: 7 });
  });

  it.each([0, -1, 1.5, 301, "abc"])("400 when maxTors is %p", async (maxTors) => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({ maxTors });
    expect(res.status).toBe(400);
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
  });

  it("409 when a lifecycle run is already in progress", async () => {
    await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});
    expect(res.status).toBe(409);
    expect(refreshLifecycleMock).not.toHaveBeenCalled();
  });

  it("is not blocked by a running run of another phase", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    await IngestionRun.create({ trigger: "scheduled", phase: "enrichment", status: "running" });
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/lifecycle/runs").send({})).status).toBe(202);
  });

  it("sweeps a dead (idle) lifecycle run instead of blocking on it with 409", async () => {
    refreshLifecycleMock.mockResolvedValue(settled);
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    const agent = await adminAgent();

    const res = await agent.post("/api/ingestion/lifecycle/runs").send({});

    expect(res.status).toBe(202);
    expect((await IngestionRun.findById(dead._id).lean())?.status).toBe("failed");
  });
});

describe("GET /api/ingestion/lifecycle/pending", () => {
  const OLD_MAX = process.env.MAX_LIFECYCLE_REFRESH_PER_RUN;
  afterEach(async () => {
    await Tor.deleteMany({});
    if (OLD_MAX === undefined) delete process.env.MAX_LIFECYCLE_REFRESH_PER_RUN;
    else process.env.MAX_LIFECYCLE_REFRESH_PER_RUN = OLD_MAX;
  });

  it("401 without a session and 403 for a vendor", async () => {
    expect((await request(app).get("/api/ingestion/lifecycle/pending")).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "v5@test.com", password: "secret123" });
    expect((await agent.get("/api/ingestion/lifecycle/pending")).status).toBe(403);
  });

  it("reports eligible TORs capped by MAX_LIFECYCLE_REFRESH_PER_RUN", async () => {
    process.env.MAX_LIFECYCLE_REFRESH_PER_RUN = "2";
    const url = (id: string) => `https://egp.test/project-detail/${id}`;
    await Tor.create([
      { title: "a", pipelineStatus: "enriched", sourceListingUrl: url("a") },
      { title: "b", pipelineStatus: "enriched", sourceListingUrl: url("b") },
      { title: "c", pipelineStatus: "enriched", sourceListingUrl: url("c") },
      { title: "pending", pipelineStatus: "pending", sourceListingUrl: url("d") },
      {
        title: "cancelled",
        pipelineStatus: "enriched",
        sourceListingUrl: url("e"),
        procurement: { stage: "cancelled", announcements: [], lastCheckedAt: new Date() },
      },
    ]);
    const agent = await adminAgent();

    const res = await agent.get("/api/ingestion/lifecycle/pending");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: 3, maxTors: 2, willCheck: 2 });
  });

  it("reports zero when nothing is eligible", async () => {
    const agent = await adminAgent();
    const res = await agent.get("/api/ingestion/lifecycle/pending");
    expect(res.body.candidates).toBe(0);
    expect(res.body.willCheck).toBe(0);
  });
});
```

(d) inside the existing `describe("GET /api/ingestion/runs", …)` add:

```ts
  it("reports an idle lifecycle run as failed rather than running", async () => {
    const dead = await IngestionRun.create({ trigger: "scheduled", phase: "lifecycle", status: "running" });
    await IngestionRun.collection.updateOne(
      { _id: dead._id },
      { $set: { updatedAt: new Date(Date.now() - 11 * 60_000) } }
    );
    const agent = await adminAgent();
    const res = await agent.get("/api/ingestion/runs");
    expect(res.body.runs[0].status).toBe("failed");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --runInBand src/__tests__/ingestionRoutes.test.ts`
Expected: the new tests FAIL (404 on the new routes); existing tests PASS.

- [ ] **Step 3: Implement**

In `backend/src/controllers/ingestionController.ts`:

Add imports:

```ts
import { refreshLifecycle } from "../ingestion/lifecycle/refreshLifecycle";
import { countLifecycleCandidates, maxLifecycleRefreshPerRun } from "../ingestion/lifecycle/candidates";
import { sweepStaleEnrichmentRuns, sweepStaleRuns } from "../ingestion/enrichment/sweepStaleRuns";
```

(replace the existing single-name `sweepStaleEnrichmentRuns` import from that module with the two-name import.)

Next to the other ceilings add:

```ts
const LIFECYCLE_MAX_TORS_CEILING = 300;
```

Next to `parseEnrichmentMaxCalls` add:

```ts
function parseLifecycleMaxTors(raw: unknown): number | undefined {
  if (raw === undefined) return undefined; // fall back to MAX_LIFECYCLE_REFRESH_PER_RUN
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > LIFECYCLE_MAX_TORS_CEILING) {
    throw httpError(400, `maxTors must be an integer between 1 and ${LIFECYCLE_MAX_TORS_CEILING}`);
  }
  return n;
}
```

After `getEnrichmentPending` add:

```ts
/** POST /api/ingestion/lifecycle/runs — admin-triggered procurement-stage refresh. */
export async function createLifecycleRun(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const maxTors = parseLifecycleMaxTors(body.maxTors);

  // A run whose worker died (e.g. backend restart) must not block new runs forever.
  await sweepStaleRuns("lifecycle");
  const active = await IngestionRun.exists({ status: "running", phase: "lifecycle" });
  if (active) throw httpError(409, "A lifecycle refresh is already in progress");

  void refreshLifecycle({ trigger: "manual", triggeredBy: req.user!.id, maxTors }).catch((err) => {
    console.error("lifecycle run failed:", err);
  });

  res.status(202).json({ status: "running" });
}

/** GET /api/ingestion/lifecycle/pending — how many TORs the next refresh would check. */
export async function getLifecyclePending(_req: Request, res: Response): Promise<void> {
  const candidates = await countLifecycleCandidates();
  const maxTors = maxLifecycleRefreshPerRun();
  res.status(200).json({ candidates, maxTors, willCheck: Math.min(candidates, maxTors) });
}
```

In `listRuns`, replace the existing `await sweepStaleEnrichmentRuns(); // …` line with:

```ts
  // so the admin UI sees a dead run as failed, not "running"
  await Promise.all([sweepStaleEnrichmentRuns(), sweepStaleRuns("lifecycle")]);
```

In `backend/src/routes/ingestionRoutes.ts` add `createLifecycleRun, getLifecyclePending,` to the controller import and:

```ts
router.post("/lifecycle/runs", createLifecycleRun);
router.get("/lifecycle/pending", getLifecyclePending);
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npm run typecheck && npx jest --runInBand src/__tests__/ingestionRoutes.test.ts src/ingestion src/jobs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/ingestionController.ts backend/src/routes/ingestionRoutes.ts backend/src/__tests__/ingestionRoutes.test.ts
git commit -m "feat(backend): add admin endpoints to run and size the lifecycle refresh"
```

---

### Task 6: Frontend hook — lifecycle phase, queue count and trigger

**Files:**
- Modify: `frontend/src/lib/useIngestionRuns.ts`

**Interfaces:**
- Consumes: `POST /api/ingestion/lifecycle/runs`, `GET /api/ingestion/lifecycle/pending` (Task 5).
- Produces (added to the hook's return value and exported types):
  - `type IngestionPhase = "discovery" | "enrichment" | "lifecycle"`
  - `interface LifecycleQueueInfo { candidates: number; maxTors: number; willCheck: number }`
  - `lifecyclePending: boolean`, `lifecycleQueue: LifecycleQueueInfo | null`, `triggerLifecycle(params?: { maxTors?: number }): Promise<void>`.

There is no frontend test framework; verification is typecheck + lint (Step 3) and the manual check in Task 7.

- [ ] **Step 1: Edit the hook**

Apply these edits to `frontend/src/lib/useIngestionRuns.ts`:

1. Widen the phase type:
```ts
export type IngestionPhase = "discovery" | "enrichment" | "lifecycle";
```
2. After the `EnrichmentQueueInfo` interface add:
```ts
/** What the next lifecycle refresh would do (GET /api/ingestion/lifecycle/pending). */
export interface LifecycleQueueInfo {
  candidates: number;
  maxTors: number;
  willCheck: number;
}
```
3. Add `lifecycle: 40 * 60_000,` to `POLL_TIMEOUT_MS` (the backend sweeps a run stuck "running" after 35 min).
4. Next to the other state hooks add:
```ts
  const [lifecyclePending, setLifecyclePending] = useState(false);
  const [lifecycleQueue, setLifecycleQueue] = useState<LifecycleQueueInfo | null>(null);
```
5. After `refreshEnrichmentQueue` add:
```ts
  const refreshLifecycleQueue = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ingestion/lifecycle/pending");
      if (!res.ok) return;
      setLifecycleQueue((await res.json()) as LifecycleQueueInfo);
    } catch {
      // The count is advisory; the trigger button still works without it.
    }
  }, []);
```
6. In `pollUntilSettled`, after `if (phase === "enrichment") void refreshEnrichmentQueue();` add `if (phase === "lifecycle") void refreshLifecycleQueue();` and add `refreshLifecycleQueue` to the `useCallback` dependency array (`[refresh, refreshEnrichmentQueue, refreshLifecycleQueue]`).
7. In the mount `useEffect`, after the discovery block inside the `.then(...)` add:
```ts
        if (list.some((r) => r.phase === "lifecycle" && r.status === "running")) {
          setLifecyclePending(true);
          pollUntilSettled("lifecycle", setLifecyclePending);
        }
```
and after the enrichment-queue `apiFetch(...)` chain (still inside the effect) add:
```ts
    apiFetch("/api/ingestion/lifecycle/pending")
      .then(async (res) => {
        if (res.ok) setLifecycleQueue((await res.json()) as LifecycleQueueInfo);
      })
      .catch(() => undefined); // advisory count only
```
(Keep the fetches inline like the existing ones — the `react-hooks/set-state-in-effect` lint rule rejects calling a state-setting callback synchronously in the effect body.)
8. After `triggerEnrichment` add:
```ts
  const triggerLifecycle = useCallback(async (params?: { maxTors?: number }) => {
    setError(null);
    setLifecyclePending(true);
    try {
      const res = await apiFetch("/api/ingestion/lifecycle/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        setLifecyclePending(false);
        return;
      }
      if (!res.ok && res.status !== 409) {
        throw new Error("failed to trigger lifecycle refresh");
      }
      requestAdminStatsRefresh();
      pollUntilSettled("lifecycle", setLifecyclePending);
    } catch {
      setError("สั่งตรวจสถานะการจัดซื้อไม่สำเร็จ");
      setLifecyclePending(false);
    }
  }, [pollUntilSettled]);
```
9. Add `lifecyclePending, lifecycleQueue, triggerLifecycle,` to the returned object.

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/lib/useIngestionRuns.ts`
Expected: no output (clean). (`ScraperHealth.tsx` still compiles because `PHASE_LABEL` is a `Record<IngestionPhase, string>` — if `tsc` reports the missing `lifecycle` key there, that is expected until Task 7; in that case add the label first: `lifecycle: "ตรวจสถานะการจัดซื้อ (Lifecycle)",` and note it in the report.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/useIngestionRuns.ts
git commit -m "feat(frontend): add lifecycle refresh state and trigger to the ingestion hook"
```

---

### Task 7: Scraper-status page — the lifecycle card

**Files:**
- Modify: `frontend/src/components/admin/ScraperHealth.tsx`

**Interfaces:**
- Consumes: `lifecyclePending`, `lifecycleQueue`, `triggerLifecycle`, `LifecycleQueueInfo` (Task 6); `IngestionRun.stats` fields `torsFound`, `torsUpdated`, `torsUnchanged`, `torsSkipped`, `torsFailed`.

- [ ] **Step 1: Edit the component**

1. Imports — add the icon and the type:
```ts
import { Clock, ListChecks, RotateCw, Sparkles } from "lucide-react";
```
```ts
import {
  useIngestionRuns,
  type EnrichmentQueueInfo,
  type IngestionPhase,
  type IngestionRun,
  type LifecycleQueueInfo,
} from "@/lib/useIngestionRuns";
```
2. Label:
```ts
const PHASE_LABEL: Record<IngestionPhase, string> = {
  discovery: "ดึงข้อมูล (Ingestion)",
  enrichment: "วิเคราะห์ด้วย AI (Enrichment)",
  lifecycle: "ตรวจสถานะการจัดซื้อ (Lifecycle)",
};
```
3. Add a shared progress component above `EnrichmentStatus`:
```tsx
/** "X / N" with a progress bar and a one-line breakdown, shared by the batch phases. */
function RunProgress({
  label,
  done,
  total,
  detail,
}: {
  label: string;
  done: number;
  total: number;
  detail: string;
}) {
  const percent = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="mt-4" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-faint)]">{label}</span>
        <span className="font-medium text-[var(--color-text)]">
          {done} / {total} รายการ
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
      >
        <div
          className="h-full rounded-full bg-[var(--color-ink)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">{detail}</p>
    </div>
  );
}
```
4. In `EnrichmentStatus`, replace the whole `return ( <div className="mt-4" aria-live="polite"> … </div> );` of the `pending` branch (the block that renders the progress bar, from `const percent = …` to the closing `);`) with:
```tsx
    return (
      <RunProgress
        label="กำลังวิเคราะห์"
        done={done}
        total={planned}
        detail={`สำเร็จ ${enrichedOk} · ไม่เกี่ยวกับซอฟต์แวร์ ${enrichedRejected} · ล้มเหลว ${enrichedFailed}${
          enrichmentRetried > 0 ? ` · รอลองใหม่ ${enrichmentRetried}` : ""
        }`}
      />
    );
```
(keep the preceding `const { torsFound: done, enrichedOk, … } = run.stats;` line; remove only the now-unused `percent` constant.)
5. Add below `EnrichmentStatus`:
```tsx
/** Before a run: how many TORs it will check. During a run: "X / N" with a progress bar. */
function LifecycleStatus({
  pending,
  queue,
  run,
}: {
  pending: boolean;
  queue: LifecycleQueueInfo | null;
  run: IngestionRun | null;
}) {
  if (pending) {
    const total = run?.stats.torsFound ?? 0;
    // The run row appears once the batch is selected; until then there is nothing to count.
    if (!run || total === 0) {
      return (
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">กำลังเตรียมรายการที่จะตรวจ...</p>
      );
    }
    const { torsUpdated, torsUnchanged, torsSkipped, torsFailed } = run.stats;
    return (
      <RunProgress
        label="กำลังตรวจสถานะ"
        done={torsUpdated + torsUnchanged + torsSkipped + torsFailed}
        total={total}
        detail={`เปลี่ยนสถานะ ${torsUpdated} · ไม่เปลี่ยน ${torsUnchanged} · ข้าม ${torsSkipped} · ล้มเหลว ${torsFailed}`}
      />
    );
  }

  if (!queue) return null;
  if (queue.candidates === 0) {
    return (
      <p className="mt-4 text-xs text-[var(--color-text-faint)]">ไม่มี TOR ที่ต้องตรวจสถานะ</p>
    );
  }
  return (
    <p className="mt-4 text-xs text-[var(--color-text-muted)]">
      พร้อมตรวจ <span className="font-semibold text-[var(--color-text)]">{queue.willCheck}</span>{" "}
      รายการ
      {queue.candidates > queue.willCheck && ` (จากทั้งหมด ${queue.candidates})`}
    </p>
  );
}
```
6. In `ScraperHealth()` destructure `lifecyclePending, lifecycleQueue, triggerLifecycle,` from `useIngestionRuns()`.
7. Add the third entry to the card array (after the enrichment entry):
```tsx
              {
                phase: "lifecycle" as const,
                pending: lifecyclePending,
                onTrigger: () => triggerLifecycle(),
              },
```
8. Change the grid class from `grid sm:grid-cols-2 gap-4` to `grid sm:grid-cols-2 lg:grid-cols-3 gap-4`.
9. Extend the disabled logic:
```tsx
            const nothingQueued =
              !pending &&
              ((phase === "enrichment" && enrichmentQueue?.runnable === 0) ||
                (phase === "lifecycle" && lifecycleQueue?.candidates === 0));
```
10. After the `{phase === "enrichment" && ( … )}` block add:
```tsx
                {phase === "lifecycle" && (
                  <LifecycleStatus
                    pending={pending}
                    queue={lifecycleQueue}
                    run={last?.status === "running" ? last : null}
                  />
                )}
```
11. Replace the button icon selection so each phase has its own icon:
```tsx
                  {phase === "enrichment" ? (
                    <Sparkles size={13} className={pending ? "animate-pulse" : ""} />
                  ) : phase === "lifecycle" ? (
                    <ListChecks size={13} className={pending ? "animate-pulse" : ""} />
                  ) : (
                    <RotateCw size={13} className={pending ? "animate-spin" : ""} />
                  )}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/components/admin/ScraperHealth.tsx src/lib/useIngestionRuns.ts`
Expected: no output (clean).

- [ ] **Step 3: Manual check against a running stack** (skip and say so in the report if no MongoDB / admin account is available)

Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`), sign in as an admin and open `/admin/scraper`. Check: a third card "ตรวจสถานะการจัดซื้อ (Lifecycle)" shows "พร้อมตรวจ N รายการ"; pressing "รันตอนนี้" shows a progress bar that advances; after it finishes the card shows the outcome summary (`checked …, changed …`) and the run appears in the history list; `GET /api/tors/<id>` for one checked TOR now includes `procurement`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/ScraperHealth.tsx
git commit -m "feat(frontend): add the lifecycle refresh card to the scraper status page"
```

---

## After this plan

Open a PR into `main` from `feat/tor-procurement-refresh` (stacked on `feat/tor-procurement-stage` until it merges; rebase after). Then write the step-3 plan (API computed status + stage filter + UI for all stages) against: `Tor.procurement` populated for existing TORs by this job, `IngestionPhase "lifecycle"`, and the open spec item about a winner dated after the latest cancellation, which must be settled first.
