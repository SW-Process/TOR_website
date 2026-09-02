# TOR Ingestion Backend — Design

**Date:** 2026-08-28
**Branch:** `feat/tor-ingestion` (off `main`)
**Status:** Approved for implementation planning

## 1. Context & Goal

The backend (now TypeScript, `origin/main`) has auth and the 8 Mongoose models but
no data ingestion. `munyin.py` was a throwaway prototype that proved out the Bangkok
e-GP public API and produced `data/manifest.jsonl`. This phase builds the real
ingestion path **in the TS backend**: pull software-procurement TORs from e-GP,
upsert them into the `tors` collection, and fetch + store each TOR's source PDF so
later stages (OCR, AI summary, fairness) have the bytes to work with.

Implements the ingestion half of UC-01 and FR-04 / FR-05 / FR-06 / FR-11, plus the
run-history side of FR-34.

## 2. Scope

**In scope**

- TS port of the e-GP client (`munyin.py`'s `Client`)
- Manual, admin-triggered ingestion run that upserts `Tor` documents
- Download the `ร่างขอบเขตของงาน (TOR)` PDF for each project into a swappable blob store
- Inspect each PDF's text layer (`digital` / `scanned` / `unreadable` / `missing`)
- `IngestionRun` + `SystemLog` records for observability (FR-34, FR-37/38)
- Read endpoints for run history; a stream endpoint for the stored PDF
- Jest tests

**Out of scope (designed for, not built)**

OCR, text extraction, AI summary, fairness scoring, embeddings, `similarTORs`,
notifications, cron scheduler, queue/worker infra, real GCS driver, pruning TORs
that vanish from e-GP, any frontend work, the frontend's separate Mongoose models.

## 3. Key decision: download the PDF, do not hot-link

Store our own copy of the TOR PDF (keep the e-GP URLs too):

1. The product's core features need the file bytes. `munyin.py` measured ~93% of
   TOR PDFs as scans with no text layer, so OCR — which needs the bytes — is the
   main extraction path, not a fallback.
2. e-GP has no official public API contract; file URLs can rot or change. A dead
   URL means the source document is lost. FR-05 requires storing the PDF *and* a
   link back to the listing.
3. `Tor.sourceDocumentUrl` was always intended as a blob-store reference
   (see the comment in `models/Tor.ts`).
4. Serving users from our store avoids hot-linking load on a government portal
   (NFR-07) and broken downloads when e-GP is down.

## 4. Architecture

In-process orchestrator triggered by an admin endpoint. The endpoint creates an
`IngestionRun`, returns its id immediately (HTTP 202), and the run continues in the
background writing progress to that document. No queue, no cron this phase; the
per-project work is factored so a future Pub/Sub consumer can call it unchanged.

### New files (all `backend/src/`)

| File | Responsibility |
|---|---|
| `scraper/egpClient.ts` | Polite HTTP client over `egp2.bangkok.go.th` — real UA, request delay, retry w/ backoff, timeout, sequential |
| `scraper/egpClient.types.ts` | Interfaces for the e-GP JSON responses used |
| `ingestion/mapProject.ts` | Pure fn: `(project, detail, announcements) → MappedProject` |
| `ingestion/pdfInspect.ts` | `(Buffer) → { pageCount, textLayer }` via `pdf-parse` |
| `ingestion/log.ts` | `logEvent(...)` → writes a `SystemLog` with `source: "ingestion"`; never throws |
| `ingestion/runIngestion.ts` | Orchestrator: search → per-project upsert → fetch PDF → finalize run |
| `storage/storage.types.ts` | `BlobStorage` interface |
| `storage/localDiskStorage.ts` | Writes under `STORAGE_LOCAL_DIR`; `publicUrl` → `null` |
| `storage/gcsStorage.ts` | Stub wired to `STORAGE_DRIVER=gcs`; throws "not implemented" until the GCS phase |
| `storage/index.ts` | `getStorage()` — memoized, switches on `STORAGE_DRIVER` (default `local`) |
| `controllers/ingestionController.ts` | `POST /runs`, `GET /runs`, `GET /runs/:id` |
| `routes/ingestionRoutes.ts` | Mounts the above under `/api/ingestion`, all `requireAuth, requireRole("admin")` |
| `controllers/torDocumentController.ts` | `GET /api/tors/:id/document` — stream the stored PDF |
| `routes/torRoutes.ts` | One route for now (`/:id/document`); tor search/detail come later |

### Changed files

- `models/Tor.ts` — new fields (§6)
- `models/index.ts` — re-export the new `Tor` types
- `app.ts` — `app.use("/api/ingestion", ingestionRoutes)` and `app.use("/api/tors", torRoutes)` before `notFound`
- `.env.example` — new vars (§10)
- `backend/.gitignore` — add `/storage`
- `package.json` — add `pdf-parse` (+ `@types/pdf-parse` dev)

## 5. e-GP API surface (ported from `munyin.py`)

Base URLs and the TOR announcement-type id move to env / a constants module.

- `GET {EGP_API_BASE}/Projects/GetProjectFromFilter`
  params: `projectSearchText`, `masterAnnounceTypeId`, `startDate`, `endDate`,
  `pageNo`, `pageSize`, `sortBy=publishDateDesc`
  → `{ totalCount, hasNextPage, data: [{ projectId, projectNumber, ... }] }`
- `GET {EGP_API_BASE}/Projects/GetProjectDetail?projectId=`
  → `{ projectName, masterOrgGroupName, masterOrgDepartmentName, projectBudget,
     projectAverageBudget, masterMethodIdName, masterTypeIdName, masterGoodsIdName,
     masterContractAvailableName }`
- `GET {EGP_API_BASE}/ProjectAnnouncements/GetAnnouncementDetailInProject?pageNo=1&pageSize=50&projectId=`
  → `{ data: [{ id, masterAnnounceTypeName, projectAnnouncementPublishDate,
     projectAnnouncementPath }] }`
- File: `GET {EGP_FILE_BASE}/{announcementId}/{encodeURIComponent(filename)}` → binary
- Listing URL for a project: `{EGP_LISTING_BASE}/{projectId}`
- `TOR_TYPE_ID = "24995aa2-d875-4d3d-9dec-d5e22d222aa4"` (masterAnnounceTypeId for ร่างขอบเขตของงาน)

**TOR announcement selection:** the announcement whose `masterAnnounceTypeName`
starts with `"ร่างขอบเขตของงาน"`. If a project has none, no PDF is fetched and an
ingest error is recorded on the run.

Politeness settings carried over: sequential requests (concurrency 1),
`EGP_REQUEST_DELAY_MS` between calls, `EGP_MAX_RETRIES` with exponential backoff,
`EGP_TIMEOUT_MS` per request, honest `EGP_USER_AGENT`.

## 6. Data model changes — `models/Tor.ts`

Add to `ITor` and `torSchema`:

| Field | Type | Notes |
|---|---|---|
| `referencePrice` | `number` (min 0) | ราคากลาง (`projectAverageBudget`) — fairness compares budget vs reference price |
| `sourceListingUrl` | `string` | Link back to the e-GP project page (FR-05) |
| `procurementMethod` | `string` | `masterMethodIdName` |
| `procurementType` | `string` | `masterTypeIdName` |
| `goodsCategory` | `string` | `masterGoodsIdName` |
| `sourceContentHash` | `string`, indexed | sha256 of the canonicalised detail JSON; drives create vs update vs unchanged |
| `sourceDocument` | embedded subdoc, `_id: false`, default `null` | see below |

```ts
interface ISourceDocument {
  egpUrl: string;              // original e-GP file URL
  filename: string;            // projectAnnouncementPath
  storageKey: string | null;   // blob key; null when the file could not be fetched
  textLayer: "digital" | "scanned" | "unreadable" | "missing";
  pageCount: number | null;
  byteSize: number | null;
  sha256: string | null;
  fetchedAt: Date;
}
```

`sourceDocumentUrl` (existing) is kept and set to `storage.publicUrl(key)` when the
driver exposes one, else the relative API path `/api/tors/<id>/document`.

`IngestionRun` and `SystemLog` schemas are **unchanged**. "Unchanged" projects are
simply not counted in `stats` (no `torsSkipped` field added this phase).

### Field mapping (e-GP → `Tor`)

| Tor field | Source | Set this phase? |
|---|---|---|
| `title` | `detail.projectName` | yes (required) |
| `agency` | `detail.masterOrgGroupName` | yes |
| `department` | `detail.masterOrgDepartmentName` | yes |
| `projectCode` | `project.projectNumber` | yes (unique key) |
| `budget` | `detail.projectBudget` | yes |
| `referencePrice` | `detail.projectAverageBudget` | yes |
| `announcementDate` | earliest TOR-kind `projectAnnouncementPublishDate` | yes |
| `sourceListingUrl` | `{EGP_LISTING_BASE}/{projectId}` | yes |
| `procurementMethod/Type`, `goodsCategory` | `masterMethodIdName` / `masterTypeIdName` / `masterGoodsIdName` | yes |
| `sourceDocument`, `sourceDocumentUrl`, `sourceContentHash` | computed | yes |
| `description` | — | no (needs extraction) |
| `submissionDeadline` | not in this API | no — left `undefined`; `status` stays default `"open"` |
| `technologyStack`, `projectType`, `qualificationRequirements`, `evaluationCriteria`, `location` | — | no (classifier / extraction stages) |
| `aiSummary`, `fairnessFlags`, `similarTORs` | — | no |
| `ingestionRunId` | current run `_id` | yes |

## 7. Ingestion run flow — `runIngestion`

Signature:

```ts
runIngestion(opts: {
  trigger: "manual" | "scheduled";
  triggeredBy: Types.ObjectId | null;
  maxProjects: number;          // 1..500
  searchText: string;           // default from INGEST_DEFAULT_SEARCH
  announceAllTypes?: boolean;   // default false → restrict to TOR_TYPE_ID
}): Promise<{ runId: string }>
```

1. `run = await IngestionRun.create({ trigger, triggeredBy, status: "running" })`.
   Return `{ runId: run.id }` to the caller; the rest runs after the response.
2. Page through `searchProjects` until `maxProjects` reached or `hasNextPage` is
   false; slice to `maxProjects`. `run.stats.torsFound = projects.length`.
3. For each project — `processProject(project, run._id)`:
   - `detail = projectDetail(projectId)`, `anns = announcements(projectId)`
   - `mapped = mapProject(project, detail, anns)`
   - `existing = await Tor.findOne({ projectCode: mapped.projectCode })`
     - none → `Tor.create({ ...mapped.set, sourceContentHash, ingestionRunId })` → `torsCreated++`
     - hash differs → `existing.set({ ...mapped.set, sourceContentHash, ingestionRunId }); save()` → `torsUpdated++`
     - hash equal → leave as-is
   - if `mapped.torAnnouncement` → `fetchAndStoreTorPdf(tor, mapped.torAnnouncement, runId)`
     else → `logEvent(warning, "no TOR document on project", runId)`
   - each `mapped.ingestErrors[]` → `logEvent(warning, …, runId)`
   - any thrown error → `torsFailed++`, `logEvent(error, "project <n> failed: <msg>", runId, { stack })`, continue
4. Finalize: `completedAt = now`;
   `status = torsFailed === 0 ? "success" : torsFailed === torsFound ? "failed" : "partial"`;
   `outcomeSummary = "found N, created N, updated N, failed N"`; `save()`;
   `logEvent(info, outcomeSummary, runId)`.
5. A fatal error before the loop (e.g. search endpoint down) → `run.status = "failed"`,
   `outcomeSummary = err.message`, `logEvent(error, …)`.

`processProject` never throws out; it is the unit a future queue consumer would call.

### `fetchAndStoreTorPdf(tor, ann, runId)`

```
buf = await egp.downloadFile(ann.announcementId, ann.filename)      // may throw
sha256 = sha256(buf)
{ pageCount, textLayer } = await pdfInspect(buf)                    // never throws
key = `tor-pdfs/${tor.projectCode}/${ann.announcementId}.pdf`
await storage.put(key, buf, { contentType: "application/pdf" })
tor.sourceDocument = { egpUrl: ann.egpUrl, filename: ann.filename, storageKey: key,
                       textLayer, pageCount, byteSize: buf.length, sha256, fetchedAt: now }
tor.sourceDocumentUrl = storage.publicUrl(key) ?? `/api/tors/${tor.id}/document`
await tor.save()
```

On download failure: `logEvent(error, …, runId)`, set
`tor.sourceDocument = { egpUrl, filename, storageKey: null, textLayer: "missing",
pageCount: null, byteSize: null, sha256: null, fetchedAt: now }`, `save()`. The
`Tor` is kept but explicitly marked as having no recoverable document (FR-11).

## 8. `pdfInspect`

```ts
const TEXT_LAYER_MIN_CHARS_PER_PAGE = 200; // same threshold as munyin.py

async function pdfInspect(buf: Buffer): Promise<{
  pageCount: number | null;
  textLayer: "digital" | "scanned" | "unreadable";
}> {
  try {
    const data = await pdfParse(buf);
    const pages = data.numpages || 0;
    const perPage = pages ? data.text.length / pages : 0;
    return { pageCount: pages || null,
             textLayer: perPage >= TEXT_LAYER_MIN_CHARS_PER_PAGE ? "digital" : "scanned" };
  } catch {
    return { pageCount: null, textLayer: "unreadable" };
  }
}
```

`pdf-parse` is pure JS (wraps pdf.js). It is isolated here; if it proves unreliable
on Thai scans, swap the internals for `pdfjs-dist` without touching callers.

## 9. Storage adapter

```ts
interface BlobStorage {
  put(key: string, body: Buffer, opts: { contentType: string }): Promise<{ key: string; size: number }>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string | null;
}
```

- Key scheme: `tor-pdfs/<projectNumber>/<announcementId>.pdf`
- `localDiskStorage`: root `STORAGE_LOCAL_DIR` (default `./storage`), `mkdir -p` on
  `put`, `publicUrl` → `null`. `/storage` is gitignored.
- `gcsStorage`: constructor/methods throw `"gcs storage not implemented"` until the
  GCS phase; keeps `STORAGE_DRIVER=gcs` a one-line switch later
  (`@google-cloud/storage`, `GCS_BUCKET`).
- `getStorage()` in `storage/index.ts` memoises one instance, chosen by
  `process.env.STORAGE_DRIVER ?? "local"`.

## 10. Endpoints

All ingestion routes: `requireAuth, requireRole("admin")`. Errors via `httpError()` +
central `errorHandler`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| POST | `/api/ingestion/runs` | `{ maxProjects?: 1..500 = 50, searchText? = INGEST_DEFAULT_SEARCH, announceAllTypes? = false }` | `202 { runId, status: "running" }` — run continues in background |
| GET | `/api/ingestion/runs` | `?limit=1..100 = 20` | `200 { runs: IngestionRun[] }` sorted `startedAt: -1` |
| GET | `/api/ingestion/runs/:id` | — | `200 { run }` or `404` |
| GET | `/api/tors/:id/document` | — | `200` PDF stream (`Content-Type: application/pdf`, `Content-Disposition: inline`) / `404` if no `sourceDocument.storageKey` |

`GET /api/tors/:id/document` is **public** (TORs are public data). The controller
loads the `Tor`, then `storage.getStream(sourceDocument.storageKey)` piped to the
response.

The `POST` handler validates the body, calls `runIngestion({ trigger: "manual",
triggeredBy: req.user!.id, ... })`, and responds with the returned `runId`.
`runIngestion` starts its own background continuation; the handler does not await
the crawl.

## 11. Config — `.env.example` additions

```
# Ingestion / e-GP scraper
EGP_API_BASE=https://egp2.bangkok.go.th/appapi/api
EGP_FILE_BASE=https://egp2.bangkok.go.th/api/file
EGP_LISTING_BASE=https://egp2.bangkok.go.th/project-detail
EGP_USER_AGENT=BkkTorAggregator/0.1 (Kasetsart University project; <contact-email>)
EGP_REQUEST_DELAY_MS=400
EGP_MAX_RETRIES=4
EGP_TIMEOUT_MS=120000
INGEST_DEFAULT_SEARCH=ซอฟต์แวร์
INGEST_DEFAULT_MAX_PROJECTS=50

# Blob storage
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage
# GCS_BUCKET=
```

## 12. MongoDB free tier (Atlas M0, 512 MB)

Fine for this phase and well beyond. PDF binaries go to the blob store, not Mongo.
Each `Tor` document is a few KB of text even with `aiSummary` + `fairnessFlags`
embedded — 512 MB is on the order of tens of thousands of TORs. The things that
would pressure M0 later are (a) embedding vectors and (b) full extracted PDF text
stored in Mongo. Mitigation for those stages: store extracted text in the blob
store too and keep only a short snippet + vector reference in Mongo. Rule of thumb:
binaries and long text never go in Mongo.

## 13. Testing (Jest + ts-jest, `src/__tests__/`)

Fixtures: capture 2–3 real e-GP responses (search page, project detail,
announcements) into `src/__tests__/fixtures/egp/` plus a small digital PDF and an
image-only PDF into `src/__tests__/fixtures/pdf/`.

- `mapProject.test.ts` — payload fields, `sourceContentHash` stable across calls and
  changes when detail changes, correct TOR announcement chosen, `ingestErrors` when
  no TOR announcement present.
- `pdfInspect.test.ts` — digital fixture → `"digital"`; image-only → `"scanned"`;
  non-PDF buffer → `"unreadable"`.
- `localDiskStorage.test.ts` — `put` → `exists` → `getStream` round trip under
  `os.tmpdir()`.
- `runIngestion.test.ts` — `jest.mock("../scraper/egpClient")` returning fixtures,
  run against `mongodb-memory-server`:
  - first run: creates N `Tor` docs, `IngestionRun.status === "success"`,
    `SystemLog` info summary present
  - second run, same fixtures: 0 created / 0 updated (hash match)
  - one fixture mutated: 1 updated
  - a project whose detail fetch throws: `torsFailed` incremented, `status`
    `"partial"`, error `SystemLog` written, other projects still processed
- `ingestionRoutes.test.ts` (supertest) — `401` without cookie, `403` as vendor,
  `202 { runId }` as admin (with `runIngestion` mocked).

`npm test` already runs `jest --runInBand`.

## 14. Dependencies

Add: `pdf-parse`; dev `@types/pdf-parse`. All test tooling
(`jest`, `ts-jest`, `mongodb-memory-server`, `supertest`) is already present.

## 15. Future-proofing (not built now)

- **Cron:** `runIngestion` already accepts `trigger: "scheduled"` +
  `triggeredBy: null`; a `node-cron` job (or Cloud Scheduler → the same endpoint)
  is an additive change.
- **Queue:** `processProject(project, runId)` is the natural per-message unit for a
  Pub/Sub consumer.
- **OCR / AI stages:** `sourceDocument.textLayer` tells the next stage whether to
  OCR; `sourceContentHash` is the idempotency key for downstream jobs.

## 16. Assumptions

1. The e-GP endpoints, params, and `TOR_TYPE_ID` in `munyin.py` are current and can
   be ported as-is.
2. This work branches off `main` (which has the TS backend + auth + Jest).
3. Only the `ร่างขอบเขตของงาน (TOR)` announcement is stored; other announcement
   types (ราคากลาง, ประกาศเชิญชวน, ร่างเอกสารประกวดราคา) are ignored this phase.
4. No auth changes; an admin account already exists (or is created via
   `npm run create-admin`).
5. `pdf-parse` is acceptable for text-layer detection; swappable if not.
