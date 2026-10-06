# gprocurement Lifecycle Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lifecycle refresh decide stage and read the real bid deadline from the national e-GP (`process5.gprocurement.go.th`) instead of the stale BMA portal, with the BMA path kept as fallback.

**Architecture:** A new polite `GprocClient` (four ungated endpoints keyed by `projectCode`) feeds a pure mapper that turns its payloads into the existing `IProcurement` shape. `refreshLifecycle` tries process5 first per TOR and falls back to the existing egp2 path on `null`/error. The deadline step is generalised to take a PDF loader so the invitation PDF can come from process5 (`infoProcureDocAnnounZip` → `view-pdf` POST → base64). Everything else (guarded writer, once-per-invitation rule, month-only re-check, admin override, caps) is unchanged.

**Tech Stack:** Express 5, Mongoose 9, TypeScript, Jest + mongodb-memory-server, Node `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-06-gprocurement-lifecycle-source-design.md`

## Global Constraints

- All process5 calls are read-only and key on `Tor.projectCode` (11 digits). Base URL default `https://process5.gprocurement.go.th`.
- `GET …/getProjectDetail?projectId=`, `GET …/greenBook?mode=LINK&methodId=&tempProjectId=&pageAnnounceType=`, `GET …/infoProcureDocAnnounZip?projectId=`, **`POST`** `…/view-pdf?templateId=<buildName2>` (GET returns 405). The PDF comes from `view-pdf`, never from the zip bundle.
- Gemini keeps reading the PDF (form values are extracted out of reading order; a text regex must not be used).
- Announcement id for process5: `gproc-<announceType>-<YYYYMMDD Bangkok day>` (**no `:`** so it is a safe file name in a blob key).
- `D0` → invitation (`hasFile: true`), `W0` → winner, `B0` → bidding-draft, `price` → reference-price, `BOQ` ignored, any other code → `unknown` (never decides the stage). `projectStatus === "R"` forces `cancelled`.
- The refresh must keep the stored `contractStatus` when it writes a process5 result (a write with `contractStatus` undefined would `$unset` it).
- Fallback: any process5 `null`/error → the existing egp2 path, unchanged. `GPROC_ENABLED=false` turns process5 off. Tests must never touch the network (`jest.setup.js` sets `GPROC_ENABLED=false`; tests inject fake clients).
- Politeness: one request at a time, `GPROC_DELAY_MS` (500) after each successful call, `GPROC_TIMEOUT_MS` (30000), `GPROC_MAX_RETRIES` (3; retry only 429/5xx/network, never other 4xx), User-Agent from `EGP_USER_AGENT`.
- Conventional Commits, **no `Co-Authored-By` trailer**. Never push; never touch the user's uncommitted `backend/TORChecker/*.yml`, `.claude/`, `SRS_TOR.md` (stage files by explicit path).
- Backend verification: `npm run typecheck` does not cover tests; run the touched jest files and the full `npm test` once per task.

## Review Focus

- process5 unreachable, 403 (Cloudflare) or HTML/JSON-less body → the TOR is refreshed through egp2, never failed (Task 4 test).
- Project with no `D0`, or with a `D0` but no bundle from `infoProcureDocAnnounZip` → no crash; treated as "invitation without a file" (stale AI deadline cleared, nothing read) (Tasks 1, 3).
- A process5 write must not wipe `contractStatus` or the stored `bidDeadline`/`deadlineAttempt` (Task 4 test).
- Announcement ids contain no `:` (Windows-safe storage key) (Task 2 test).
- After the source switch every candidate's latest invitation id changes, so each is re-read once from process5; that is bounded by `MAX_DEADLINE_EXTRACTIONS_PER_RUN` and must not wipe the existing deadline before the new read succeeds (Task 4 test).
- The suite never calls the real network (Task 4 step: `jest.setup.js`).
- The admin can tell, per run, how many TORs process5 answered vs fell back to the BMA portal (project unknown vs error), and for each open TOR which source gave its bid deadline and whether the read worked; with process5 off the summary string is unchanged (Task 4 tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/scraper/gprocClient.types.ts` (create) | `GprocProjectDetail`, `GprocAnnouncement`, `GprocClientLike` |
| `backend/src/scraper/gprocClient.ts` (create) | config from env, `gprocEnabled`, `GprocHttpError`, `GprocClient` |
| `backend/src/ingestion/gprocMap.ts` (create) | pure mapping to `IProcurement` |
| `backend/src/models/Tor.ts`, `models/index.ts` (modify) | `procurement.source` |
| `backend/src/ingestion/procurementWrite.ts` (modify) | write `procurement.source` |
| `backend/src/controllers/torController.ts` (modify) | hide `procurement.source` from public detail |
| `backend/src/ingestion/lifecycle/deadlineStep.ts` (modify) | optional `loadPdf` loader |
| `backend/src/ingestion/lifecycle/loadFresh.ts` (create) | per-TOR "process5 first, egp2 fallback" |
| `backend/src/ingestion/lifecycle/refreshLifecycle.ts` (modify) | use `loadFresh`, pass `loadPdf` |
| `backend/src/ingestion/lifecycle/candidates.ts` (modify) | reach rule: listing URL **or** 11-digit `projectCode` when process5 is on |
| `backend/jest.config.js`, `backend/jest.setup.js` (modify/create) | no network in tests |
| `backend/.env.example`, `docs/deployment/gcp.md`, `CLAUDE.md`, the spec (modify) | config + docs |

---

### Task 1: `GprocClient`

**Files:**
- Create: `backend/src/scraper/gprocClient.types.ts`, `backend/src/scraper/gprocClient.ts`
- Test: `backend/src/scraper/__tests__/gprocClient.test.ts`

**Interfaces:**
- Produces (all in the files above):
  - `interface GprocProjectDetail { projectId: string; projectStatus: string | null; announceType: string | null; methodId: string | null; stepId: string | null }`
  - `interface GprocAnnouncement { announceType: string; announceDate: string | null; announceFlag: string | null }`
  - `interface GprocClientLike { projectDetail(projectId: string): Promise<GprocProjectDetail | null>; announcements(projectId: string, detail: GprocProjectDetail): Promise<GprocAnnouncement[]>; invitationPdf(projectId: string): Promise<Buffer | null> }`
  - `gprocEnabled(env?: NodeJS.ProcessEnv): boolean`, `gprocConfigFromEnv(env?): GprocConfig`, `class GprocHttpError`, `class GprocClient implements GprocClientLike`.

- [ ] **Step 1: Write the failing tests** — `backend/src/scraper/__tests__/gprocClient.test.ts`

```ts
import {
  GprocClient,
  GprocHttpError,
  gprocConfigFromEnv,
  gprocEnabled,
  type GprocConfig,
} from "../gprocClient";

type Call = { url: string; method: string };

function harness(handler: (url: URL, method: string, n: number) => { status?: number; body?: unknown; text?: string }) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const cfg: GprocConfig = {
    baseUrl: "https://gp.test",
    userAgent: "test-agent",
    delayMs: 500,
    timeoutMs: 1000,
    maxRetries: 3,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchFn: (async (input: unknown, init?: { method?: string }) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push({ url: url.toString(), method });
      const r = handler(url, method, calls.length);
      const status = r.status ?? 200;
      return new Response(r.text ?? JSON.stringify(r.body ?? {}), { status });
    }) as unknown as typeof fetch,
  };
  return { client: new GprocClient(cfg), calls, sleeps };
}

const DETAIL = { data: { projectId: "69099318020", projectStatus: "A", announceType: "W0", methodId: "16", stepId: "W03", extra: 1 } };
const GREEN = {
  data: {
    greenBookAnnouncementTypeLinkDto: [
      { announceType: "D0", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: "A" },
      { announceType: "BOQ", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: null },
      { announceType: "W0", announceDate: "2026-10-05T17:00:00.000Z", announceFlag: "A" },
      { announceDate: "2026-10-05T17:00:00.000Z" }, // no type: dropped
    ],
  },
};

describe("gprocEnabled / gprocConfigFromEnv", () => {
  it("is on by default and off for false/0/off/no", () => {
    expect(gprocEnabled({})).toBe(true);
    for (const v of ["false", "0", "off", "NO", " False "]) expect(gprocEnabled({ GPROC_ENABLED: v })).toBe(false);
    expect(gprocEnabled({ GPROC_ENABLED: "true" })).toBe(true);
  });
  it("has polite defaults and trims a trailing slash", () => {
    const c = gprocConfigFromEnv({ GPROC_BASE_URL: "https://x.test/" });
    expect(c).toMatchObject({ baseUrl: "https://x.test", delayMs: 500, timeoutMs: 30000, maxRetries: 3 });
    expect(c.userAgent).toContain("BkkTorAggregator");
  });
});

describe("GprocClient.projectDetail", () => {
  it("returns the fields we use", async () => {
    const { client, calls } = harness(() => ({ body: DETAIL }));
    await expect(client.projectDetail("69099318020")).resolves.toEqual({
      projectId: "69099318020",
      projectStatus: "A",
      announceType: "W0",
      methodId: "16",
      stepId: "W03",
    });
    expect(calls[0]!.url).toBe(
      "https://gp.test/egp-oann10-service/pb/a-egp-allt-project/announcement/getProjectDetail?projectId=69099318020"
    );
    expect(calls[0]!.method).toBe("GET");
  });
  it("returns null when e-GP has no such project", async () => {
    const { client } = harness(() => ({ body: { data: null } }));
    await expect(client.projectDetail("69000000000")).resolves.toBeNull();
  });
  it("pauses delayMs after a successful call", async () => {
    const { client, sleeps } = harness(() => ({ body: DETAIL }));
    await client.projectDetail("69099318020");
    expect(sleeps).toEqual([500]);
  });
});

describe("GprocClient.announcements", () => {
  const detail = { projectId: "69099318020", projectStatus: "A", announceType: "W0", methodId: "16", stepId: "W03" };
  it("lists the announcements with the project's own announceType and methodId", async () => {
    const { client, calls } = harness(() => ({ body: GREEN }));
    const rows = await client.announcements("69099318020", detail);
    expect(rows.map((r) => r.announceType)).toEqual(["D0", "BOQ", "W0"]);
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/egp-oann10-service/pb/a-egp-allt-project/announcement/greenBook");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      mode: "LINK",
      methodId: "16",
      tempProjectId: "69099318020",
      pageAnnounceType: "W0",
    });
  });
  it("returns [] without a request when the detail has no announceType or methodId", async () => {
    const { client, calls } = harness(() => ({ body: GREEN }));
    expect(await client.announcements("1", { ...detail, announceType: null })).toEqual([]);
    expect(await client.announcements("1", { ...detail, methodId: null })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it("tolerates a null list", async () => {
    const { client } = harness(() => ({ body: { data: { greenBookAnnouncementTypeLinkDto: null } } }));
    expect(await client.announcements("1", detail)).toEqual([]);
  });
});

describe("GprocClient.invitationPdf", () => {
  const pdfB64 = Buffer.from("%PDF-1.7 fake").toString("base64");
  it("looks up the template id, then POSTs view-pdf and decodes the base64 PDF", async () => {
    const { client, calls } = harness((url, method) =>
      url.pathname.endsWith("/infoProcureDocAnnounZip")
        ? { body: { response: { responseCode: "0" }, data: { buildName2: "tpl-1", buildName1: "x.zip" } } }
        : method === "POST"
          ? { body: { response: { responseCode: "0" }, data: pdfB64 } }
          : { status: 405 }
    );
    const buf = await client.invitationPdf("69109010419");
    expect(buf?.toString("latin1")).toBe("%PDF-1.7 fake");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls[1]!.url).toBe("https://gp.test/egp-template-service/dant/view-pdf?templateId=tpl-1");
  });
  it("returns null when the project has no bundle", async () => {
    const { client, calls } = harness(() => ({ body: { response: { responseCode: "1" }, data: null } }));
    expect(await client.invitationPdf("69109010419")).toBeNull();
    expect(calls).toHaveLength(1);
  });
  it("returns null when view-pdf gives no data or something that is not a PDF", async () => {
    const mk = (data: string | null) =>
      harness((url) => (url.pathname.endsWith("/infoProcureDocAnnounZip") ? { body: { data: { buildName2: "t" } } } : { body: { data } }));
    expect(await mk(null).client.invitationPdf("1")).toBeNull();
    expect(await mk(Buffer.from("<html>").toString("base64")).client.invitationPdf("1")).toBeNull();
  });
});

describe("GprocClient retries", () => {
  it("retries a 503 with backoff and then succeeds", async () => {
    const { client, calls, sleeps } = harness((_u, _m, n) => (n < 3 ? { status: 503 } : { body: DETAIL }));
    await expect(client.projectDetail("69099318020")).resolves.not.toBeNull();
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000, 500]);
  });
  it("does not retry a 403 (Cloudflare) and throws a GprocHttpError", async () => {
    const { client, calls } = harness(() => ({ status: 403, text: "blocked" }));
    await expect(client.projectDetail("69099318020")).rejects.toBeInstanceOf(GprocHttpError);
    expect(calls).toHaveLength(1);
  });
  it("retries a non-JSON 200 body, then throws", async () => {
    const { client, calls } = harness(() => ({ text: "<html>challenge</html>" }));
    await expect(client.projectDetail("69099318020")).rejects.toThrow();
    expect(calls).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest src/scraper/__tests__/gprocClient.test.ts --runInBand`
Expected: FAIL — cannot find module `../gprocClient`.

- [ ] **Step 3: Implement** — `backend/src/scraper/gprocClient.types.ts`

```ts
/** What we read from process5's `getProjectDetail` (everything else is ignored). */
export interface GprocProjectDetail {
  projectId: string;
  /** "A" active, "R" cancelled. */
  projectStatus: string | null;
  /** The current announcement type of the project, e.g. "B0" draft tender doc, "D0" invitation, "W0" winner. */
  announceType: string | null;
  methodId: string | null;
  stepId: string | null;
}

/** One row of the "ดูข้อมูล" announcement list (`greenBook`). */
export interface GprocAnnouncement {
  announceType: string;
  /** ISO instant, e.g. "2026-10-05T17:00:00.000Z" (= 6 Oct in Bangkok). */
  announceDate: string | null;
  announceFlag: string | null;
}

export interface GprocClientLike {
  /** Null when e-GP has no such project. */
  projectDetail(projectId: string): Promise<GprocProjectDetail | null>;
  announcements(projectId: string, detail: GprocProjectDetail): Promise<GprocAnnouncement[]>;
  /** The signed invitation PDF, or null when the project has none (yet). */
  invitationPdf(projectId: string): Promise<Buffer | null>;
}
```

`backend/src/scraper/gprocClient.ts`:

```ts
import type { GprocAnnouncement, GprocClientLike, GprocProjectDetail } from "./gprocClient.types";

export type { GprocAnnouncement, GprocClientLike, GprocProjectDetail } from "./gprocClient.types";

export interface GprocConfig {
  baseUrl: string;
  userAgent: string;
  delayMs: number;
  timeoutMs: number;
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
  fetchFn?: typeof fetch;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `GPROC_ENABLED` turns the process5 source off with false/0/off/no (default on). */
export function gprocEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.GPROC_ENABLED ?? "true").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(v);
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function gprocConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GprocConfig {
  return {
    baseUrl: (env.GPROC_BASE_URL ?? "https://process5.gprocurement.go.th").replace(/\/$/, ""),
    userAgent: env.EGP_USER_AGENT ?? "BkkTorAggregator/0.1 (Kasetsart University project)",
    delayMs: num(env.GPROC_DELAY_MS, 500),
    timeoutMs: num(env.GPROC_TIMEOUT_MS, 30_000),
    maxRetries: Math.max(1, num(env.GPROC_MAX_RETRIES, 3)),
  };
}

export class GprocHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GprocHttpError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

const ANNOUNCEMENT = "/egp-oann10-service/pb/a-egp-allt-project/announcement";

interface Envelope<T> {
  data?: T | null;
}

/**
 * Polite read-only client over the national e-GP (process5) per-project endpoints. None of these
 * is behind the Cloudflare check (the project SEARCH is, and is deliberately not used here).
 */
export class GprocClient implements GprocClientLike {
  constructor(private readonly cfg: GprocConfig) {}

  private async call<T>(method: "GET" | "POST", path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${this.cfg.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const fetchFn = this.cfg.fetchFn ?? fetch;
    const sleep = this.cfg.sleep ?? wait;
    let lastError: unknown;
    for (let attempt = 0; attempt < this.cfg.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetchFn(url.toString(), {
          method,
          signal: controller.signal,
          headers: {
            "User-Agent": this.cfg.userAgent,
            Accept: "application/json",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          },
        });
        if (!res.ok) throw new GprocHttpError(res.status, `gprocurement ${res.status} for ${method} ${path}`);
        const body = (await res.json()) as T;
        await sleep(this.cfg.delayMs); // politeness: pause after every successful call
        return body;
      } catch (err) {
        lastError = err;
        if (err instanceof GprocHttpError && !err.retryable) throw err;
        if (attempt === this.cfg.maxRetries - 1) break;
        await sleep(2 ** attempt * 1000);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async projectDetail(projectId: string): Promise<GprocProjectDetail | null> {
    const body = await this.call<Envelope<Partial<GprocProjectDetail>>>("GET", `${ANNOUNCEMENT}/getProjectDetail`, {
      projectId,
    });
    const d = body.data;
    if (!d || !d.projectId) return null;
    return {
      projectId: String(d.projectId),
      projectStatus: d.projectStatus ?? null,
      announceType: d.announceType ?? null,
      methodId: d.methodId ?? null,
      stepId: d.stepId ?? null,
    };
  }

  async announcements(projectId: string, detail: GprocProjectDetail): Promise<GprocAnnouncement[]> {
    if (!detail.announceType || !detail.methodId) return [];
    const body = await this.call<Envelope<{ greenBookAnnouncementTypeLinkDto?: Partial<GprocAnnouncement>[] | null }>>(
      "GET",
      `${ANNOUNCEMENT}/greenBook`,
      { mode: "LINK", methodId: detail.methodId, tempProjectId: projectId, pageAnnounceType: detail.announceType }
    );
    return (body.data?.greenBookAnnouncementTypeLinkDto ?? [])
      .filter((r): r is Partial<GprocAnnouncement> & { announceType: string } => typeof r?.announceType === "string")
      .map((r) => ({
        announceType: r.announceType,
        announceDate: r.announceDate ?? null,
        announceFlag: r.announceFlag ?? null,
      }));
  }

  async invitationPdf(projectId: string): Promise<Buffer | null> {
    const info = await this.call<Envelope<{ buildName2?: string | null }>>(
      "GET",
      "/egp-approval-service/apv-common/infoProcureDocAnnounZip",
      { projectId }
    );
    const templateId = info.data?.buildName2;
    if (!templateId) return null;
    // view-pdf only answers POST; the template id travels in the query string, the body is empty.
    const pdf = await this.call<Envelope<string>>("POST", "/egp-template-service/dant/view-pdf", { templateId });
    if (!pdf.data) return null;
    const buf = Buffer.from(pdf.data, "base64");
    return buf.length > 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-" ? buf : null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest src/scraper/__tests__/gprocClient.test.ts --runInBand && npm run typecheck`
Expected: PASS (13 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scraper/gprocClient.ts backend/src/scraper/gprocClient.types.ts backend/src/scraper/__tests__/gprocClient.test.ts
git commit -m "feat(backend): add a polite client for the gprocurement per-project endpoints"
```

---

### Task 2: Mapper, `procurement.source`, writer and exposure

**Files:**
- Create: `backend/src/ingestion/gprocMap.ts`, `backend/src/ingestion/__tests__/gprocMap.test.ts`
- Modify: `backend/src/models/Tor.ts` (types ~line 70-85, procurement schema), `backend/src/models/index.ts:30`, `backend/src/ingestion/procurementWrite.ts`, `backend/src/controllers/torController.ts:246`
- Test: `backend/src/ingestion/__tests__/procurementWrite.test.ts`, `backend/src/__tests__/torProcurementExposure.test.ts`

**Interfaces:**
- Consumes (Task 1): `GprocProjectDetail`, `GprocAnnouncement`.
- Produces:
  - `type ProcurementSource = "egp2" | "gproc"`; `IProcurement.source?: ProcurementSource`.
  - `buildGprocProcurement(input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[] }, contractStatus: string | undefined, now: Date): { procurement: IProcurement; unknownCodes: string[] }`
  - `gprocAnnouncementId(code: string, announceDate: string | null): string`

- [ ] **Step 1: Failing tests** — `backend/src/ingestion/__tests__/gprocMap.test.ts`

```ts
import { buildGprocProcurement, gprocAnnouncementId } from "../gprocMap";

const NOW = new Date("2026-10-06T00:00:00Z");
const detail = (over: Record<string, unknown> = {}) => ({
  projectId: "69099318020",
  projectStatus: "A",
  announceType: "W0",
  methodId: "16",
  stepId: "W03",
  ...over,
});
const row = (announceType: string, announceDate: string | null, announceFlag: string | null = "A") => ({
  announceType,
  announceDate,
  announceFlag,
});

// Recorded from the real service on 2026-10-06 (project 69099318020, already awarded).
const AWARDED = [
  row("D0", "2026-09-22T17:00:00.000Z"),
  row("BOQ", "2026-09-22T17:00:00.000Z", null),
  row("price", "2026-09-30T17:00:00.000Z", null),
  row("W0", "2026-10-05T17:00:00.000Z"),
];
// Project 69099312832: draft tender doc on 23 Sep, the real invitation on 1 Oct.
const INVITING = [row("B0", "2026-09-22T17:00:00.000Z"), row("BOQ", "2026-09-22T17:00:00.000Z", null), row("D0", "2026-09-30T17:00:00.000Z")];

describe("gprocAnnouncementId", () => {
  it("uses the Bangkok day and no colon", () => {
    expect(gprocAnnouncementId("D0", "2026-09-22T17:00:00.000Z")).toBe("gproc-D0-20260923");
    expect(gprocAnnouncementId("D0", "2026-09-22T17:00:00.000Z")).not.toContain(":");
    expect(gprocAnnouncementId("D0", null)).toBe("gproc-D0-undated");
    expect(gprocAnnouncementId("D0", "not a date")).toBe("gproc-D0-undated");
  });
});

describe("buildGprocProcurement", () => {
  it("maps an awarded project: invitation, reference price and winner, oldest first, stage awarded", () => {
    const { procurement: p, unknownCodes } = buildGprocProcurement({ detail: detail(), announcements: AWARDED }, "ระหว่างดำเนินการ", NOW);
    expect(p.stage).toBe("awarded");
    expect(p.source).toBe("gproc");
    expect(p.contractStatus).toBe("ระหว่างดำเนินการ");
    expect(p.lastCheckedAt).toEqual(NOW);
    expect(p.announcements.map((a) => [a.announcementId, a.kind, a.hasFile])).toEqual([
      ["gproc-D0-20260923", "invitation", true],
      ["gproc-price-20261001", "reference-price", false],
      ["gproc-W0-20261006", "winner", false],
    ]);
    expect(p.announcements[0]!.publishedAt).toEqual(new Date("2026-09-22T17:00:00.000Z"));
    expect(unknownCodes).toEqual([]);
  });

  it("maps an inviting project (draft doc then invitation) to stage inviting", () => {
    const { procurement: p } = buildGprocProcurement({ detail: detail({ announceType: "B0", stepId: "M03" }), announcements: INVITING }, undefined, NOW);
    expect(p.stage).toBe("inviting");
    expect(p.contractStatus).toBeUndefined();
    expect(p.announcements.map((a) => a.kind)).toEqual(["bidding-draft", "invitation"]);
  });

  it("maps a project that only has the draft tender doc to stage draft", () => {
    const { procurement: p } = buildGprocProcurement({ detail: detail({ announceType: "B0" }), announcements: [INVITING[0]!, INVITING[1]!] }, undefined, NOW);
    expect(p.stage).toBe("draft");
  });

  it("forces cancelled when e-GP's projectStatus is R, even with an invitation", () => {
    const { procurement: p } = buildGprocProcurement({ detail: detail({ projectStatus: "R" }), announcements: INVITING }, undefined, NOW);
    expect(p.stage).toBe("cancelled");
  });

  it("never lets an unknown code decide the stage, and reports it once", () => {
    const { procurement: p, unknownCodes } = buildGprocProcurement(
      { detail: detail({ announceType: "B0" }), announcements: [INVITING[0]!, row("X9", "2026-10-01T00:00:00.000Z"), row("X9", "2026-10-02T00:00:00.000Z")] },
      undefined,
      NOW
    );
    expect(p.stage).toBe("draft");
    expect(p.announcements.map((a) => a.kind)).toEqual(["bidding-draft", "unknown", "unknown"]);
    expect(unknownCodes).toEqual(["X9"]);
  });

  it("tolerates an empty list and a row without a date (sorted first)", () => {
    expect(buildGprocProcurement({ detail: detail(), announcements: [] }, undefined, NOW).procurement.stage).toBe("draft");
    const { procurement: p } = buildGprocProcurement({ detail: detail(), announcements: [row("D0", "2026-09-22T17:00:00.000Z"), row("B0", null)] }, undefined, NOW);
    expect(p.announcements.map((a) => a.announcementId)).toEqual(["gproc-B0-undated", "gproc-D0-20260923"]);
  });
});
```

Add to `procurementWrite.test.ts` (inside its `describe`, use that file's `procurement()` helper):

```ts
  it("stores procurement.source when the merged value has one, and leaves it alone otherwise", async () => {
    const tor = await Tor.create({ title: "a", procurement: procurement({ source: "egp2" }) });
    await writeProcurementIfUnchanged(tor._id, procurement({ source: "egp2" }), procurement({ source: "gproc", lastCheckedAt: T2 }));
    expect((await Tor.findById(tor._id).lean())?.procurement?.source).toBe("gproc");
    await writeProcurementIfUnchanged(tor._id, procurement({ source: "gproc", lastCheckedAt: T2 }), procurement({ lastCheckedAt: new Date("2026-10-03T00:00:00Z") }));
    expect((await Tor.findById(tor._id).lean())?.procurement?.source).toBe("gproc");
  });
```

In `torProcurementExposure.test.ts` extend the existing seed with `source: "gproc"` inside `procurement` and add `expect(res.body.tor.procurement).not.toHaveProperty("source");`.

Run: `npx jest src/ingestion/__tests__/gprocMap.test.ts src/ingestion/__tests__/procurementWrite.test.ts src/__tests__/torProcurementExposure.test.ts --runInBand` → FAIL.

- [ ] **Step 2: Model** — in `backend/src/models/Tor.ts` add next to `ProcurementStage`:

```ts
/** Which e-GP source produced the last stage write (absent = the BMA portal, egp2). Internal. */
export type ProcurementSource = "egp2" | "gproc";
```

Add `source?: ProcurementSource;` to `IProcurement`, and in the procurement sub-schema add `source: { type: String, enum: ["egp2", "gproc"] },`. In `models/index.ts` add `ProcurementSource` to the `export type { … } from "./Tor"` list.

- [ ] **Step 3: Writer** — in `procurementWrite.ts`, in the existing-procurement branch after the `lastCheckedAt` line of `$set` add:

```ts
  if (merged.source) $set["procurement.source"] = merged.source;
```

(the first-fill branch already sets the whole object).

- [ ] **Step 4: Hide it** — in `torController.ts:246` append ` -procurement.source` to the exclusion string (the line already ends with `-procurement.deadlineAttempt`).

- [ ] **Step 5: Mapper** — `backend/src/ingestion/gprocMap.ts`

```ts
import type { AnnouncementKind, IProcurement, IProcurementAnnouncement } from "../models/Tor";
import type { GprocAnnouncement, GprocProjectDetail } from "../scraper/gprocClient.types";
import { bangkokDay } from "../utils/bidDeadline";
import { deriveStage } from "./procurementStage";

const BY_CODE: Record<string, { kind: AnnouncementKind; label: string; hasFile: boolean }> = {
  B0: { kind: "bidding-draft", label: "ร่างเอกสารประกวดราคา", hasFile: false },
  D0: { kind: "invitation", label: "ประกาศเชิญชวน", hasFile: true },
  W0: { kind: "winner", label: "ประกาศผู้ชนะ", hasFile: false },
  price: { kind: "reference-price", label: "ประกาศราคากลาง", hasFile: false },
};
/** Rows that are attachments, not announcements. */
const IGNORED = new Set(["BOQ"]);

/** `gproc-D0-20260923`: stable per code + Bangkok day, and free of characters that break a file name. */
export function gprocAnnouncementId(code: string, announceDate: string | null): string {
  const t = announceDate ? Date.parse(announceDate) : NaN;
  const day = Number.isNaN(t) ? "undated" : bangkokDay(new Date(t)).replace(/-/g, "");
  return `gproc-${code}-${day}`;
}

const timeOf = (a: IProcurementAnnouncement): number => a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

/**
 * Pure transform: the national e-GP's project detail + announcement list → a fresh `procurement`.
 * `contractStatus` is passed through (process5's calls here do not expose it), so the caller
 * hands over the stored value. Stage rules are the shared ones; `projectStatus "R"` means cancelled.
 */
export function buildGprocProcurement(
  input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[] },
  contractStatus: string | undefined,
  now: Date
): { procurement: IProcurement; unknownCodes: string[] } {
  const unknownCodes: string[] = [];
  const items: IProcurementAnnouncement[] = [];
  for (const a of input.announcements) {
    if (IGNORED.has(a.announceType)) continue;
    const known = BY_CODE[a.announceType];
    if (!known && !unknownCodes.includes(a.announceType)) unknownCodes.push(a.announceType);
    const t = a.announceDate ? Date.parse(a.announceDate) : NaN;
    items.push({
      announcementId: gprocAnnouncementId(a.announceType, a.announceDate),
      typeName: known?.label ?? a.announceType,
      kind: known?.kind ?? "unknown",
      publishedAt: Number.isNaN(t) ? undefined : new Date(t),
      hasFile: known?.hasFile ?? false,
    });
  }
  items.sort((x, y) => (timeOf(x) === timeOf(y) ? 0 : timeOf(x) < timeOf(y) ? -1 : 1)); // stable: ties keep e-GP order

  const stage = input.detail.projectStatus === "R" ? "cancelled" : deriveStage(items, contractStatus);
  return {
    procurement: {
      stage,
      contractStatus: contractStatus?.trim() || undefined,
      announcements: items,
      lastCheckedAt: now,
      source: "gproc",
    },
    unknownCodes,
  };
}
```

- [ ] **Step 6: Run and commit**

Run: `cd backend && npx jest src/ingestion/__tests__/gprocMap.test.ts src/ingestion/__tests__/procurementWrite.test.ts src/__tests__/torProcurementExposure.test.ts --runInBand && npm run typecheck` → PASS.

```bash
git add backend/src/ingestion/gprocMap.ts backend/src/ingestion/__tests__/gprocMap.test.ts backend/src/ingestion/__tests__/procurementWrite.test.ts backend/src/__tests__/torProcurementExposure.test.ts backend/src/models backend/src/ingestion/procurementWrite.ts backend/src/controllers/torController.ts
git commit -m "feat(backend): map gprocurement announcements to the procurement stage"
```

---

### Task 3: Deadline step takes a PDF loader

**Files:**
- Modify: `backend/src/ingestion/lifecycle/deadlineStep.ts` (args at lines 10-18; file lookup/download at lines 91-114; extractor call at ~line 119)
- Test: `backend/src/ingestion/lifecycle/__tests__/deadlineStep.test.ts`

**Interfaces:**
- Produces:
  - `interface LoadedInvitationPdf { content: Buffer; fileName: string }`
  - `DeadlineStepArgs.filenames` becomes optional; new optional `DeadlineStepArgs.loadPdf?: (invitation: IProcurementAnnouncement) => Promise<LoadedInvitationPdf | null>`. When `loadPdf` is given it replaces the egp2 download; `null` means "no readable file (yet)".

- [ ] **Step 1: Failing tests** — append to `deadlineStep.test.ts` (reuses the file's `seed`, `harness`, `T`, `PUBLISHED`, `READ`, `NOT_READ`, `procurementOf`; read their definitions first and keep names):

```ts
describe("runDeadlineStep with a PDF loader (process5)", () => {
  const GPROC_ID = "gproc-D0-20261005";
  const gprocProcurement = (over: Partial<IProcurement> = {}): IProcurement =>
    procurementOf({
      announcements: [{ announcementId: GPROC_ID, kind: "invitation", hasFile: true, publishedAt: PUBLISHED, storageKey: null }],
      ...over,
    });
  const loaded = { content: Buffer.from("%PDF-1.7 gproc"), fileName: "69099318020-invitation.pdf" };

  it("reads the PDF given by the loader, never calls the egp2 download, and stores a colon-free key", async () => {
    const p = gprocProcurement();
    const tor = await seed(p);
    const h = harness();
    const out = await runDeadlineStep({ ...args(p, tor._id), filenames: undefined, loadPdf: async () => loaded }, h);
    expect(out).toBe("read");
    expect(h.downloads).toEqual([]);
    expect(h.puts).toEqual([`tor-pdfs/code-1/${GPROC_ID}.pdf`]);
    const saved = (await Tor.findById(tor._id).lean())?.procurement;
    expect(saved?.deadlineAttempt?.announcementId).toBe(GPROC_ID);
    expect(saved?.bidDeadline?.source).toBe("invitation-pdf");
  });

  it("clears a stale AI deadline and reads nothing when the loader has no PDF", async () => {
    const stale = { date: new Date("2026-10-10T16:59:00Z"), source: "invitation-pdf" as const, extractedAt: PUBLISHED };
    const p = gprocProcurement({ bidDeadline: stale, deadlineAttempt: { announcementId: "old-egp2-id", at: PUBLISHED, outcome: "read" } });
    const tor = await seed(p);
    const h = harness();
    const out = await runDeadlineStep({ ...args(p, tor._id), loadPdf: async () => null }, h);
    expect(out).toBe("cleared");
    expect(h.extractCalls).toHaveLength(0);
    expect(((await Tor.findById(tor._id).lean())?.procurement?.bidDeadline ?? null)).toBeNull();
  });

  it("does not call the loader for an invitation flagged without a file", async () => {
    const p = procurementOf({
      announcements: [{ announcementId: GPROC_ID, kind: "invitation", hasFile: false, publishedAt: PUBLISHED, storageKey: null }],
    });
    const tor = await seed(p);
    const loadPdf = jest.fn();
    expect(await runDeadlineStep({ ...args(p, tor._id), loadPdf }, harness())).toBe("skipped");
    expect(loadPdf).not.toHaveBeenCalled();
  });

  it("re-checks a month-only deadline through the loader by file hash: unchanged skips Gemini", async () => {
    const sha = require("node:crypto").createHash("sha256").update(loaded.content).digest("hex");
    const p = gprocProcurement({
      bidDeadline: { date: new Date("2026-10-31T16:59:00Z"), source: "invitation-pdf", precision: "month", extractedAt: PUBLISHED },
      deadlineAttempt: { announcementId: GPROC_ID, at: PUBLISHED, outcome: "read", fileSha256: sha },
    });
    const tor = await seed(p);
    const h = harness();
    expect(await runDeadlineStep({ ...args(p, tor._id), loadPdf: async () => loaded }, h)).toBe("skipped");
    expect(h.extractCalls).toHaveLength(0);
  });
});
```

Run: `npx jest src/ingestion/lifecycle/__tests__/deadlineStep.test.ts --runInBand` → FAIL (type error: `loadPdf` unknown).

- [ ] **Step 2: Implement** — in `deadlineStep.ts`:

Add above `DeadlineStepArgs`:

```ts
export interface LoadedInvitationPdf {
  content: Buffer;
  fileName: string;
}
```

In `DeadlineStepArgs` change `filenames` and add `loadPdf`:

```ts
  /** announcementId → e-GP (egp2) file name; used when `loadPdf` is not given. */
  filenames?: ReadonlyMap<string, string>;
  /** Source-specific PDF loader (process5). Null = the invitation has no readable file (yet). */
  loadPdf?: (invitation: IProcurementAnnouncement) => Promise<LoadedInvitationPdf | null>;
```

Replace the block from `const filename = invitation.hasFile ? …` through the line `const content = await deps.client.downloadFile(...)` (lines 91-109), keeping the clearing logic verbatim, with:

```ts
  let file: LoadedInvitationPdf | null = null;
  if (invitation.hasFile) {
    if (args.loadPdf) {
      file = await args.loadPdf(invitation);
    } else {
      const filename = args.filenames?.get(invitation.announcementId);
      if (filename) {
        file = { content: await deps.client.downloadFile(invitation.announcementId, filename), fileName: filename };
      }
    }
  }
  if (!file) {
    if (attemptedThis) return "skipped"; // re-check of a month-only deadline: file gone, keep what we have
    // The current invitation has no readable file (yet). A deadline read from an OLDER invitation
    // is stale, so clear it; no attempt is recorded, so the read happens once the file appears.
    if (p.bidDeadline?.source !== "invitation-pdf") return "skipped";
    const res = await Tor.updateOne(
      {
        _id: args.torId,
        "procurement.lastCheckedAt": p.lastCheckedAt,
        "procurement.bidDeadline.source": { $ne: "admin" },
      } as QueryFilter<ITor>,
      { $set: { "procurement.bidDeadline": null, "procurement.lastCheckedAt": deps.now() } },
      { timestamps: false }
    );
    return res.matchedCount === 0 ? "conflict" : "cleared";
  }
  const content = file.content;
```

and in the extractor call replace `pdf: { fileName: filename, content }` with `pdf: { fileName: file.fileName, content }`. Update the doc comment of `runDeadlineStep` with one sentence: "The PDF comes from `args.loadPdf` (process5) or, without it, from the egp2 download."

- [ ] **Step 3: Run and commit**

Run: `cd backend && npx jest src/ingestion/lifecycle --runInBand && npm run typecheck` → PASS (all existing deadline tests unchanged).

```bash
git add backend/src/ingestion/lifecycle/deadlineStep.ts backend/src/ingestion/lifecycle/__tests__/deadlineStep.test.ts
git commit -m "refactor(backend): let the deadline step read the invitation PDF through a loader"
```

---

### Task 4: Refresh uses process5 first, with fallback; candidate rule; config and docs

**Files:**
- Create: `backend/src/ingestion/lifecycle/loadFresh.ts`, `backend/jest.setup.js`
- Modify: `backend/jest.config.js`, `backend/src/ingestion/lifecycle/refreshLifecycle.ts`, `backend/src/ingestion/lifecycle/candidates.ts`, `backend/.env.example`, `docs/deployment/gcp.md`, `CLAUDE.md`, the spec
- Test: `backend/src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts`, `candidates.test.ts`, `backend/src/__tests__/envExample.test.ts`

**Interfaces:**
- Consumes: `GprocClientLike`, `gprocEnabled`, `gprocConfigFromEnv`, `GprocClient` (Task 1); `buildGprocProcurement` (Task 2); `LoadedInvitationPdf`, `DeadlineStepArgs.loadPdf` (Task 3).
- Produces:
  - `type GprocAttempt = "ok" | "not-found" | "error"`
  - `loadFreshProcurement(args: { tor: LoadFreshTor; egp: EgpClientLike; gproc?: GprocClientLike; now: () => Date; warn: (message: string) => Promise<void>; report?: (attempt: GprocAttempt) => void }): Promise<FreshProcurement | "skip">` — `report` is called exactly once per TOR for which process5 was asked (never when `gproc` is absent or the TOR has no 11-digit code).
  - `interface FreshProcurement { fresh: IProcurement; source: "gproc" | "egp2"; filenames?: Map<string, string>; loadPdf?: (inv: IProcurementAnnouncement) => Promise<LoadedInvitationPdf | null> }`
  - `RefreshLifecycleDeps.gprocClient?: GprocClientLike` (default: a real client when `gprocEnabled()`, otherwise none).
  - `lifecycleFilter(opts?: { gproc?: boolean })` (default `gprocEnabled()`).

- [ ] **Step 1: No network in tests** — create `backend/jest.setup.js`:

```js
// Tests must never reach the real gprocurement service; they inject fake clients instead.
process.env.GPROC_ENABLED = "false";
```

and in `backend/jest.config.js` add `setupFiles: ["<rootDir>/jest.setup.js"],` to the exported object.

- [ ] **Step 2: Failing tests**

`candidates.test.ts` — add (use the file's existing `url` helper and `Tor`):

```ts
describe("lifecycleFilter reach rule", () => {
  it("also selects an enriched TOR with an 11-digit projectCode and no listing URL when process5 is on", async () => {
    await Tor.create([
      { title: "no url", projectCode: "69099318020", pipelineStatus: "enriched" },
      { title: "no url bad code", projectCode: "code-x", pipelineStatus: "enriched" },
      { title: "with url", projectCode: "code-y", pipelineStatus: "enriched", sourceListingUrl: url("y") },
    ] as any);
    const on = (await Tor.find(lifecycleFilter({ gproc: true }) as any).sort({ title: 1 }).lean()).map((t) => t.title);
    expect(on).toEqual(["no url", "with url"]);
    const off = (await Tor.find(lifecycleFilter({ gproc: false }) as any).lean()).map((t) => t.title);
    expect(off).toEqual(["with url"]);
  });
});
```

`refreshLifecycle.test.ts` — add imports `import type { GprocClientLike, GprocAnnouncement, GprocProjectDetail } from "../../../scraper/gprocClient.types";` and:

```ts
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
  it("takes the stage from process5 (awarded), tags the source, and does not touch egp2", async () => {
    const tor = await seedCode({ sourceListingUrl: listing("g1"), procurement: { stage: "inviting", contractStatus: "ระหว่างดำเนินการ", announcements: [], lastCheckedAt: new Date("2026-09-01") } });
    const egp = fakeClient();
    const out = await refreshLifecycle(deps(egp, { gprocClient: fakeGproc() }));
    expect(out).toMatchObject({ selected: 1, changed: 1, failed: 0 });
    expect(egp.detailCalls).toEqual([]);
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

    it("a PDF download error is a per-TOR deadline error, not a failed refresh", async () => {
      await seedCode({ sourceListingUrl: listing("g8") });
      const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ rows: invitingRows, pdf: new Error("gprocurement 503") }), deadlineExtractor: extractor([]), storage }));
      expect(out.failed).toBe(0);
      expect((await IngestionRun.findById(out.runId).lean())?.outcomeSummary).toContain("errors 1");
    });
  });
});
```

(`BlobStorage` is already imported in the file from the earlier deadline tests; if not, add `import type { BlobStorage } from "../../../storage/storage.types";`. `maxDeadlineExtractions: 0` relies on `??` — `0` is a valid cap, so the step is skipped.)

Add to `envExample.test.ts` a new `it.each` over `["GPROC_ENABLED", "GPROC_BASE_URL", "GPROC_DELAY_MS", "GPROC_TIMEOUT_MS", "GPROC_MAX_RETRIES"]` with the same regex as the neighbouring tests.

Run: `npx jest src/ingestion/lifecycle src/__tests__/envExample.test.ts --runInBand` → FAIL.

- [ ] **Step 3: Candidate rule** — in `candidates.ts` add `import { gprocEnabled } from "../../scraper/gprocClient";` and replace `lifecycleFilter()`:

```ts
export function lifecycleFilter(opts: { gproc?: boolean } = {}): QueryFilter<ITor> {
  const useGproc = opts.gproc ?? gprocEnabled();
  // process5 needs only the 11-digit project number, so a TOR without a listing URL is reachable too.
  const reachable: QueryFilter<ITor> = useGproc
    ? {
        $or: [
          { sourceListingUrl: { $type: "string", $ne: "" } },
          { projectCode: { $regex: /^\d{11}$/ } },
        ],
      }
    : { sourceListingUrl: { $type: "string", $ne: "" } };
  return {
    pipelineStatus: "enriched",
    $and: [
      reachable,
      {
        $or: [
          {
            "procurement.stage": { $ne: "cancelled" },
            "procurement.contractStatus": { $nin: FINISHED_CONTRACT_STATUSES },
          },
          // A month-only AI deadline is re-checked until a day is known (or an admin sets one).
          { "procurement.bidDeadline.precision": "month", "procurement.bidDeadline.source": "invitation-pdf" },
          {
            "procurement.deadlineAttempt": null,
            "procurement.announcements": { $elemMatch: { kind: "invitation", hasFile: true } },
          },
        ],
      },
    ],
  };
}
```

Update the doc comment: "reachable = has a listing URL, or (process5 on) an 11-digit project code". `refreshLifecycle` already combines this filter with `{ _id: { $in } }` via `$and`, which stays valid.

- [ ] **Step 4: `loadFresh`** — create `backend/src/ingestion/lifecycle/loadFresh.ts`:

```ts
import type { IProcurement, IProcurementAnnouncement } from "../../models";
import type { EgpClientLike } from "../../scraper/egpClient.types";
import type { GprocClientLike } from "../../scraper/gprocClient.types";
import { buildGprocProcurement } from "../gprocMap";
import { buildProcurement } from "../procurementStage";
import { projectIdFromListingUrl } from "./candidates";
import type { LoadedInvitationPdf } from "./deadlineStep";

export type GprocAttempt = "ok" | "not-found" | "error";

export interface LoadFreshTor {
  projectCode?: string | null;
  sourceListingUrl?: string | null;
  procurement?: IProcurement | null;
}

export interface FreshProcurement {
  fresh: IProcurement;
  source: "gproc" | "egp2";
  /** egp2: announcementId → file name (the deadline step downloads through the egp2 client). */
  filenames?: Map<string, string>;
  /** process5: loads the signed invitation PDF. */
  loadPdf?: (invitation: IProcurementAnnouncement) => Promise<LoadedInvitationPdf | null>;
}

/**
 * One TOR's fresh `procurement`: the national e-GP (process5) first, the BMA portal (egp2) as the
 * fallback when process5 does not know the project or fails. Returns "skip" when neither can be asked.
 * `warn` receives human-readable notes (a process5 failure, unknown announce codes).
 */
export async function loadFreshProcurement(args: {
  tor: LoadFreshTor;
  egp: EgpClientLike;
  gproc?: GprocClientLike;
  now: () => Date;
  warn: (message: string) => Promise<void>;
  /** Called once when process5 was asked: it answered, did not know the project, or failed. */
  report?: (attempt: GprocAttempt) => void;
}): Promise<FreshProcurement | "skip"> {
  const { tor, egp, gproc, now, warn, report } = args;
  const code = tor.projectCode ?? undefined;

  if (gproc && code && /^\d{11}$/.test(code)) {
    try {
      const detail = await gproc.projectDetail(code);
      if (detail) {
        const rows = await gproc.announcements(code, detail);
        // process5's calls do not expose the contract status: carry the stored one over.
        const { procurement, unknownCodes } = buildGprocProcurement(
          { detail, announcements: rows },
          tor.procurement?.contractStatus,
          now()
        );
        report?.("ok");
        for (const c of unknownCodes) await warn(`TOR ${code}: unknown process5 announce type "${c}" (treated as unknown)`);
        return {
          fresh: procurement,
          source: "gproc",
          loadPdf: async () => {
            const content = await gproc.invitationPdf(code);
            return content ? { content, fileName: `${code}-invitation.pdf` } : null;
          },
        };
      }
      report?.("not-found");
    } catch (err) {
      report?.("error");
      await warn(`TOR ${code}: process5 failed (${(err as Error).message}); using the BMA portal instead`);
    }
  }

  const projectId = projectIdFromListingUrl(tor.sourceListingUrl);
  if (!projectId) return "skip";
  const detail = await egp.projectDetail(projectId);
  const announcements = await egp.announcements(projectId);
  const fresh = buildProcurement(announcements, detail.masterContractAvailableName, now());
  fresh.source = "egp2";
  return {
    fresh,
    source: "egp2",
    filenames: new Map(
      announcements.flatMap((a) => (a.id && a.projectAnnouncementPath ? [[a.id, a.projectAnnouncementPath] as const] : []))
    ),
  };
}
```

- [ ] **Step 5: Wire it into `refreshLifecycle.ts`**

Imports: add `import { GprocClient, gprocConfigFromEnv, gprocEnabled } from "../../scraper/gprocClient"; import type { GprocClientLike } from "../../scraper/gprocClient.types"; import { loadFreshProcurement } from "./loadFresh";` and remove the now-unused `buildProcurement` import and `projectIdFromListingUrl` from the candidates import (`mergeProcurement` stays).

Add to `RefreshLifecycleDeps`:

```ts
  /** The national e-GP (process5) source; defaults to a real client when GPROC_ENABLED, otherwise none. */
  gprocClient?: GprocClientLike;
```

At setup (after `const client = …`):

```ts
  const gproc = deps.gprocClient ?? (gprocEnabled() ? new GprocClient(gprocConfigFromEnv()) : undefined);
```

and change the TOR query to `lifecycleFilter({ gproc: Boolean(gproc) })` (both occurrences, including the `torIds` branch). Make `procurementChanged` also compare the source:

```ts
  if ((before.source ?? "egp2") !== (after.source ?? "egp2")) return true;
```

(add it after the stage check). Replace the per-TOR block (the whole `const projectId = …` through the closing of the `else` that holds the write and the deadline step) with:

```ts
        const loaded = await loadFreshProcurement({
          tor,
          egp: client,
          gproc,
          now,
          warn: (message) =>
            logIngestionEvent({ severity: "warning", message, component: COMPONENT, ingestionRunId: runId }),
          report: (attempt) => {
            gprocStage[attempt] += 1;
          },
        });
        if (loaded === "skip") {
          skipped += 1;
          await logIngestionEvent({
            severity: "warning",
            message: `lifecycle refresh skipped TOR ${label}: no e-GP project id (no listing URL and process5 could not answer)`,
            component: COMPONENT,
            ingestionRunId: runId,
          });
        } else {
          const merged = mergeProcurement(tor.procurement, loaded.fresh);
          const didChange = procurementChanged(tor.procurement, merged);
          const written = await writeProcurementIfUnchanged(tor._id, tor.procurement, merged);
          if (!written) {
            skipped += 1;
            await logIngestionEvent({
              severity: "warning",
              message: `lifecycle refresh skipped TOR ${label}: it changed while being checked; will retry next run`,
              component: COMPONENT,
              ingestionRunId: runId,
            });
          } else {
            if (didChange) changed += 1;
            else unchanged += 1;

            if (extractor && storage && deadlinesRead + deadlinesUnreadable + deadlinesFailed < deadlineCap) {
              const tally = bySource[loaded.source];
              try {
                const outcome = await runDeadlineStep(
                  {
                    torId: tor._id,
                    projectCode: tor.projectCode,
                    title: tor.title,
                    procurement: merged,
                    filenames: loaded.filenames,
                    loadPdf: loaded.loadPdf,
                  },
                  { client, storage, extractor, now }
                );
                /* the existing outcome handling stays, and each counter bump also bumps `tally`
                   (read → tally.read, unreadable → tally.unreadable); the catch block also does tally.errors += 1 */
                await logOpenTorDeadline(tor, merged, loaded.source, outcome);
              } catch (err) {
                /* unchanged, plus tally.errors += 1 and: */
                await logOpenTorDeadline(tor, merged, loaded.source, "error", err as Error);
              }
            } else if (merged.stage === "inviting" && extractor && storage) {
              await logOpenTorDeadline(tor, merged, loaded.source, "capped");
            }
          }
        }
```

The `/* … */` markers stand for the existing `if (outcome === "read") …` chain and `catch` body already in the file; keep them and add only the tally bumps and `logOpenTorDeadline` calls described in them. Update the function's doc comment: "…decides the stage from the national e-GP (process5) with the BMA portal as fallback".

**Reporting (what the admin sees).** Next to the existing counters (`let deadlinesRead = 0; …`) add:

```ts
  const gprocStage = { ok: 0, "not-found": 0, error: 0 };
  const emptyTally = () => ({ read: 0, unreadable: 0, errors: 0 });
  const bySource = { gproc: emptyTally(), egp2: emptyTally() };
  const SOURCE_LABEL = { gproc: "process5", egp2: "BMA portal" } as const;

  /** One info line per open (inviting) TOR: which source gave its bid deadline, and whether it worked. */
  const logOpenTorDeadline = async (
    tor: { _id: Types.ObjectId; projectCode?: string | null },
    merged: IProcurement,
    source: "gproc" | "egp2",
    outcome: DeadlineStepOutcome | "error" | "capped",
    err?: Error
  ) => {
    if (merged.stage !== "inviting") return;
    if (outcome === "skipped") return; // already read for this invitation: nothing happened this run
    const label = tor.projectCode ?? String(tor._id);
    let text: string;
    if (outcome === "read" || outcome === "cleared") {
      const saved = await Tor.findById(tor._id).select("procurement.bidDeadline").lean();
      const d = saved?.procurement?.bidDeadline;
      text = d ? `read ok, ${d.precision === "month" ? "month only" : "day"} ${d.date.toISOString()}` : "no deadline stored";
    } else if (outcome === "unreadable") text = "PDF read but no deadline found";
    else if (outcome === "conflict") text = "not stored (TOR changed meanwhile), retry next run";
    else if (outcome === "capped") text = "not attempted (MAX_DEADLINE_EXTRACTIONS_PER_RUN reached)";
    else text = `failed (${err?.message ?? "error"})`;
    await logIngestionEvent({
      severity: outcome === "error" ? "warning" : "info",
      message: `open TOR ${label}: bid deadline from ${SOURCE_LABEL[source]}: ${text}`,
      component: COMPONENT,
      ingestionRunId: runId,
    });
  };
```

(import `DeadlineStepOutcome` from `./deadlineStep`; `Types`, `Tor`, `IProcurement` are already imported in the file.) Define `logOpenTorDeadline` after `runId` exists (it uses it).

Replace the summary construction (`deadlineSummary` / `outcomeSummary`) with the following. **When process5 is not in use (`gproc` undefined) the string must stay byte-identical to today's**, because existing tests compare it exactly:

```ts
    const t = bySource;
    const bySourceText = (s: "gproc" | "egp2") =>
      `${SOURCE_LABEL[s]} read ${t[s].read}, unreadable ${t[s].unreadable}, errors ${t[s].errors}`;
    const deadlineSummary =
      deadlinesRead + deadlinesUnreadable + deadlinesFailed > 0
        ? `; bid deadlines: read ${deadlinesRead}, unreadable ${deadlinesUnreadable}, errors ${deadlinesFailed}` +
          (gproc ? ` (${bySourceText("gproc")}; ${bySourceText("egp2")})` : "")
        : "";
    const fellBack = gprocStage["not-found"] + gprocStage.error;
    const stageSummary = gproc
      ? `; stage source: process5 ok ${gprocStage.ok}, fell back to BMA portal ${fellBack} (project unknown to process5 ${gprocStage["not-found"]}, process5 error ${gprocStage.error})`
      : "";
    const outcomeSummary = `checked ${tors.length}, changed ${changed}, unchanged ${unchanged}, skipped ${skipped}, failed ${failed}${stageSummary}${deadlineSummary}`;
```

Existing `outcomeSummary` assertions (`"checked 1, changed 1, …, failed 0"`, the exact deadline one) keep passing because those tests inject no `gprocClient` and jest sets `GPROC_ENABLED=false`. The admin card already prints `outcomeSummary` verbatim, so no frontend change is needed.

Additional tests (add to the `"refreshLifecycle with process5"` describe):

```ts
  it("reports how many TORs process5 answered and how many fell back (unknown project vs error)", async () => {
    await seedCode({ sourceListingUrl: listing("r1") });
    await Tor.create({ title: "b", projectCode: "69099318021", pipelineStatus: "enriched", sourceContentHash: "h2", sourceListingUrl: listing("r2") });
    await Tor.create({ title: "c", projectCode: "69099318022", pipelineStatus: "enriched", sourceContentHash: "h3", sourceListingUrl: listing("r3") });
    const g = fakeGproc();
    const origDetail = g.projectDetail.bind(g);
    g.projectDetail = async (id: string) => {
      if (id === "69099318021") return null; // unknown to process5
      if (id === "69099318022") throw new Error("gprocurement 403");
      return origDetail();
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
```

Run the same jest command as Step 2 after wiring; these three plus the earlier ones must pass.

- [ ] **Step 6: Config and docs**

- `backend/.env.example` — after `MAX_DEADLINE_EXTRACTIONS_PER_RUN=20` add:
  ```
  # National e-GP (process5.gprocurement.go.th) is the primary source for stage and bid deadline in the
  # lifecycle refresh; the BMA portal (egp2) is the fallback. false/0/off/no turns it off.
  GPROC_ENABLED=true
  GPROC_BASE_URL=https://process5.gprocurement.go.th
  GPROC_DELAY_MS=500
  GPROC_TIMEOUT_MS=30000
  GPROC_MAX_RETRIES=3
  ```
- `docs/deployment/gcp.md` — in the `tor-lifecycle` and `tor-enrichment` notes add one paragraph: both call process5 (outbound HTTPS to `process5.gprocurement.go.th`, no credentials); `GPROC_*` are optional (defaults above); set `GPROC_ENABLED=false` to fall back to the BMA portal only; the first run after enabling re-reads each candidate's invitation once from process5 (ids change), bounded by `MAX_DEADLINE_EXTRACTIONS_PER_RUN`.
- `CLAUDE.md` "Lifecycle refresh": append one sentence: the refresh asks the national e-GP (`scraper/gprocClient.ts`, mapped by `ingestion/gprocMap.ts`, per-TOR fallback in `lifecycle/loadFresh.ts`) first and the BMA portal second; the invitation PDF for the deadline comes from `infoProcureDocAnnounZip` → `view-pdf` (POST); `procurement.source` records which source wrote the stage; `GPROC_ENABLED=false` disables it.
- Spec `docs/superpowers/specs/2026-10-06-gprocurement-lifecycle-source-design.md`: add a "Status" line under the title: "Implemented by `docs/superpowers/plans/2026-10-06-gprocurement-lifecycle-source.md`." and in "Open items" note that the first process5 run re-reads each invitation once because ids change.

- [ ] **Step 7: Verify and commit**

Run: `cd backend && npm run typecheck && npx jest src/ingestion src/scraper src/__tests__ --runInBand && npm test`
Expected: typecheck clean; all suites pass; no test logs a real network call.

```bash
git add backend/jest.config.js backend/jest.setup.js backend/.env.example backend/src/ingestion/lifecycle backend/src/__tests__/envExample.test.ts docs/deployment/gcp.md CLAUDE.md docs/superpowers/specs/2026-10-06-gprocurement-lifecycle-source-design.md
git commit -m "feat(backend): refresh the lifecycle from the national e-GP with the BMA portal as fallback"
```

---

## Self-Review (against the spec)

- **Spec coverage:** the four endpoints and POST `view-pdf` (Task 1); announce-type table, `R` → cancelled, id format, `source` field and its hiding (Task 2); deadline from the process5 PDF with all existing rules intact (Task 3); process5-first with per-TOR fallback, `GPROC_ENABLED`, candidate rule for TORs without a listing URL, stored `contractStatus` kept, env/docs/rollout note (Task 4). Out of scope (extension, several invitations, disabling TORs, discovery) is not implemented.
- **Placeholders:** the one `/* … unchanged */` marker in Task 4 Step 5 points at existing code that must stay verbatim; everything else is concrete.
- **Type consistency:** `GprocClientLike`, `GprocProjectDetail`, `GprocAnnouncement` (Task 1) are used unchanged in Tasks 2 and 4; `buildGprocProcurement` returns `{ procurement, unknownCodes }` and Task 4 destructures exactly that; `LoadedInvitationPdf`/`loadPdf` (Task 3) match `loadFresh`'s `loadPdf`; `lifecycleFilter({ gproc })` is used consistently.
- **Known cost, accepted:** after the switch each candidate's latest invitation id changes (`gproc-…` vs the egp2 uuid) so it is re-read once; the existing deadline is kept until that read succeeds (Task 4 test) and the cap bounds the spend.
