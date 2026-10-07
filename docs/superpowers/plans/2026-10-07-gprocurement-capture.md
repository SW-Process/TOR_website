# gprocurement Capture (Chrome extension + `POST /api/ingestion/capture`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin send project numbers found on the national e-GP (process5) search page to the backend with a Chrome extension; the backend creates the missing TORs from process5 data (TOR PDF from the document bundle, or the invitation PDF when no TOR exists yet) and queues them into the existing enrichment + lifecycle pipeline.

**Architecture:** The extension observes the search page's own JSON responses, accumulates `{projectCode,title,agency}` rows, and on click POSTs them to `POST /api/ingestion/capture` with the admin session cookie. The route starts a background `captureProjects` run (an `IngestionRun` with phase `capture`), which per project asks process5 (existing polite `GprocClient`, extended with the document bundle), creates the `Tor`, stores the `Attach_TOR*.pdf` found in the bundle (or, when there is no TOR yet, the signed invitation PDF, marked `kind: "invitation"`), and queues enrichment. The public detail shows an original-link that follows the TOR's stored datasource.

**Tech Stack:** Express 5, Mongoose 9, TypeScript, Jest + mongodb-memory-server, `fflate` (zip), Chrome extension Manifest V3 (plain JS, tested with `node --test`).

**Spec:** `docs/superpowers/specs/2026-10-07-gprocurement-capture-design.md`

## Global Constraints

- Admin only: `requireAuth` + `requireRole("admin")` (the router already applies it). The extension never reads cookies; it uses `credentials: "include"`.
- Body: `{ projects: [{ projectCode, title?, agency? }] }`, 1..100 entries, `projectCode` matches `^\d{11}$`, `title`/`agency` optional strings ≤ 500 chars. Nothing client-supplied is stored; `title`/`agency` are a **skip-only hint** (it may skip a project, never create or change data).
- The process5 search page (Turnstile) is **never** called by the backend or the extension's code. The extension only observes the page's own responses. Calls from the backend: `getProjectDetail`, `greenBook`, `infoProcureDocAnnounZipTemp`, `infoProcureDocAnnounZip`, `GET egp-upload-service/v1/downloadFileTest?fileId=<zipId>`. Serial, `GPROC_DELAY_MS` apart, existing timeout/retry (retry only 429/5xx/network, never other 4xx).
- Created TOR: `procurement.source: "gproc"`, no `sourceListingUrl`, `agency` = `deptSubName`, `department` = `deptName`, `projectCode` = the 11-digit number. A TOR **without any stored source document is never enqueued for enrichment**.
- TOR file rule: `.pdf` entries whose base name matches `/TOR/i`; prefer `/^Attach_TOR/i`; several → largest; none → no TOR. Download cap 50 MB, per-entry cap 50 MB. Extract only the chosen entry.
- Source document: the TOR PDF from the bundle if there is one, otherwise the signed invitation PDF (`invitationPdf`; filename `<code>-invitation.pdf`). `sourceDocument.kind` (`"tor"` default | `"invitation"`) records which. A TOR with neither is created but not enqueued. A `kind: "invitation"` document gets **no fairness flags** (enrichment clears them; the invitation has no scope of work). A re-capture of a gproc TOR whose document is an invitation tries the bundle again; when a TOR file is found it replaces the document and re-queues enrichment under a new `sourceContentHash`.
- Capture agency filter: optional env `CAPTURE_AGENCIES` (comma list, empty = allow all); an entry matches when it is contained in `deptName` or `deptSubName`. `INGEST_AGENCIES` is not used. Keyword gate = `looksSoftwareRelated(title)`.
- Circuit breaker: 3 consecutive process5 errors stop asking process5 for the rest of the run (remaining projects counted as skipped, one warning).
- One capture run at a time (`409`), stale runs swept (`sweepStaleRuns("capture")`); `GPROC_ENABLED=false` → `503`.
- `procurement.source` stays hidden from the public API; the detail returns a computed `sourceListingUrl` (`gproc` → `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=<projectCode>`, otherwise the stored egp2 URL).
- Conventional Commits, **no `Co-Authored-By` trailer**. Never push. Never touch the user's uncommitted `backend/TORChecker/*.yml`, `.claude/`, `SRS_TOR.md` (stage files by explicit path).
- Tests never reach the network (`jest.setup.js` sets `GPROC_ENABLED=false`; tests inject fakes). Backend verification: `npm run typecheck` does not cover tests; run the touched jest files and the full `npm test` once per task.
- `npm install fflate` changes `backend/package.json` and `backend/package-lock.json`: commit both (keep lockfile changes limited to that package; if npm rewrites unrelated lines such as `libc` fields, `git checkout -p` them out). Do not create a root-level `package-lock.json`.

## Review Focus

- A client that lies in `title`/`agency` can only cause a skip, never a write (Task 3 test).
- A bundle that is corrupt, encrypted, huge, or has no TOR entry → the invitation PDF is used instead; with no invitation either, the project is created but not enqueued; never an exception out of the project (Tasks 1, 3 tests).
- An invitation-sourced TOR gets no fairness flags, and is upgraded to the real TOR file (document replaced, enrichment re-queued) when a later capture finds one (Tasks 3, 7 tests).
- A re-capture of a project that exists but never got any source document retries and enqueues; one whose document is an invitation is upgraded when a TOR file appears; an egp2-sourced, rejected or TOR-sourced project is left alone (Task 3 tests).
- The same `projectCode` captured twice in a row / concurrently creates one TOR (duplicate-key tolerated) (Task 3 test).
- Process5 down or answering in a changed shape → per-project failures, breaker after 3, run still ends with a summary (Task 3 test).
- The route rejects non-admins, bad bodies, over 100, and a second concurrent run (Task 4 tests); nothing from the body reaches the database.
- The original-link follows the stored source and `procurement.source` is not in the response (Task 2 test).
- A lifecycle-skipped TOR no longer sits at the head of the queue forever (Task 5 test).
- The extension parser returns `[]` for any unexpected shape and never throws (Task 6 tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/package.json`, `package-lock.json` (modify) | add `fflate` |
| `backend/src/scraper/gprocClient.types.ts` (modify) | optional detail fields, `priceBuild`, `GprocCaptureClientLike` |
| `backend/src/scraper/gprocClient.ts` (modify) | read the extra detail fields, `documentBundle`, `downloadBundle` |
| `backend/src/ingestion/capture/torFromBundle.ts` (create) | pick and extract the TOR PDF from a zip |
| `backend/src/ingestion/gprocUrl.ts` (create) | `gprocProjectUrl(projectCode)` |
| `backend/src/ingestion/storeTorPdf.ts` (create), `fetchAndStoreTorPdf.ts` (modify), `models/Tor.ts` (modify) | shared "store a source PDF buffer on a Tor"; `sourceDocument.kind` |
| `backend/src/ingestion/capture/mapGprocTor.ts` (create) | pure: process5 detail + rows → Tor fields + procurement |
| `backend/src/ingestion/capture/captureProjects.ts` (create) | per-project capture, run bookkeeping, breaker |
| `backend/src/models/IngestionRun.ts` (modify) | phase `capture` |
| `backend/src/controllers/ingestionController.ts`, `routes/ingestionRoutes.ts` (modify) | `POST /capture` |
| `backend/src/controllers/torController.ts` (modify) | source-aware `sourceListingUrl` on detail |
| `backend/src/ingestion/lifecycle/refreshLifecycle.ts` (modify) | bump `lastCheckedAt` on a skip |
| `frontend/src/lib/useIngestionRuns.ts` (+ the runs list label) (modify) | `capture` phase type |
| `backend/.env.example`, `docs/deployment/gcp.md`, `CLAUDE.md` (modify) | `CAPTURE_AGENCIES`, docs |
| `backend/src/ingestion/enrichment/torExtractor.ts` (modify), `frontend/src/app/(site)/tor/[id]/page.tsx` (modify) | no fairness flags from an invitation; a one-line notice |
| `extension/**` (create) | MV3 extension, pure parser + tests, README |

---

### Task 1: Client additions and the zip reader

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`, `backend/src/scraper/gprocClient.types.ts`, `backend/src/scraper/gprocClient.ts`
- Create: `backend/src/ingestion/capture/torFromBundle.ts`
- Test: `backend/src/scraper/__tests__/gprocClient.test.ts`, `backend/src/ingestion/capture/__tests__/torFromBundle.test.ts`

**Interfaces:**
- Produces:
  - In `gprocClient.types.ts`: `GprocProjectDetail` gains optional `projectName?: string | null; deptName?: string | null; deptSubName?: string | null; budgetYear?: string | null; projectMoney?: number | null`. `GprocAnnouncement` gains optional `priceBuild?: number | null`.
  - `interface GprocBundle { zipId: string; name: string | null }`
  - `interface GprocCaptureClientLike extends GprocClientLike { documentBundle(projectId: string, opts: { draft: boolean }): Promise<GprocBundle | null>; downloadBundle(zipId: string, maxBytes: number): Promise<Buffer> }`
  - `GprocClient implements GprocCaptureClientLike`.
  - `torFromBundle(zip: Buffer, opts?: { maxEntryBytes?: number }): { name: string; content: Buffer } | null`.

- [ ] **Step 1: Install the zip dependency** — `cd backend && npm install fflate`. Check `git diff --stat backend/package-lock.json` is small (only `fflate` lines); revert unrelated churn. Remove any root-level `package-lock.json` npm may create.

- [ ] **Step 2: Probe the budget field (read-only)** — run `curl -s -A "tor-aggregator-research" "https://process5.gprocurement.go.th/egp-oann10-service/pb/a-egp-allt-project/announcement/getProjectDetail?projectId=69099312832"` and list the keys of `data`. If a numeric budget key exists (for example `projectMoney`), keep `projectMoney` mapping below pointing at that key; if the key has another name, use that name for the `GprocProjectDetail` field and in the mapper (Task 2). If there is none, leave `projectMoney` unused (undefined). Record the finding in the report.

- [ ] **Step 3: Failing tests for the client** — in `gprocClient.test.ts` add (reuse the file's existing fake-fetch helper; a binary response helper `bytes(buf, status = 200)` returning `new Response(buf, { status, headers: { "content-type": "application/zip" } })` is added next to it):

```ts
it("projectDetail also returns the display fields when present", async () => {
  const { client } = make([
    json({ data: { projectId: "69099312832", projectName: "จ้างบำรุงรักษา", deptName: "กรุงเทพมหานคร", deptSubName: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล", budgetYear: "2570", announceType: "D0", methodId: "16", projectStatus: "A", stepId: "M03" } }),
  ]);
  expect(await client.projectDetail("69099312832")).toMatchObject({
    projectName: "จ้างบำรุงรักษา",
    deptName: "กรุงเทพมหานคร",
    deptSubName: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
    budgetYear: "2570",
  });
});

it("announcements carries priceBuild when a row has it", async () => {
  const { client } = make([
    json({ data: { greenBookAnnouncementTypeLinkDto: [{ announceType: "B0", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: "A", priceBuild: 6055000 }] } }),
  ]);
  const rows = await client.announcements("69099312832", { projectId: "69099312832", projectStatus: "A", announceType: "B0", methodId: "16", stepId: "M03" });
  expect(rows[0]?.priceBuild).toBe(6055000);
});

describe("documentBundle", () => {
  it("asks the Temp endpoint for the draft bundle and the plain one otherwise", async () => {
    const { client, calls } = make([
      json({ data: { zipId: "z1", buildName1: "69099312832_23092569.zip" } }),
      json({ data: { zipId: "z2", buildName1: "69099312832_01102569_1.zip" } }),
    ]);
    expect(await client.documentBundle("69099312832", { draft: true })).toEqual({ zipId: "z1", name: "69099312832_23092569.zip" });
    expect(await client.documentBundle("69099312832", { draft: false })).toEqual({ zipId: "z2", name: "69099312832_01102569_1.zip" });
    expect(calls[0]?.url).toContain("/infoProcureDocAnnounZipTemp?projectId=69099312832");
    expect(calls[1]?.url).toContain("/infoProcureDocAnnounZip?projectId=69099312832");
  });
  it("returns null when there is no bundle", async () => {
    const { client } = make([json({ data: null }), json({ data: { zipId: null } })]);
    expect(await client.documentBundle("69099312832", { draft: true })).toBeNull();
    expect(await client.documentBundle("69099312832", { draft: false })).toBeNull();
  });
});

describe("downloadBundle", () => {
  const zipBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32, 1)]);
  it("GETs downloadFileTest with the fileId and returns the bytes", async () => {
    const { client, calls } = make([bytes(zipBytes)]);
    const out = await client.downloadBundle("77c585", 1000);
    expect(out.equals(zipBytes)).toBe(true);
    expect(calls[0]).toMatchObject({ method: "GET" });
    expect(calls[0]?.url).toContain("/egp-upload-service/v1/downloadFileTest?fileId=77c585");
  });
  it("throws when the body is larger than the cap", async () => {
    const { client } = make([bytes(zipBytes)]);
    await expect(client.downloadBundle("z", 10)).rejects.toThrow(/larger than/);
  });
  it("throws when the bytes are not a zip", async () => {
    const { client } = make([bytes(Buffer.from("<html>blocked</html>"))]);
    await expect(client.downloadBundle("z", 1000)).rejects.toThrow(/not a zip/);
  });
});
```

(`make`, `json` and `calls` are the helpers the existing tests in this file already use for the fake fetch; if their names differ, adapt to the file's names. `calls[n]` has `url` and `method`.)

- [ ] **Step 4: Run to see them fail** — `cd backend && npx jest src/scraper/__tests__/gprocClient.test.ts --runInBand` → FAIL.

- [ ] **Step 5: Implement types** — in `gprocClient.types.ts` add the optional fields listed under Interfaces to `GprocProjectDetail` and `GprocAnnouncement`, and append:

```ts
export interface GprocBundle {
  zipId: string;
  /** e.g. "69099312832_23092569.zip" (the bundle's date is in the name). */
  name: string | null;
}

/** The extra calls the capture run needs (the lifecycle refresh does not). */
export interface GprocCaptureClientLike extends GprocClientLike {
  /** `draft: true` asks for the pre-invitation bundle (Temp endpoint), otherwise the published one. Null when none. */
  documentBundle(projectId: string, opts: { draft: boolean }): Promise<GprocBundle | null>;
  /** The zip bytes. Throws when larger than `maxBytes` or not a zip. */
  downloadBundle(zipId: string, maxBytes: number): Promise<Buffer>;
}
```

- [ ] **Step 6: Implement the client** — in `gprocClient.ts`:

1. Import `GprocBundle, GprocCaptureClientLike` and change `class GprocClient implements GprocClientLike` to `implements GprocCaptureClientLike`; re-export `GprocBundle, GprocCaptureClientLike` in the `export type { … }` line.
2. Make `call` accept an optional body parser. Change its signature to
   `private async call<T>(method: "GET" | "POST", path: string, query: Record<string, string>, parse: (res: Response) => Promise<T> = (res) => res.json() as Promise<T>): Promise<T>` and replace `const body = (await res.json()) as T;` by `const body = await parse(res);`. (The retry/timeout/delay logic is unchanged; a parse error is retried like any network error, except the size/zip errors below which are thrown as `GprocHttpError`-free plain errors: add them to the non-retry check by throwing an instance of a small `class NonRetryable extends Error {}` and rethrowing it in the `catch` with `if (err instanceof NonRetryable) throw err;` before the retry bookkeeping.)
3. Extend `projectDetail`'s return object with `projectName: d.projectName ?? null, deptName: d.deptName ?? null, deptSubName: d.deptSubName ?? null, budgetYear: d.budgetYear ?? null` and (only if Step 2 found a budget key) `projectMoney: typeof d.projectMoney === "number" ? d.projectMoney : null`. In `announcements` map add `priceBuild: typeof r.priceBuild === "number" ? r.priceBuild : null`.
4. Add:

```ts
  async documentBundle(projectId: string, opts: { draft: boolean }): Promise<GprocBundle | null> {
    const path = `/egp-approval-service/apv-common/${opts.draft ? "infoProcureDocAnnounZipTemp" : "infoProcureDocAnnounZip"}`;
    const info = await this.call<Envelope<{ zipId?: string | null; buildName1?: string | null }>>("GET", path, { projectId });
    const zipId = info.data?.zipId;
    return zipId ? { zipId, name: info.data?.buildName1 ?? null } : null;
  }

  async downloadBundle(zipId: string, maxBytes: number): Promise<Buffer> {
    return this.call<Buffer>("GET", "/egp-upload-service/v1/downloadFileTest", { fileId: zipId }, async (res) => {
      // The response may carry no content-length, so count the bytes as they arrive.
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) throw new NonRetryable(`bundle is larger than ${maxBytes} bytes`);
      const chunks: Buffer[] = [];
      let total = 0;
      const reader = res.body?.getReader();
      if (!reader) throw new NonRetryable("bundle has no body");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new NonRetryable(`bundle is larger than ${maxBytes} bytes`);
        }
        chunks.push(Buffer.from(value));
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new NonRetryable("bundle is not a zip");
      return buf;
    });
  }
```
   with `class NonRetryable extends Error {}` declared near `GprocHttpError`. `Accept: "application/json"` is sent for every call; that is fine for the download (the server ignores it).

- [ ] **Step 7: Zip reader test** — create `backend/src/ingestion/capture/__tests__/torFromBundle.test.ts`:

```ts
import { zipSync, strToU8 } from "fflate";
import { torFromBundle } from "../torFromBundle";

const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}`);
const zip = (files: Record<string, Buffer | Uint8Array>) =>
  Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v instanceof Uint8Array ? v : new Uint8Array(v)]))));

describe("torFromBundle", () => {
  it("takes Attach_TOR*.pdf and ignores the other documents", () => {
    const z = zip({
      "Attach_TOR_1.pdf": pdf("tor"),
      "annoudoc_310000110000077_69099312832.pdf": pdf("announcement"),
      "doc_310000110000077_69099312832.pdf": pdf("bidding document"),
    });
    const out = torFromBundle(z);
    expect(out?.name).toBe("Attach_TOR_1.pdf");
    expect(out?.content.toString()).toContain("tor");
  });

  it("falls back to any pdf whose name contains TOR (case-insensitive), largest first", () => {
    const z = zip({ "ขอบเขต_tor_small.pdf": pdf("s"), "TOR-full-version.PDF": pdf("a much longer body of text") });
    expect(torFromBundle(z)?.name).toBe("TOR-full-version.PDF");
  });

  it("prefers an Attach_TOR name over a larger plain TOR name", () => {
    const z = zip({ "Attach_TOR_1.pdf": pdf("x"), "other_TOR_big.pdf": pdf("x".repeat(500)) });
    expect(torFromBundle(z)?.name).toBe("Attach_TOR_1.pdf");
  });

  it("matches on the base name inside a folder", () => {
    expect(torFromBundle(zip({ "files/Attach_TOR_2.pdf": pdf("t") }))?.name).toBe("files/Attach_TOR_2.pdf");
  });

  it("returns null when no entry looks like a TOR, never guessing among the others", () => {
    expect(torFromBundle(zip({ "annoudoc_1.pdf": pdf("a"), "doc_1.pdf": pdf("b"), "tor.txt": Buffer.from("not a pdf") }))).toBeNull();
  });

  it("returns null for an entry over the size cap", () => {
    const z = zip({ "Attach_TOR_1.pdf": pdf("y".repeat(2000)) });
    expect(torFromBundle(z, { maxEntryBytes: 100 })).toBeNull();
  });

  it("returns null for a corrupt or non-zip buffer instead of throwing", () => {
    expect(torFromBundle(Buffer.from("PK\u0003\u0004 this is not really a zip"))).toBeNull();
    expect(torFromBundle(Buffer.alloc(0))).toBeNull();
    expect(strToU8("x").length).toBe(1); // keeps the fflate import honest
  });
});
```

Run `npx jest src/ingestion/capture/__tests__/torFromBundle.test.ts --runInBand` → FAIL (module missing).

- [ ] **Step 8: Implement** `backend/src/ingestion/capture/torFromBundle.ts`:

```ts
import { unzipSync } from "fflate";

export interface BundleTor {
  name: string;
  content: Buffer;
}

const DEFAULT_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const baseName = (name: string): string => name.split(/[\\/]/).pop() ?? name;

/**
 * Pick the TOR draft PDF out of an e-GP document bundle and extract only that entry.
 * Rule: a `.pdf` whose base name contains "TOR" (case-insensitive); an `Attach_TOR…` name wins, then the
 * largest. Names inside these zips may be TIS-620 encoded, so only the ASCII part is matched. Any
 * unreadable/corrupt zip, or no matching entry, gives null (never throws).
 */
export function torFromBundle(zip: Buffer, opts: { maxEntryBytes?: number } = {}): BundleTor | null {
  const max = opts.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  if (zip.length < 4) return null;
  const candidates: { name: string; size: number; attach: boolean }[] = [];
  try {
    // A filter that always returns false lists the central directory without inflating anything.
    unzipSync(new Uint8Array(zip), {
      filter: (f) => {
        const base = baseName(f.name);
        if (/\.pdf$/i.test(base) && /TOR/i.test(base) && f.originalSize <= max) {
          candidates.push({ name: f.name, size: f.originalSize, attach: /^Attach_TOR/i.test(base) });
        }
        return false;
      },
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => Number(b.attach) - Number(a.attach) || b.size - a.size);
    const chosen = candidates[0]!;
    const files = unzipSync(new Uint8Array(zip), { filter: (f) => f.name === chosen.name });
    const bytes = files[chosen.name];
    if (!bytes || bytes.length > max) return null;
    return { name: chosen.name, content: Buffer.from(bytes) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 9: Verify and commit** — `cd backend && npm run typecheck && npx jest src/scraper src/ingestion/capture --runInBand && npm test`. Expected: typecheck clean, all pass.

```bash
git add backend/package.json backend/package-lock.json backend/src/scraper/gprocClient.types.ts backend/src/scraper/gprocClient.ts backend/src/scraper/__tests__/gprocClient.test.ts backend/src/ingestion/capture
git commit -m "feat(backend): read the process5 document bundle and pick the TOR PDF from it"
```

---

### Task 2: Pure mapper, shared PDF storing, original link

**Files:**
- Create: `backend/src/ingestion/gprocUrl.ts`, `backend/src/ingestion/storeTorPdf.ts`, `backend/src/ingestion/capture/mapGprocTor.ts`
- Modify: `backend/src/ingestion/fetchAndStoreTorPdf.ts`, `backend/src/controllers/torController.ts`, `backend/src/models/Tor.ts`
- Test: `backend/src/ingestion/capture/__tests__/mapGprocTor.test.ts`, `backend/src/ingestion/__tests__/gprocUrl.test.ts`, `backend/src/ingestion/__tests__/storeTorPdf.test.ts`, `backend/src/__tests__/torProcurementExposure.test.ts` (extend)

**Interfaces:**
- Consumes: `buildGprocProcurement`, `GprocProjectDetail`, `GprocAnnouncement` (with the optional fields from Task 1).
- Produces:
  - `gprocProjectUrl(projectCode: string, base?: string): string`
  - `type SourceDocumentKind = "tor" | "invitation"` and `ISourceDocument.kind?: SourceDocumentKind` (schema: `kind: { type: String, enum: ["tor", "invitation"], default: "tor" }` on `sourceDocumentSchema`; existing documents read as `tor`).
  - `storeTorPdf(tor: HydratedDocument<ITor>, buf: Buffer, meta: { egpUrl: string; filename: string; key: string; kind?: SourceDocumentKind }, deps: { storage: BlobStorage; parse?: PdfParseFn }): Promise<void>` (sets `tor.sourceDocument` + `sourceDocumentUrl` and saves; `kind` defaults to `"tor"`).
  - `mapGprocTor(input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[] }, now: Date): MappedGprocTor | null` where `interface MappedGprocTor { set: { title: string; agency?: string; department?: string; budget?: number; referencePrice?: number; announcementDate?: Date }; sourceContentHash: string; procurement: IProcurement; unknownCodes: string[] }` (null when `projectName` is missing/blank).
  - `resolveSourceListingUrl(tor: { projectCode?: string | null; sourceListingUrl?: string | null; procurement?: { source?: string | null } | null }): string | null` exported from `torController.ts`.

- [ ] **Step 1: Failing tests**

`gprocUrl.test.ts`:
```ts
import { gprocProjectUrl } from "../gprocUrl";

describe("gprocProjectUrl", () => {
  it("opens the process5 search page for the project number", () => {
    expect(gprocProjectUrl("69099314442")).toBe(
      "https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=69099314442"
    );
  });
  it("honours a base override and trims a trailing slash", () => {
    expect(gprocProjectUrl("69099314442", "https://gp.test/")).toBe("https://gp.test/egp-agpc01-web/announcement?keywordSearch=69099314442");
  });
});
```

`mapGprocTor.test.ts`:
```ts
import { mapGprocTor } from "../mapGprocTor";

const NOW = new Date("2026-10-07T00:00:00Z");
const detail = (over: Record<string, unknown> = {}) => ({
  projectId: "69099312832",
  projectStatus: "A",
  announceType: "D0",
  methodId: "16",
  stepId: "M03",
  projectName: "  ประกวดราคาจ้างบำรุงรักษาระบบ  ",
  deptName: "กรุงเทพมหานคร",
  deptSubName: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
  ...over,
});
const row = (announceType: string, announceDate: string, priceBuild: number | null = null) => ({ announceType, announceDate, announceFlag: "A", priceBuild });

describe("mapGprocTor", () => {
  it("maps the display fields, the earliest announcement date and the first reference price", () => {
    const m = mapGprocTor({ detail: detail(), announcements: [row("D0", "2026-09-30T17:00:00.000Z"), row("B0", "2026-09-22T17:00:00.000Z", 6055000)] }, NOW);
    expect(m?.set).toMatchObject({
      title: "ประกวดราคาจ้างบำรุงรักษาระบบ",
      agency: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
      department: "กรุงเทพมหานคร",
      referencePrice: 6055000,
    });
    expect(m?.set.announcementDate).toEqual(new Date("2026-09-22T17:00:00.000Z"));
    expect(m?.procurement).toMatchObject({ stage: "inviting", source: "gproc" });
  });

  it("is stable: the same input gives the same hash, a different title a different one", () => {
    const a = mapGprocTor({ detail: detail(), announcements: [] }, NOW);
    const b = mapGprocTor({ detail: detail(), announcements: [] }, new Date("2027-01-01"));
    const c = mapGprocTor({ detail: detail({ projectName: "อื่น" }), announcements: [] }, NOW);
    expect(a?.sourceContentHash).toBe(b?.sourceContentHash);
    expect(a?.sourceContentHash).not.toBe(c?.sourceContentHash);
  });

  it("omits fields process5 did not give (no NaN, no empty strings)", () => {
    const m = mapGprocTor({ detail: detail({ deptSubName: null, deptName: " " }), announcements: [] }, NOW);
    expect(m?.set.agency).toBeUndefined();
    expect(m?.set.department).toBeUndefined();
    expect(m?.set.referencePrice).toBeUndefined();
    expect(m?.set.announcementDate).toBeUndefined();
  });

  it("returns null when the project has no name", () => {
    expect(mapGprocTor({ detail: detail({ projectName: " " }), announcements: [] }, NOW)).toBeNull();
    expect(mapGprocTor({ detail: detail({ projectName: null }), announcements: [] }, NOW)).toBeNull();
  });

  it("reports unknown announce codes from the shared mapper", () => {
    expect(mapGprocTor({ detail: detail(), announcements: [row("Z9", "2026-10-01T00:00:00.000Z")] }, NOW)?.unknownCodes).toEqual(["Z9"]);
  });
});
```

`storeTorPdf.test.ts` (in-memory Mongo as in the neighbouring ingestion tests):
```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Tor } from "../../models";
import type { BlobStorage } from "../../storage/storage.types";
import { storeTorPdf } from "../storeTorPdf";

let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
afterEach(() => Tor.deleteMany({}));

describe("storeTorPdf", () => {
  it("records an invitation document with kind invitation", async () => {
    const storage = { async put(key: string, body: Buffer) { return { key, size: body.length }; }, publicUrl: () => null } as unknown as BlobStorage;
    const tor = await Tor.create({ title: "t", projectCode: "69099312833" });
    await storeTorPdf(tor, Buffer.from("%PDF-1.7 inv"), { egpUrl: "https://gp.test/x", filename: "69099312833-invitation.pdf", key: "tor-pdfs/69099312833/invitation.pdf", kind: "invitation" }, { storage, parse: async () => ({ numpages: 1, text: "x".repeat(500) }) });
    expect((await Tor.findById(tor.id).lean())?.sourceDocument?.kind).toBe("invitation");
  });

  it("stores the bytes, inspects the text layer and records sourceDocument", async () => {
    const puts: string[] = [];
    const storage = { async put(key: string, body: Buffer) { puts.push(key); return { key, size: body.length }; }, publicUrl: () => null } as unknown as BlobStorage;
    const tor = await Tor.create({ title: "t", projectCode: "69099312832" });
    const parse = async () => ({ numpages: 3, text: "x".repeat(1000) });
    await storeTorPdf(tor, Buffer.from("%PDF-1.7 data"), { egpUrl: "https://gp.test/x", filename: "Attach_TOR_1.pdf", key: "tor-pdfs/69099312832/Attach_TOR_1.pdf" }, { storage, parse });
    expect((await Tor.findById(tor.id).lean())?.sourceDocument?.kind).toBe("tor");
    expect(puts).toEqual(["tor-pdfs/69099312832/Attach_TOR_1.pdf"]);
    const saved = await Tor.findById(tor.id).lean();
    expect(saved?.sourceDocument).toMatchObject({ egpUrl: "https://gp.test/x", filename: "Attach_TOR_1.pdf", storageKey: "tor-pdfs/69099312832/Attach_TOR_1.pdf", textLayer: "digital", pageCount: 3 });
    expect(saved?.sourceDocument?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(saved?.sourceDocumentUrl).toBe(`/api/tors/${tor.id}/document`);
  });
});
```

Extend `torProcurementExposure.test.ts` (use the file's existing seed/agent helpers; follow its style) with:
```ts
it("returns a process5 original link for a gproc TOR and the stored egp2 link otherwise, never procurement.source", async () => {
  // seed two enriched TORs: one with procurement.source "gproc" + an egp2 sourceListingUrl, one with "egp2"
  // GET /api/tors/:id for each:
  //   gproc → tor.sourceListingUrl === "https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=<its projectCode>"
  //   egp2  → tor.sourceListingUrl === its stored egp2 URL
  //   both  → tor.procurement.source is undefined
  // and a gproc TOR with no stored listing URL still gets the process5 link.
});
```
(Write it fully against the file's existing helpers; the three assertions above are required.)

Run the four test files → FAIL.

- [ ] **Step 2: Implement `gprocUrl.ts`**
```ts
const DEFAULT_BASE = "https://process5.gprocurement.go.th";

/** The process5 page that finds the project (its search page, keyword = the project number); the user presses "ดูข้อมูล". */
export function gprocProjectUrl(projectCode: string, base: string = process.env.GPROC_BASE_URL ?? DEFAULT_BASE): string {
  return `${base.replace(/\/$/, "")}/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(projectCode)}`;
}
```

- [ ] **Step 3: Model + `storeTorPdf.ts`, and call it from `fetchAndStoreTorPdf.ts`**

First, in `models/Tor.ts` add `export type SourceDocumentKind = "tor" | "invitation";`, `kind?: SourceDocumentKind;` to `ISourceDocument`, and `kind: { type: String, enum: ["tor", "invitation"], default: "tor" },` to `sourceDocumentSchema`. Export the type from `models/index.ts` if the other types are re-exported there.

```ts
import { createHash } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import type { ITor, SourceDocumentKind } from "../models/Tor";
import type { BlobStorage } from "../storage/storage.types";
import { pdfInspect, type PdfParseFn } from "./pdfInspect";

/**
 * Store a source PDF's bytes (a TOR, or an invitation when no TOR exists yet) and record everything on `tor.sourceDocument` (and `sourceDocumentUrl`).
 * Shared by the egp2 download (`fetchAndStoreTorPdf`) and the process5 capture.
 */
export async function storeTorPdf(
  tor: HydratedDocument<ITor>,
  buf: Buffer,
  meta: { egpUrl: string; filename: string; key: string; kind?: SourceDocumentKind },
  deps: { storage: BlobStorage; parse?: PdfParseFn }
): Promise<void> {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const { pageCount, textLayer } = await pdfInspect(buf, deps.parse);
  await deps.storage.put(meta.key, buf, { contentType: "application/pdf" });
  tor.sourceDocument = {
    egpUrl: meta.egpUrl,
    filename: meta.filename,
    storageKey: meta.key,
    textLayer,
    pageCount,
    byteSize: buf.length,
    sha256,
    fetchedAt: new Date(),
    kind: meta.kind ?? "tor",
  };
  tor.sourceDocumentUrl = deps.storage.publicUrl(meta.key) ?? `/api/tors/${tor.id}/document`;
  await tor.save();
}

export default storeTorPdf;
```
In `fetchAndStoreTorPdf.ts` replace the block from `const sha256 = …` through `await tor.save();` (the success path) with:
```ts
  await storeTorPdf(
    tor,
    buf,
    { egpUrl: ann.egpUrl, filename: ann.filename, key: `tor-pdfs/${tor.projectCode ?? tor.id}/${ann.announcementId}.pdf` },
    { storage: deps.storage, parse: deps.parse }
  );
```
and remove the now-unused `createHash`/`pdfInspect` imports there. The failure path stays unchanged. The existing `fetchAndStoreTorPdf` tests must keep passing untouched.

- [ ] **Step 4: Implement `mapGprocTor.ts`**

```ts
import { createHash } from "node:crypto";
import type { IProcurement } from "../../models/Tor";
import type { GprocAnnouncement, GprocProjectDetail } from "../../scraper/gprocClient.types";
import { buildGprocProcurement } from "../gprocMap";

export interface MappedGprocTor {
  set: {
    title: string;
    agency?: string;
    department?: string;
    budget?: number;
    referencePrice?: number;
    announcementDate?: Date;
  };
  sourceContentHash: string;
  procurement: IProcurement;
  unknownCodes: string[];
}

const text = (v: string | null | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Pure transform: process5 detail + announcement rows → what a new Tor is created from. The reference
 * price is the first `priceBuild` on the rows; `announcementDate` is the earliest announcement. No I/O.
 */
export function mapGprocTor(
  input: { detail: GprocProjectDetail; announcements: GprocAnnouncement[] },
  now: Date
): MappedGprocTor | null {
  const title = text(input.detail.projectName);
  if (!title) return null;
  const { procurement, unknownCodes } = buildGprocProcurement(input, undefined, now);

  const prices = input.announcements.map((a) => a.priceBuild).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const dates = procurement.announcements.map((a) => a.publishedAt).filter((d): d is Date => d instanceof Date);
  const set: MappedGprocTor["set"] = { title };
  const agency = text(input.detail.deptSubName);
  const department = text(input.detail.deptName);
  if (agency) set.agency = agency;
  if (department) set.department = department;
  if (prices.length > 0) set.referencePrice = prices[0];
  const budget = input.detail.projectMoney;
  if (typeof budget === "number" && Number.isFinite(budget)) set.budget = budget;
  if (dates.length > 0) set.announcementDate = dates[0]; // announcements are sorted oldest first

  const hash = createHash("sha256")
    .update([title, department ?? "", agency ?? "", String(set.referencePrice ?? "")].join("|"))
    .digest("hex");
  return { set, sourceContentHash: hash, procurement, unknownCodes };
}
```
(If Step 2 of Task 1 found no budget key, `projectMoney` is simply never set and `budget` stays undefined.)

- [ ] **Step 5: Source-aware link in `torController.ts`**

Add near the top-level helpers:
```ts
import { gprocProjectUrl } from "../ingestion/gprocUrl";

/** The "ดูประกาศต้นฉบับที่ e-GP" link follows the TOR's datasource: process5 for gproc, else the stored egp2 URL. */
export function resolveSourceListingUrl(tor: {
  projectCode?: string | null;
  sourceListingUrl?: string | null;
  procurement?: { source?: string | null } | null;
}): string | null {
  if (tor.procurement?.source === "gproc" && tor.projectCode) return gprocProjectUrl(tor.projectCode);
  return tor.sourceListingUrl ?? null;
}
```
In `getTor` remove `-procurement.source` from the `.select(...)` string, and after `if (!tor) throw …`:
```ts
  const sourceListingUrl = resolveSourceListingUrl(tor);
  if (tor.procurement) delete (tor.procurement as { source?: unknown }).source;
  res.status(200).json({ tor: withDisplayStatus({ ...tor, sourceListingUrl: sourceListingUrl ?? undefined }) });
```
(replacing the previous `res.status(200).json({ tor: withDisplayStatus(tor) })`; keep the type passing `withDisplayStatus`'s input).

- [ ] **Step 6: Verify and commit** — `cd backend && npm run typecheck && npx jest src/ingestion src/__tests__/torProcurementExposure.test.ts src/__tests__ --runInBand` then `npm test` once.

```bash
git add backend/src/ingestion/gprocUrl.ts backend/src/ingestion/storeTorPdf.ts backend/src/ingestion/fetchAndStoreTorPdf.ts backend/src/ingestion/capture/mapGprocTor.ts backend/src/ingestion/capture/__tests__/mapGprocTor.test.ts backend/src/ingestion/__tests__/gprocUrl.test.ts backend/src/ingestion/__tests__/storeTorPdf.test.ts backend/src/controllers/torController.ts backend/src/__tests__/torProcurementExposure.test.ts
git commit -m "feat(backend): map process5 projects to TOR fields and link the original by datasource"
```

---

### Task 3: The capture run

**Files:**
- Modify: `backend/src/models/IngestionRun.ts`
- Create: `backend/src/ingestion/capture/captureProjects.ts`, `backend/src/ingestion/capture/agencies.ts`
- Test: `backend/src/ingestion/capture/__tests__/captureProjects.test.ts`, `backend/src/ingestion/capture/__tests__/agencies.test.ts`

**Interfaces:**
- Consumes: `GprocCaptureClientLike` (Task 1, incl. `invitationPdf`), `mapGprocTor`, `gprocProjectUrl`, `storeTorPdf` (with `kind`), `torFromBundle`, `enqueue` from `enrichment/enrichmentJobRepo`, `looksSoftwareRelated`, `logIngestionEvent`.
- Produces:
  - `IngestionPhase` gains `"capture"` (type and schema enum).
  - `captureAgencies(env?: NodeJS.ProcessEnv): string[]` and `agencyMatches(list: string[], ...names: Array<string | null | undefined>): boolean` (empty `list` → true).
  - `interface CaptureProject { projectCode: string; title?: string; agency?: string }`
  - `interface CaptureDeps { gproc: GprocCaptureClientLike; storage: BlobStorage; enqueueEnrichment?: (torId: Types.ObjectId, hash: string) => Promise<void>; now?: () => Date; parse?: PdfParseFn; env?: NodeJS.ProcessEnv }`
  - `captureProjects(runId: Types.ObjectId, projects: CaptureProject[], deps: CaptureDeps): Promise<void>` — updates the `IngestionRun` (stats: `torsCreated`, `torsUnchanged` = already known, `torsSkipped`, `torsFailed`; final `status` and `outcomeSummary`) and writes per-project `SystemLog` lines; never throws for a per-project problem.

- [ ] **Step 1: Phase value** — in `models/IngestionRun.ts` change `export type IngestionPhase = "discovery" | "enrichment" | "lifecycle";` to include `| "capture"` and the schema `enum: ["discovery", "enrichment", "lifecycle", "capture"]`. Run `npm run typecheck` and fix any exhaustive-switch or `Record<IngestionPhase, …>` errors in the backend (there should be none).

- [ ] **Step 2: Failing tests**

`agencies.test.ts`:
```ts
import { agencyMatches, captureAgencies } from "../agencies";

describe("captureAgencies", () => {
  it("is empty by default and splits a comma list", () => {
    expect(captureAgencies({})).toEqual([]);
    expect(captureAgencies({ CAPTURE_AGENCIES: " กรุงเทพมหานคร , สำนักงานพัฒนา ,," })).toEqual(["กรุงเทพมหานคร", "สำนักงานพัฒนา"]);
  });
});
describe("agencyMatches", () => {
  it("allows everything when the list is empty", () => expect(agencyMatches([], "ใครก็ได้")).toBe(true));
  it("matches when an entry is contained in any name", () => {
    expect(agencyMatches(["กรุงเทพมหานคร"], "กรมชลประทาน", "กรุงเทพมหานคร")).toBe(true);
    expect(agencyMatches(["สำนักดิจิทัล"], "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล")).toBe(false);
    expect(agencyMatches(["x"], null, undefined)).toBe(false);
  });
});
```

`captureProjects.test.ts` — in-memory Mongo (same setup/teardown pattern as `refreshLifecycle.test.ts`; clean `Tor`, `IngestionRun`, `SystemLog`, `EnrichmentJob` after each). Fakes:

```ts
import { zipSync } from "fflate";
import type { GprocCaptureClientLike, GprocAnnouncement, GprocProjectDetail } from "../../../scraper/gprocClient.types";

const pdf = Buffer.from("%PDF-1.7 tor body");
const goodZip = Buffer.from(zipSync({ "Attach_TOR_1.pdf": new Uint8Array(pdf), "doc_1.pdf": new Uint8Array(Buffer.from("%PDF-x")) }));
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
```
Helper `run(projects, deps)`: creates an `IngestionRun` (`trigger: "manual", phase: "capture", status: "running", stats: { torsFound: projects.length }`), calls `captureProjects(run._id, projects, { storage: storage(), enqueueEnrichment: enq, parse: async () => ({ numpages: 2, text: "x".repeat(900) }), now: () => NOW, env: {}, ...deps })`, returns `{ run: await IngestionRun.findById(run._id).lean(), enq }` where `enq` is a `jest.fn()` recording calls. Tests (each must be written out in full):

1. **creates, stores the TOR file, enqueues once**: capture `[{ projectCode: "69099312832" }]` → one `Tor` with `projectCode`, `title`, `agency: "สำนักดิจิทัล"`, `department: "กรุงเทพมหานคร"`, `referencePrice: 4890000`, `procurement.source: "gproc"`, `procurement.stage: "inviting"`, `sourceListingUrl` undefined, `sourceDocument.storageKey` starting `tor-pdfs/69099312832/`, `sourceDocument.filename: "Attach_TOR_1.pdf"`, `sourceDocument.kind: "tor"` (and `invitationCalls` is 0 because a TOR was found); `enq` called once with `(tor._id, tor.sourceContentHash)`; run `stats.torsCreated: 1`, `status: "success"`, `outcomeSummary` contains `created 1`.
2. **existing TOR is left alone**: seed an enriched `Tor` with that code → `gproc.detailCalls` empty, `torsUnchanged: 1`, the TOR unchanged, `enq` not called.
3. **an existing gproc TOR with no source document is retried**: seed `Tor` with `pipelineStatus: "pending"`, `procurement.source: "gproc"`, no `sourceDocument` -> a document is fetched and stored, `enq` called once, counted as `torsUnchanged: 1`; a seeded `rejected` TOR, an `enriched` TOR with a `kind: "tor"` document, and a TOR whose `procurement.source` is `"egp2"` (even with no document) are left alone (no process5 call).
3b. **an invitation-sourced TOR is upgraded when a TOR file appears**: seed an `enriched` gproc `Tor` with `sourceDocument: { ..., storageKey: "tor-pdfs/69099312832/invitation.pdf", kind: "invitation" }` and `sourceContentHash: "old"`; capture with a bundle that now has `Attach_TOR_1.pdf` -> `sourceDocument.kind` becomes `"tor"` with the TOR's filename, `sourceContentHash` is no longer `"old"`, and `enq` is called once with the new hash (counted `known`). With a bundle that still has no TOR entry -> nothing changes, `enq` not called, `known`. An `invitation` document is never replaced by another invitation (`invitationPdf` is not called on this path).
4. **title hint that fails the keyword gate skips without calling process5** (`title: "จ้างเหมาทำความสะอาด"`) → `detailCalls` empty, `torsSkipped: 1`, no Tor; a **lying hint** that passes (`title: "ซอฟต์แวร์"`) for a project whose real title fails the gate → still skipped (`not software related`), nothing stored from the hint.
5. **keyword gate on the server title**: `detail` returns a non-software title → skipped, no Tor, no enqueue.
6. **`CAPTURE_AGENCIES`**: `env: { CAPTURE_AGENCIES: "สำนักการแพทย์" }` with the detail's `deptName/deptSubName` not containing it → skipped; with a matching entry → created. An `agency` hint that does not match the list → skipped without a process5 call.
7. **unknown to process5**: `detail` returns `null` → skipped (reason "unknown to process5"), no Tor.
8. **no TOR file -> the invitation PDF**: `zip` is a zip with only `doc_1.pdf` and `invitation` is a PDF buffer -> the Tor is created with `sourceDocument.kind: "invitation"`, `filename: "69099312832-invitation.pdf"`, a stored `storageKey` ending `/invitation.pdf`, and `enq` is called once. The same result when `documentBundle` returns `null` for both bundles, when the zip is corrupt (`Buffer.from("PK\u0003\u0004junk")`), and when `downloadBundle` rejects.
8b. **no source document at all**: no TOR in the bundle and `invitation: null` (or `invitationPdf` rejecting) -> the Tor IS created (with `procurement`), has no `sourceDocument.storageKey`, `enq` is NOT called, `torsCreated: 1`, and a warning log mentions the project code.
9. **falls back from the draft bundle to the published bundle**: `bundle: (c, draft) => (draft ? null : { zipId: "z-pub", name: "p.zip" })` → file stored from `z-pub` (`zipCalls` equals `["z-pub"]`).
10. **process5 error isolation + breaker**: `detail` throws for every project, 5 projects → `detailCalls.length === 3`, `torsFailed: 3`, `torsSkipped: 2`, `status: "failed"` (nothing created/known/skipped successfully? use the status rule below — verify the summary contains `process5 paused`), exactly one `SystemLog` warning containing `paused`. A project that throws followed by one that succeeds resets the counter (3 errors separated by a success never trips it).
11. **duplicate code is tolerated**: pre-create a `Tor` with the code only AFTER `detail` resolves (use a `detail` function that inserts it as a side effect) → the project counts as `torsUnchanged` and no exception escapes.
12. **dedupes and keeps order**: the same code twice in the input is processed once (`detailCalls` has it once).
13. **sets `ingestionRunId`** on the created Tor.

Run both test files → FAIL.

- [ ] **Step 3: `agencies.ts`**
```ts
/** `CAPTURE_AGENCIES`: comma-separated names a captured project's body/unit must contain; empty = allow all. */
export function captureAgencies(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CAPTURE_AGENCIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True when `list` is empty, or some entry is contained in one of the names. */
export function agencyMatches(list: string[], ...names: Array<string | null | undefined>): boolean {
  if (list.length === 0) return true;
  return list.some((entry) => names.some((n) => typeof n === "string" && n.includes(entry)));
}
```

- [ ] **Step 4: `captureProjects.ts`**

```ts
import { createHash } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
import { IngestionRun, Tor } from "../../models";
import type { ITor } from "../../models/Tor";
import type { GprocCaptureClientLike } from "../../scraper/gprocClient.types";
import type { BlobStorage } from "../../storage/storage.types";
import { enqueue } from "../enrichment/enrichmentJobRepo";
import { gprocProjectUrl } from "../gprocUrl";
import { logIngestionEvent } from "../log";
import type { PdfParseFn } from "../pdfInspect";
import { looksSoftwareRelated } from "../softwareKeywordGate";
import { storeTorPdf } from "../storeTorPdf";
import { agencyMatches, captureAgencies } from "./agencies";
import { mapGprocTor } from "./mapGprocTor";
import { torFromBundle } from "./torFromBundle";

const COMPONENT = "captureProjects";
const BREAKER = 3;
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

export interface CaptureProject {
  projectCode: string;
  title?: string;
  agency?: string;
}

export interface CaptureDeps {
  gproc: GprocCaptureClientLike;
  storage: BlobStorage;
  enqueueEnrichment?: (torId: Types.ObjectId, hash: string) => Promise<void>;
  now?: () => Date;
  parse?: PdfParseFn;
  env?: NodeJS.ProcessEnv;
}

type Outcome = { kind: "created" | "known" | "skipped" | "failed"; note?: string; gproc?: "ok" | "error" };

/**
 * Capture admin-selected process5 projects: create the missing TORs from process5 data, store the TOR PDF
 * found in the document bundle (or the signed invitation PDF when there is no TOR yet) and queue enrichment.
 * A TOR with no stored source document is never queued; one summarised from its invitation is upgraded
 * when a later capture finds the TOR file.
 * Serial; per-project errors never escape; 3 consecutive process5 errors pause process5 for the run.
 * The `title`/`agency` hints from the client can only SKIP a project, never create or change data.
 */
export async function captureProjects(runId: Types.ObjectId, projects: CaptureProject[], deps: CaptureDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const enqueueEnrichment = deps.enqueueEnrichment ?? enqueue;
  const agencies = captureAgencies(deps.env ?? process.env);
  const unique = [...new Map(projects.map((p) => [p.projectCode, p])).values()];

  let created = 0;
  let known = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveErrors = 0;
  let paused = false;

  const log = (severity: "info" | "warning" | "error", message: string) =>
    logIngestionEvent({ severity, message, component: COMPONENT, ingestionRunId: runId });

  /** TOR file from the bundles first; otherwise the signed invitation PDF. Returns which kind was stored, or null. */
  async function attachSourceFile(tor: HydratedDocument<ITor>, code: string): Promise<"tor" | "invitation" | null> {
    try {
      if (await attachTorFromBundle(tor, code)) return "tor";
    } catch (err) {
      await log("warning", `capture ${code}: TOR file not stored (${(err as Error).message})`);
    }
    try {
      const inv = await deps.gproc.invitationPdf(code);
      if (!inv) return null;
      await storeTorPdf(
        tor,
        inv,
        { egpUrl: gprocProjectUrl(code), filename: `${code}-invitation.pdf`, key: `tor-pdfs/${code}/invitation.pdf`, kind: "invitation" },
        { storage: deps.storage, parse: deps.parse }
      );
      return "invitation";
    } catch (err) {
      await log("warning", `capture ${code}: invitation PDF not stored (${(err as Error).message})`);
      return null;
    }
  }

  /** The TOR PDF from the draft bundle, else the published one. Throws on a download problem; false when there is none. */
  async function attachTorFromBundle(tor: HydratedDocument<ITor>, code: string): Promise<boolean> {
    for (const draft of [true, false]) {
      const bundle = await deps.gproc.documentBundle(code, { draft });
      if (!bundle) continue;
      const zip = await deps.gproc.downloadBundle(bundle.zipId, MAX_BUNDLE_BYTES);
      const file = torFromBundle(zip, { maxEntryBytes: MAX_BUNDLE_BYTES });
      if (!file) continue;
      const safe = (file.name.split(/[\\/]/).pop() ?? "tor.pdf").replace(/[^A-Za-z0-9._-]/g, "_");
      await storeTorPdf(
        tor,
        file.content,
        { egpUrl: gprocProjectUrl(code), filename: file.name, key: `tor-pdfs/${code}/${safe}`, kind: "tor" },
        { storage: deps.storage, parse: deps.parse }
      );
      return true;
    }
    return false;
  }

  async function processOne(p: CaptureProject): Promise<Outcome> {
    const code = p.projectCode;
    const existing = await Tor.findOne({ projectCode: code });
    if (existing) {
      if (existing.procurement?.source !== "gproc") return { kind: "known", note: "already in the database" };
      const doc = existing.sourceDocument;
      // (a) never got a source document and was never judged: retry, then queue.
      if (existing.pipelineStatus === "pending" && !doc?.storageKey) {
        if (!(await attachSourceFile(existing, code))) return { kind: "known", note: "no source document found yet" };
        await enqueueEnrichment(existing._id as Types.ObjectId, existing.sourceContentHash ?? "");
        return { kind: "known", note: "source document attached, queued for enrichment" };
      }
      // (b) summarised from the invitation only: look for the real TOR file and re-queue under a new hash.
      if (doc?.kind === "invitation" && existing.pipelineStatus !== "processing") {
        let upgraded = false;
        try {
          upgraded = await attachTorFromBundle(existing, code);
        } catch (err) {
          await log("warning", `capture ${code}: TOR file not stored (${(err as Error).message})`);
        }
        if (!upgraded) return { kind: "known", note: "still only the invitation (no TOR file yet)" };
        existing.sourceContentHash = createHash("sha256")
          .update(`${existing.sourceContentHash ?? ""}|tor|${existing.sourceDocument?.sha256 ?? ""}`)
          .digest("hex");
        await existing.save();
        await enqueueEnrichment(existing._id as Types.ObjectId, existing.sourceContentHash);
        return { kind: "known", note: "TOR file found, re-queued for enrichment" };
      }
      return { kind: "known", note: "already in the database" };
    }

    if (p.title && !looksSoftwareRelated(p.title)) return { kind: "skipped", note: "title hint is not software related" };
    if (p.agency && !agencyMatches(agencies, p.agency)) return { kind: "skipped", note: "agency hint not in CAPTURE_AGENCIES" };

    let detail;
    try {
      detail = await deps.gproc.projectDetail(code);
    } catch (err) {
      return { kind: "failed", note: `process5: ${(err as Error).message}`, gproc: "error" };
    }
    if (!detail) return { kind: "skipped", note: "unknown to process5", gproc: "ok" };
    if (!looksSoftwareRelated(detail.projectName ?? "")) return { kind: "skipped", note: "not software related (keyword gate)", gproc: "ok" };
    if (!agencyMatches(agencies, detail.deptName, detail.deptSubName)) return { kind: "skipped", note: "agency not in CAPTURE_AGENCIES", gproc: "ok" };

    let rows;
    try {
      rows = await deps.gproc.announcements(code, detail);
    } catch (err) {
      return { kind: "failed", note: `process5: ${(err as Error).message}`, gproc: "error" };
    }
    const mapped = mapGprocTor({ detail, announcements: rows }, now());
    if (!mapped) return { kind: "failed", note: "process5 returned no project name", gproc: "error" };
    for (const c of mapped.unknownCodes) await log("warning", `capture ${code}: unknown process5 announce type "${c}" (treated as unknown)`);

    let tor: HydratedDocument<ITor>;
    try {
      tor = await Tor.create({
        ...mapped.set,
        projectCode: code,
        sourceContentHash: mapped.sourceContentHash,
        ingestionRunId: runId,
        procurement: mapped.procurement,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return { kind: "known", note: "created by someone else meanwhile", gproc: "ok" };
      throw err;
    }
    const kind = await attachSourceFile(tor, code);
    if (!kind) {
      return { kind: "created", note: "created, but no TOR file or invitation found yet; not queued for enrichment", gproc: "ok" };
    }
    await enqueueEnrichment(tor._id as Types.ObjectId, mapped.sourceContentHash);
    return { kind: "created", note: kind === "invitation" ? "summarised from the invitation (no TOR file yet)" : undefined, gproc: "ok" };
  }

  for (const p of unique) {
    let out: Outcome;
    if (paused) {
      out = { kind: "skipped", note: "not processed: process5 paused after repeated errors" };
    } else {
      try {
        out = await processOne(p);
      } catch (err) {
        out = { kind: "failed", note: (err as Error).message };
      }
    }
    if (out.kind === "created") created += 1;
    else if (out.kind === "known") known += 1;
    else if (out.kind === "skipped") skipped += 1;
    else failed += 1;
    if (out.gproc === "ok") consecutiveErrors = 0;
    else if (out.gproc === "error") consecutiveErrors += 1;
    await log(out.kind === "failed" ? "warning" : "info", `capture ${p.projectCode}: ${out.kind}${out.note ? ` (${out.note})` : ""}`);
    if (!paused && consecutiveErrors >= BREAKER) {
      paused = true;
      await log("warning", `process5 paused after ${BREAKER} consecutive errors; the rest of this run is not processed`);
    }
    await IngestionRun.updateOne(
      { _id: runId },
      { $set: { "stats.torsCreated": created, "stats.torsUnchanged": known, "stats.torsSkipped": skipped, "stats.torsFailed": failed } }
    );
  }

  const status = failed === 0 ? "success" : created + known + skipped === 0 ? "failed" : "partial";
  const outcomeSummary =
    `captured ${unique.length}: created ${created}, already known ${known}, skipped ${skipped}, failed ${failed}` +
    (paused ? `; process5 paused after ${BREAKER} consecutive errors` : "");
  await IngestionRun.updateOne({ _id: runId }, { $set: { completedAt: now(), status, outcomeSummary } });
  await log("info", outcomeSummary);
}

export default captureProjects;
```

Notes the implementer must respect: in test 10 the first 3 projects fail (`failed 3`) and the last 2 are skipped (`skipped 2`); `created + known + skipped` is then 2, so the run's status is `partial` — adjust the test's expected status to `partial` (not `failed`). A run where every project fails and none is skipped is `failed`.

- [ ] **Step 5: Verify and commit** — `cd backend && npm run typecheck && npx jest src/ingestion/capture --runInBand && npm test`.

```bash
git add backend/src/models/IngestionRun.ts backend/src/ingestion/capture/agencies.ts backend/src/ingestion/capture/captureProjects.ts backend/src/ingestion/capture/__tests__/agencies.test.ts backend/src/ingestion/capture/__tests__/captureProjects.test.ts
git commit -m "feat(backend): capture process5 projects into TORs with their TOR file from the bundle"
```

---

### Task 4: The route, env and docs

**Files:**
- Modify: `backend/src/controllers/ingestionController.ts`, `backend/src/routes/ingestionRoutes.ts`, `backend/.env.example`, `docs/deployment/gcp.md`, `CLAUDE.md`, `frontend/src/lib/useIngestionRuns.ts` (+ the runs-list label in `frontend/src/components/admin/ScraperHealth.tsx` if it switches on `phase`)
- Test: `backend/src/__tests__/ingestionRoutes.test.ts`, `backend/src/__tests__/envExample.test.ts`

**Interfaces:**
- Consumes: `captureProjects`, `CaptureProject` (Task 3), `GprocClient`, `gprocConfigFromEnv`, `gprocEnabled`, `getStorage`.
- Produces: `POST /api/ingestion/capture` → `202 { runId, status: "running" }`; `createCaptureRun` exported from the controller.

- [ ] **Step 1: Failing route tests** — in `ingestionRoutes.test.ts` add a mock next to the other module mocks (before the `app` import):

```ts
const captureProjectsMock = jest.fn();
jest.mock("../ingestion/capture/captureProjects", () => ({
  captureProjects: (...args: unknown[]) => captureProjectsMock(...args),
}));
```
and a new describe (use the file's `adminAgent()` helper; set `process.env.GPROC_ENABLED = "true"` in `beforeEach` of this describe and restore afterwards — `jest.setup.js` sets it to `"false"`):

```ts
describe("POST /api/ingestion/capture", () => {
  const body = { projects: [{ projectCode: "69099312832", title: "ระบบสารสนเทศ", agency: "สำนักดิจิทัล" }, { projectCode: "69099314442" }] };
  const prev = process.env.GPROC_ENABLED;
  beforeEach(() => { process.env.GPROC_ENABLED = "true"; captureProjectsMock.mockResolvedValue(undefined); });
  afterAll(() => { process.env.GPROC_ENABLED = prev; });

  it("401 without a session and 403 for a non-admin", async () => {
    expect((await request(app).post("/api/ingestion/capture").send(body)).status).toBe(401);
    const a = request.agent(app);
    await a.post("/api/auth/register").send({ email: "v@test.com", password: "secret123" });
    expect((await a.post("/api/ingestion/capture").send(body)).status).toBe(403);
  });

  it("202, creates a running capture run and hands the projects to captureProjects", async () => {
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/capture").send(body);
    expect(res.status).toBe(202);
    const run = await IngestionRun.findById(res.body.runId).lean();
    expect(run).toMatchObject({ phase: "capture", trigger: "manual", status: "running" });
    expect(run?.stats.torsFound).toBe(2);
    await waitFor(() => captureProjectsMock.mock.calls.length === 1);
    expect(captureProjectsMock.mock.calls[0]?.[1]).toEqual(body.projects);
  });

  it.each([
    ["no body", undefined],
    ["projects not an array", { projects: "69099312832" }],
    ["empty projects", { projects: [] }],
    ["a bad code", { projects: [{ projectCode: "1234" }] }],
    ["a non-object entry", { projects: ["69099312832"] }],
    ["a long title", { projects: [{ projectCode: "69099312832", title: "x".repeat(501) }] }],
    ["a non-string agency", { projects: [{ projectCode: "69099312832", agency: 5 }] }],
    ["more than 100", { projects: Array.from({ length: 101 }, (_, i) => ({ projectCode: String(10000000000 + i) })) }],
  ])("400 for %s", async (_name, payload) => {
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/capture").send(payload as object)).status).toBe(400);
    expect(captureProjectsMock).not.toHaveBeenCalled();
  });

  it("drops duplicate project numbers", async () => {
    const agent = await adminAgent();
    await agent.post("/api/ingestion/capture").send({ projects: [{ projectCode: "69099312832" }, { projectCode: "69099312832", title: "ซ้ำ" }] });
    await waitFor(() => captureProjectsMock.mock.calls.length === 1);
    expect(captureProjectsMock.mock.calls[0]?.[1]).toEqual([{ projectCode: "69099312832" }]);
  });

  it("409 while a capture run is running", async () => {
    const agent = await adminAgent();
    await IngestionRun.create({ trigger: "manual", phase: "capture", status: "running" });
    expect((await agent.post("/api/ingestion/capture").send(body)).status).toBe(409);
  });

  it("503 when the process5 source is switched off", async () => {
    process.env.GPROC_ENABLED = "false";
    const agent = await adminAgent();
    expect((await agent.post("/api/ingestion/capture").send(body)).status).toBe(503);
  });

  it("marks the run failed when captureProjects rejects", async () => {
    captureProjectsMock.mockRejectedValue(new Error("boom"));
    const agent = await adminAgent();
    const res = await agent.post("/api/ingestion/capture").send(body);
    const run = await (async () => {
      for (let i = 0; i < 100; i += 1) {
        const r = await IngestionRun.findById(res.body.runId).lean();
        if (r?.status === "failed") return r;
        await new Promise((x) => setTimeout(x, 10));
      }
      return IngestionRun.findById(res.body.runId).lean();
    })();
    expect(run?.status).toBe("failed");
    expect(run?.outcomeSummary).toContain("boom");
  });
});
```

In `envExample.test.ts` add `CAPTURE_AGENCIES` to the list of keys checked like the neighbouring `GPROC_*` ones.

Run → FAIL.

- [ ] **Step 2: Controller** — in `ingestionController.ts` add imports `captureProjects, type CaptureProject` from `../ingestion/capture/captureProjects`, `GprocClient, gprocConfigFromEnv, gprocEnabled` from `../scraper/gprocClient`, and `getStorage` (already imported in this codebase from `../storage`; if not imported here, add `import { getStorage } from "../storage";`). Add:

```ts
const CAPTURE_MAX_PROJECTS = 100;
const CAPTURE_HINT_MAX = 500;

function parseCaptureProjects(raw: unknown): CaptureProject[] {
  const list = (raw as { projects?: unknown } | undefined)?.projects;
  if (!Array.isArray(list) || list.length < 1 || list.length > CAPTURE_MAX_PROJECTS) {
    throw httpError(400, `projects must be an array of 1 to ${CAPTURE_MAX_PROJECTS} entries`);
  }
  const byCode = new Map<string, CaptureProject>();
  for (const item of list) {
    if (typeof item !== "object" || item === null) throw httpError(400, "each project must be an object");
    const { projectCode, title, agency } = item as Record<string, unknown>;
    if (typeof projectCode !== "string" || !/^\d{11}$/.test(projectCode)) {
      throw httpError(400, "projectCode must be an 11-digit project number");
    }
    for (const [name, v] of [["title", title], ["agency", agency]] as const) {
      if (v !== undefined && (typeof v !== "string" || v.length > CAPTURE_HINT_MAX)) {
        throw httpError(400, `${name} must be a string of at most ${CAPTURE_HINT_MAX} characters`);
      }
    }
    if (byCode.has(projectCode)) continue; // the first entry wins
    byCode.set(projectCode, {
      projectCode,
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof agency === "string" ? { agency } : {}),
    });
  }
  return [...byCode.values()];
}

/** POST /api/ingestion/capture — admin-selected process5 projects, created in the background. */
export async function createCaptureRun(req: Request, res: Response): Promise<void> {
  const projects = parseCaptureProjects(req.body);
  if (!gprocEnabled()) throw httpError(503, "The national e-GP source is disabled (GPROC_ENABLED=false)");

  await sweepStaleRuns("capture");
  const active = await IngestionRun.exists({ status: "running", phase: "capture" });
  if (active) throw httpError(409, "A capture run is already in progress");

  const run = await IngestionRun.create({
    trigger: "manual",
    triggeredBy: req.user!.id,
    phase: "capture",
    status: "running",
    stats: { torsFound: projects.length },
  });
  void captureProjects(run._id, projects, { gproc: new GprocClient(gprocConfigFromEnv()), storage: getStorage() }).catch(
    async (err) => {
      console.error("capture run failed:", err);
      await IngestionRun.updateOne(
        { _id: run._id },
        { $set: { status: "failed", completedAt: new Date(), outcomeSummary: `capture aborted: ${(err as Error).message}` } }
      );
    }
  );
  res.status(202).json({ runId: String(run._id), status: "running" });
}
```
Notes: de-duplication keeps the FIRST entry per code (the test expects `[{ projectCode: "69099312832" }]`). `getStorage()` may throw on a bad config; wrap it so a bad storage config returns `500`/`503` before the run row is created: call `const storage = getStorage();` before `IngestionRun.create` and pass it in. In the failure test `captureProjectsMock.mockRejectedValue` is caught by the `.catch` above.

Route: in `ingestionRoutes.ts` import `createCaptureRun` and add `router.post("/capture", createCaptureRun);`.

- [ ] **Step 3: Frontend phase type** — `frontend/src/lib/useIngestionRuns.ts`: `export type IngestionPhase = "discovery" | "enrichment" | "lifecycle" | "capture";` and add `capture: <same value as the discovery timeout>` to `POLL_TIMEOUT_MS`. Fix any other `Record<IngestionPhase, …>` or exhaustive switch the TypeScript compiler reports (`cd frontend && npx tsc --noEmit`); where the runs list shows a phase label, show `"ดึงผ่าน extension"` for `capture`. Do not add controls.

- [ ] **Step 4: Env and docs**
- `backend/.env.example` after the `GPROC_*` block:
  ```
  # Optional filter for TORs captured with the Chrome extension: comma-separated names a project's body or
  # unit (process5 deptName / deptSubName) must contain. Empty = capture every software-related project.
  CAPTURE_AGENCIES=
  ```
- `docs/deployment/gcp.md`: one paragraph: capture runs happen inside the API service (not a Cloud Run job) when an admin uses the extension; each project may download a ~10 MB bundle, so the service needs memory headroom and a request timeout is not involved (the route answers 202 and works in the background); `CAPTURE_AGENCIES` is optional; GPROC_ENABLED=false disables it (503).
- `CLAUDE.md`: a short "Capture from process5 (Chrome extension)" subsection under the lifecycle section: `extension/` (MV3, loaded unpacked by admins), `POST /api/ingestion/capture` (admin, ≤ 100 projects, 202 + `IngestionRun` phase `capture`), `ingestion/capture/` (`captureProjects`, `mapGprocTor`, `torFromBundle`), the TOR-file rule, `CAPTURE_AGENCIES`, the original-link rule (`resolveSourceListingUrl`).

- [ ] **Step 5: Verify and commit** — `cd backend && npm run typecheck && npx jest src/__tests__/ingestionRoutes.test.ts src/__tests__/envExample.test.ts --runInBand && npm test`; `cd ../frontend && npx tsc --noEmit && npx eslint src/lib/useIngestionRuns.ts src/components/admin/ScraperHealth.tsx`.

```bash
git add backend/src/controllers/ingestionController.ts backend/src/routes/ingestionRoutes.ts backend/src/__tests__/ingestionRoutes.test.ts backend/src/__tests__/envExample.test.ts backend/.env.example docs/deployment/gcp.md CLAUDE.md frontend/src/lib/useIngestionRuns.ts frontend/src/components/admin/ScraperHealth.tsx
git commit -m "feat(backend): add POST /api/ingestion/capture for admin-selected process5 projects"
```
(Run `git show --stat HEAD` and confirm every file listed above is in the commit.)

---

### Task 5: A lifecycle skip no longer pins a TOR to the head of the queue

**Files:**
- Modify: `backend/src/ingestion/lifecycle/refreshLifecycle.ts`
- Test: `backend/src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Failing test** — in the `"refreshLifecycle with process5"` describe of `refreshLifecycle.test.ts` (it already has `seedCode`, `fakeGproc`, `deps`, `fakeClient`):

```ts
it("a skipped TOR (no listing URL, process5 cannot answer) gets lastCheckedAt bumped so it does not stay first in the queue", async () => {
  const old = new Date("2026-09-01T00:00:00Z");
  const tor = await seedCode({ procurement: { stage: "inviting", announcements: [], lastCheckedAt: old, source: "gproc" } });
  const out = await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ detail: null }) }));
  expect(out).toMatchObject({ skipped: 1, failed: 0 });
  const saved = (await Tor.findById(tor.id).lean())?.procurement;
  expect(saved?.lastCheckedAt.getTime()).toBeGreaterThan(old.getTime());
  expect(saved?.stage).toBe("inviting"); // nothing else touched
  expect(saved?.source).toBe("gproc");
});

it("does not invent a procurement for a skipped TOR that has none", async () => {
  const tor = await seedCode();
  await refreshLifecycle(deps(fakeClient(), { gprocClient: fakeGproc({ detail: null }) }));
  expect((await Tor.findById(tor.id).lean())?.procurement ?? null).toBeNull();
});
```
Run → the first FAILS (lastCheckedAt not bumped).

- [ ] **Step 2: Implement** — in `refreshLifecycle.ts`, inside the `if (loaded === "skip") { skipped += 1; … }` branch, before the warning is logged, add:

```ts
          // Otherwise a TOR nobody can answer for keeps the oldest lastCheckedAt and sits at the head of the
          // oldest-first queue on every run. Only the check time moves; nothing else is touched.
          if (tor.procurement) {
            await Tor.updateOne({ _id: tor._id }, { $set: { "procurement.lastCheckedAt": now() } }, { timestamps: false });
          }
```
(`now` is the run's clock already in scope.)

- [ ] **Step 3: Verify and commit** — `cd backend && npm run typecheck && npx jest src/ingestion/lifecycle --runInBand && npm test`.

```bash
git add backend/src/ingestion/lifecycle/refreshLifecycle.ts backend/src/ingestion/lifecycle/__tests__/refreshLifecycle.test.ts
git commit -m "fix(backend): let a skipped lifecycle TOR move to the back of the queue"
```

---

### Task 6: The Chrome extension

**Files (all new, under `extension/`):**
- `manifest.json`, `parse.js`, `hook-main.js`, `collect.js`, `background.js`, `popup.html`, `popup.js`, `README.md`
- Test: `extension/test/parse.test.js`, `extension/test/fixtures/search-page-1.json`, `extension/package.json` (only `"scripts": { "test": "node --test test/" }`, no dependencies)

**Interfaces:**
- Produces: `parseSearchResults(body: unknown): { projectCode: string; title: string; agency: string }[]` (global `TorCapture.parseSearchResults` in the browser, `module.exports` under Node).

- [ ] **Step 1: Fixture** — create `extension/test/fixtures/search-page-1.json` with the recorded response (3 representative rows are enough): the real shape is `{"data":[{...},…],"response":{"responseCode":0,"responseDesc":""},"traceId":"…"}`. Use these rows verbatim (values copied from the real response): project `69099314442` (กรุงเทพมหานคร / สำนักงานพัฒนาระบบสารสนเทศดิจิทัล, "ประกวดราคาจ้างบำรุงรักษาระบบเครือข่ายและโปรแกรมประยุกต์ ตามโครงการจ้างพัฒนาระบบยืนยันและตรวจสอบตัวบุคคลในระบบดิจิทัล ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)", priceBuild 6399000.0), `69109064446` (สำนักงานปลัดสำนักนายกรัฐมนตรี / สำนักงานปลัดสำนักนายกรัฐมนตรี กรุงเทพฯ, "ประกวดราคาจ้างบำรุงรัการะบบเครือข่ายไร้สาย สปน. ประจำปีงบประมาณ พ.ศ. 2570 ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)"), `69089658201` (กรมพลศึกษา, "ประกวดราคาจ้างเหมาบำรุงรักษาระบบดับเพลิง …"), each with the full set of keys the real rows carry (`announceDate`, `announceType: "D0"`, `deptName`, `deptSubName`, `flowName`, `methodId: "16"`, `priceBuild`, `projectId`, `projectMoney`, `projectName`, `projectStatus: "A"`, `seqNo`, `stepId: "M03"`, …).

- [ ] **Step 2: Failing tests** — `extension/test/parse.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSearchResults } = require("../parse.js");
const sample = require("./fixtures/search-page-1.json");

test("extracts project number, title and agency from the recorded page", () => {
  const rows = parseSearchResults(sample);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    projectCode: "69099314442",
    title: sample.data[0].projectName,
    agency: "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล",
  });
});

test("returns [] for anything that is not the expected shape, never throws", () => {
  for (const bad of [undefined, null, 5, "x", [], {}, { data: null }, { data: "x" }, { data: [null, 5, "x"] }]) {
    assert.deepEqual(parseSearchResults(bad), []);
  }
});

test("skips rows whose projectId is not an 11-digit number and keeps the good ones", () => {
  const rows = parseSearchResults({ data: [{ projectId: "123", projectName: "a" }, { projectId: "69099314442", projectName: "b", deptSubName: "c" }] });
  assert.deepEqual(rows, [{ projectCode: "69099314442", title: "b", agency: "c" }]);
});

test("tolerates missing title/agency", () => {
  assert.deepEqual(parseSearchResults({ data: [{ projectId: "69099314442" }] }), [{ projectCode: "69099314442", title: "", agency: "" }]);
});
```
Run `cd extension && node --test test/` → FAIL.

- [ ] **Step 3: `parse.js`**

```js
// Pure parser for the process5 search response. Loaded as a classic script in the extension and by `node --test`.
(function (root) {
  function parseSearchResults(body) {
    try {
      const data = body && typeof body === "object" ? body.data : null;
      if (!Array.isArray(data)) return [];
      const out = [];
      for (const row of data) {
        if (!row || typeof row !== "object") continue;
        const id = typeof row.projectId === "string" ? row.projectId : "";
        if (!/^\d{11}$/.test(id)) continue;
        out.push({
          projectCode: id,
          title: typeof row.projectName === "string" ? row.projectName.trim() : "",
          agency: typeof row.deptSubName === "string" ? row.deptSubName.trim() : "",
        });
      }
      return out;
    } catch {
      return [];
    }
  }
  const api = { parseSearchResults };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TorCapture = Object.assign(root.TorCapture || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this);
```
Run the tests → PASS.

- [ ] **Step 4: Manifest and scripts**

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "TOR Aggregator – e-GP capture",
  "version": "0.1.0",
  "description": "Collect project numbers from the national e-GP search page and send them to the TOR Aggregator (admin only).",
  "permissions": ["storage"],
  "host_permissions": ["https://process5.gprocurement.go.th/*", "http://localhost:8000/*"],
  "optional_host_permissions": ["https://*/*", "http://*/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html", "default_title": "TOR capture" },
  "content_scripts": [
    {
      "matches": ["https://process5.gprocurement.go.th/egp-agpc01-web/announcement*"],
      "js": ["hook-main.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://process5.gprocurement.go.th/egp-agpc01-web/announcement*"],
      "js": ["parse.js", "collect.js"],
      "run_at": "document_start"
    }
  ]
}
```

`hook-main.js` (page world; only observes and re-posts the page's own search responses — it never issues a request and never reads the Turnstile token):
```js
(function () {
  const MARK = "tor-capture:search";
  // The page's own request: …/egp-oann10-service/pb/a-egp-allt-project/announcement?…&page=<n> (not a sub-path).
  const isSearch = (url) => {
    try {
      const u = new URL(url, location.href);
      return /\/a-egp-allt-project\/announcement$/.test(u.pathname) && u.searchParams.has("page");
    } catch {
      return false;
    }
  };
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      if (isSearch(url)) {
        p.then((res) => res.clone().json()).then((body) => window.postMessage({ mark: MARK, body }, "*")).catch(() => {});
      }
    } catch {}
    return p;
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (isSearch(String(url))) {
        this.addEventListener("load", () => {
          try { window.postMessage({ mark: MARK, body: JSON.parse(this.responseText) }, "*"); } catch {}
        });
      }
    } catch {}
    return open.call(this, method, url, ...rest);
  };
})();
```

`collect.js` (isolated world: parse, accumulate in `chrome.storage.local`, update the badge via the worker):
```js
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.mark !== "tor-capture:search") return;
  const rows = TorCapture.parseSearchResults(event.data.body);
  if (rows.length === 0) return;
  chrome.storage.local.get({ collected: {} }, ({ collected }) => {
    for (const r of rows) collected[r.projectCode] = r;
    chrome.storage.local.set({ collected }, () => chrome.runtime.sendMessage({ type: "collected", count: Object.keys(collected).length }));
  });
});
```

`background.js` (service worker): badge + the send flow.
```js
const MAX_PER_SEND = 100;
const POLL_MS = 3000;
const POLL_LIMIT = 200; // ~10 minutes

async function apiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: "http://localhost:8000" });
  return apiBase.replace(/\/$/, "");
}

async function send() {
  const { collected } = await chrome.storage.local.get({ collected: {} });
  const projects = Object.values(collected).slice(0, MAX_PER_SEND);
  if (projects.length === 0) return { ok: false, error: "ยังไม่มีโครงการที่เก็บไว้" };
  const base = await apiBase();
  const res = await fetch(`${base}/api/ingestion/capture`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projects }),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, error: "ต้องล็อกอินเป็นแอดมินในเว็บก่อน" };
  if (!res.ok) return { ok: false, error: `ส่งไม่สำเร็จ (${res.status})` };
  const { runId } = await res.json();
  for (let i = 0; i < POLL_LIMIT; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const r = await fetch(`${base}/api/ingestion/runs/${runId}`, { credentials: "include" });
    if (!r.ok) continue;
    const { run } = await r.json();
    if (run.status !== "running") {
      const done = projects.map((p) => p.projectCode);
      const left = Object.fromEntries(Object.entries(collected).filter(([code]) => !done.includes(code)));
      await chrome.storage.local.set({ collected: left });
      updateBadge(Object.keys(left).length);
      return { ok: true, status: run.status, summary: run.outcomeSummary, stats: run.stats };
    }
  }
  return { ok: false, error: "ยังประมวลผลไม่เสร็จ ลองดูผลในหน้าแอดมิน" };
}

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "collected") updateBadge(msg.count);
  if (msg.type === "send") {
    send().then(reply).catch((e) => reply({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async reply
  }
});
chrome.runtime.onStartup.addListener(() => chrome.storage.local.get({ collected: {} }, ({ collected }) => updateBadge(Object.keys(collected).length)));
```

`popup.html` + `popup.js`: a small page with: text "เก็บไว้ <N> โครงการ", a **ส่งเข้าระบบ** button (sends at most 100), a **ล้าง** button (clears `collected`), the result area (summary line from `run.outcomeSummary`), and an "API URL" field (default `http://localhost:8000`) with a **บันทึก** button that stores `apiBase` in `chrome.storage.sync` and calls `chrome.permissions.request({ origins: [<origin>/*] })` (needs the click). Thai labels; no remote scripts; inline script not allowed in MV3, so `popup.html` loads `popup.js`.

- [ ] **Step 5: README.md** — how to load it (`chrome://extensions` → Developer mode → Load unpacked → the `extension/` folder), the flow (search on process5 yourself, page through results, open the popup, press send), that it only observes the page's own responses and never calls the search itself, and a **manual verification checklist**: (1) the badge count grows when paging through results; (2) logged in as admin in the web app, Send returns a summary and TORs appear in the admin runs list as phase `capture`; (3) **cookie check**: if Send answers "ต้องล็อกอินเป็นแอดมินในเว็บก่อน" although you are logged in, Chrome did not send the `SameSite=Lax` session cookie from the extension — report it (fallback: an admin-generated token, not built yet); (4) not logged in → the same message; (5) `localhost:8000` default and how to point it at the deployed API.

- [ ] **Step 6: Verify and commit** — `cd extension && node --test test/` (all pass); `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"` (valid JSON). The extension itself is verified by hand (the README checklist); note in the report that this was not run in a browser.

```bash
git add extension
git commit -m "feat(extension): collect process5 search results and send them to the capture endpoint"
```

---

### Task 7: No fairness flags from an invitation, and a notice on the detail page

**Files:**
- Modify: `backend/src/ingestion/enrichment/torExtractor.ts`, `frontend/src/app/(site)/tor/[id]/page.tsx` (and `frontend/src/lib/torApi.ts` if the detail type needs the field)
- Test: `backend/src/ingestion/enrichment/__tests__/torExtractor.test.ts` (the existing test file for `applyExtractionToTor`; add to it)

**Interfaces:**
- Consumes: `ISourceDocument.kind` (Task 2).
- Produces: `applyExtractionToTor` leaves `fairnessFlags` empty when `tor.sourceDocument?.kind === "invitation"`.

- [ ] **Step 1: Failing test** — in the existing `applyExtractionToTor` tests add (use the file's existing helpers for a hydrated `Tor` and a software-related extraction result that includes at least one fairness signal):

```ts
it("produces no fairness flags when the source document is only the invitation", () => {
  const tor = hydratedTor({ sourceDocument: { egpUrl: "x", filename: "69099312832-invitation.pdf", storageKey: "k", textLayer: "digital", pageCount: 1, byteSize: 1, sha256: "s", fetchedAt: new Date(), kind: "invitation" } });
  applyExtractionToTor(tor, resultWithFairnessSignal(), { extractorId: "t", fallbackText: "" });
  expect(tor.pipelineStatus).toBe("enriched");
  expect(tor.fairnessFlags).toHaveLength(0);
});

it("keeps fairness flags for a TOR document (kind tor or unset)", () => {
  const tor = hydratedTor({});
  applyExtractionToTor(tor, resultWithFairnessSignal(), { extractorId: "t", fallbackText: "" });
  expect(tor.fairnessFlags.length).toBeGreaterThan(0);
});
```
(`hydratedTor` / `resultWithFairnessSignal` are the names to use for whatever the file already builds; adapt to its helpers.) Run → the first FAILS.

- [ ] **Step 2: Implement** — in `applyExtractionToTor`, replace the final `tor.fairnessFlags = result.fairnessSignals.map(...)` assignment with:

```ts
  // An invitation announcement has no scope of work, so the model has nothing to judge fairness on:
  // never publish signals from it. They appear when a later capture upgrades the document to the TOR.
  const signals = tor.sourceDocument?.kind === "invitation" ? [] : result.fairnessSignals;
  tor.fairnessFlags = signals.map((s) => ({
    field: s.field,
    severity: s.severity,
    message: s.message,
    detectedAt: now,
    status: "open",
  })) as unknown as typeof tor.fairnessFlags;
```

- [ ] **Step 3: Notice on the detail page** — the detail response already carries `sourceDocument` (only its `storageKey`/`sha256` are excluded). Add `sourceDocument?: { kind?: "tor" | "invitation" }` to the raw/detail type in `frontend/src/lib/torApi.ts` and pass it through to the TOR type used by the page. In `tor/[id]/page.tsx`, next to the AI summary heading (or the summary card) show, only when `tor.sourceDocument?.kind === "invitation"`, one muted line: `สรุปจากประกาศเชิญชวน (ยังไม่มีเอกสารขอบเขตงาน TOR)`, styled like the page's other muted notes (`text-[11px] leading-relaxed text-[var(--color-text-muted)]`). No other UI change.

- [ ] **Step 4: Verify and commit** — `cd backend && npm run typecheck && npx jest src/ingestion/enrichment --runInBand && npm test`; `cd ../frontend && npx tsc --noEmit && npx eslint "src/app/(site)/tor/[id]/page.tsx" src/lib/torApi.ts`.

```bash
git add backend/src/ingestion/enrichment/torExtractor.ts backend/src/ingestion/enrichment/__tests__/torExtractor.test.ts "frontend/src/app/(site)/tor/[id]/page.tsx" frontend/src/lib/torApi.ts
git commit -m "feat(backend): never publish fairness flags from an invitation-only summary"
```

---

## Self-Review (against the spec)

- **Spec coverage:** (invitation fallback, upgrade and no-fairness: Tasks 2, 3, 7) extension behaviour (observe responses, accumulate, send ≤ 100 on click, popup, background with cookie) → Task 6; `POST /capture` contract, 202 + `IngestionRun` phase `capture`, 409, validation, admin only → Task 4; per-project flow incl. skip-only hints, `CAPTURE_AGENCIES`, keyword gate, create TOR, TOR file from bundle (draft then published), no enqueue without a file, retry of a stuck gproc TOR, breaker → Task 3 (+ Task 1 for the bundle, Task 2 for mapping/storing); TOR file rule and caps → Task 1; source-aware original link → Task 2; lifecycle queue fix → Task 5; docs/env → Task 4. Not built (as in the spec): admin-token fallback for the cookie (documented in the README checklist), several invitations, v2 TOR variants.
- **Placeholders:** the "write it fully against the file's existing helpers" instruction in Task 2 (exposure test) and the popup description in Task 6 are the two places that describe rather than show; their assertions/elements are listed explicitly.
- **Type consistency:** `GprocCaptureClientLike` (Task 1) is what `captureProjects` takes (Task 3) and what `GprocClient` is passed as (Task 4); `mapGprocTor` returns `{ set, sourceContentHash, procurement, unknownCodes }` as consumed in Task 3; `storeTorPdf(tor, buf, meta, deps)` is used identically in Task 2 and Task 3; `CaptureProject` (Task 3) is what the controller produces (Task 4) and the extension sends (`{ projectCode, title, agency }`, Task 6); `resolveSourceListingUrl` and `gprocProjectUrl` (Task 2) are defined once.
- **Known cost, accepted:** every captured relevant project downloads one bundle (~10 MB) inside the API process; capped at 100 projects per run and 50 MB per bundle.
