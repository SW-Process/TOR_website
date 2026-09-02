# TOR Enrichment Pipeline, Agency Filter & GCP Deploy — Design

**Date:** 2026-08-31
**Branch:** `feat/11-feature-backend-tor-scraper-bangkok-filter` (assumes `feat/tor-ingestion` is merged first — see §2)
**Status:** Reviewed — decisions in §16 folded in; ready for implementation planning

## 1. Context & Goal

`feat/tor-ingestion` (16 commits, 64 Jest tests, reviewed) already implements the
first half of TOR ingestion in the TS backend:

- `scraper/egpClient.ts` — polite read-only client over the Bangkok e-GP public API
  (`egp2.bangkok.go.th`), ported from `munyin.py`
- `ingestion/mapProject.ts` — pure e-GP → `Tor` payload mapper with a
  `sourceContentHash` idempotency key
- `ingestion/runIngestion.ts` — admin-triggered orchestrator: search → per-project
  upsert → fetch + store the `ร่างขอบเขตของงาน (TOR)` PDF → finalize an `IngestionRun`
- `ingestion/pdfInspect.ts` — text-layer detection (`digital` / `scanned` / `unreadable`)
- `storage/` — `BlobStorage` interface, local-disk driver, GCS **stub**
- `IngestionRun` + `SystemLog` observability; `GET /api/tors/:id/document` PDF stream

What that phase deliberately left as *designed-for, not built*: OCR / AI extraction,
classification, categorization, similar-TOR grouping, cron/queue infra, the real GCS
driver, and the public TOR search/detail API.

This phase builds that remainder:

1. A **durable per-item enrichment queue** (`EnrichmentJob`) for the slow, paid,
   failure-prone AI step — the one place the current in-process batch model is
   genuinely fragile.
2. **Vertex AI (Gemini) extraction** — one multimodal call per TOR that classifies
   software-relatedness, writes the summary/qualification/evaluation fields, and
   assigns a taxonomy category.
3. **Agency filtering** — restrict ingestion to a configured allowlist of Bangkok
   agencies (the `feat/11` branch's purpose).
4. **Public read API** — `GET /api/tors` list + filters + pagination,
   `GET /api/tors/:id` detail, `GET /api/tors/price-stats` for price comparison.
5. **GCP batch deployment** — two Cloud Run Jobs (discovery, enrichment) on Cloud
   Scheduler, a Cloud Run Service for the API, MongoDB Atlas M0, GCS for PDFs,
   Vertex via Application Default Credentials.

Non-goals this phase: fairness scoring, notifications, embeddings / vector search,
the frontend, real-time (sub-hour) freshness, pruning TORs that vanish from e-GP,
promoting the agency allowlist to a `DataSource` collection.

## 2. Prerequisite & assumptions

1. **`feat/tor-ingestion` is merged to `main` before this work starts** (or this
   branch is rebased onto it). Every file in §1 is a prerequisite. If the merge is
   not wanted, this design does not apply as written.
   - It merges **as-is** — reviewed, 64 Jest tests green. No code change is a merge
     blocker. Its functional gaps (no agency filter, no date window, an in-process
     `void done.catch()` continuation) are this phase's work, not fixes to make first.
   - Two carry-over items from its own SDD ledger, to clear at merge time, not here:
     (a) eyeball the two committed fixture PDFs
     (`backend/src/ingestion/__tests__/fixtures/pdf/`) for PII before pushing;
     (b) a queued follow-up PR for the ledger's "minor (deferred)" findings —
     independent of this design.
2. The Bangkok e-GP endpoints, params, and `TOR_TYPE_ID` remain current.
3. A Google Cloud project with billing enabled exists (free trial credit is fine).
   Vertex AI API and Cloud Run are enabled.
4. `pdf-parse` stays acceptable for text-layer detection; Gemini does the real OCR.
5. Backend stays TypeScript + Jest; `npm test` runs `jest --runInBand`.

## 3. Architecture

Two batch entrypoints plus the existing API service. Nothing runs always-on.

```
Cloud Scheduler  ──(cron ~1h)──▶  Cloud Run Job: tor-discovery
                                    └─ runIngestion({trigger:"scheduled"}) then AWAIT done
                                       search ▸ agency filter ▸ upsert Tor ▸ store PDF
                                       ▸ enqueue EnrichmentJob (on create / hash change)
                                       ▸ exit 0

Cloud Scheduler  ──(cron ~15m)─▶  Cloud Run Job: tor-enrichment
                                    └─ drainEnrichmentQueue()
                                       claimNextJob (lease) ▸ Gemini call ▸ write Tor
                                       ▸ mark job done/failed/rejected ▸ repeat until empty
                                       ▸ exit 0

           MongoDB Atlas M0 ◀── both jobs + API  (tors, enrichmentjobs, ingestionruns, systemlogs)
           GCS bucket        ◀── discovery writes PDFs, API streams them

Cloud Run Service: tor-api  (scale-to-zero)
    GET /api/tors            GET /api/tors/:id
    GET /api/tors/:id/document   GET /api/tors/price-stats
    POST/GET /api/ingestion/runs  (admin, unchanged)
```

### Why this shape

- **Discovery = idempotent batch.** `sourceContentHash` makes a re-scan cheap; a
  crashed run is recovered by the next scheduled run re-scanning the same window.
  No queue needed here.
- **Enrichment = durable queue.** One Gemini call per TOR is paid, 10–120 s, rate
  limited, and transiently failable. A crash at item 180 of 200 must not lose the
  179 done or redo them. `EnrichmentJob` gives per-item status + lease + retry —
  without Redis / BullMQ / Pub-Sub; a Mongo collection with a claim query is enough.
- **Separation** lets the two run on different cadences and be tuned/scaled apart.

## 4. New model — `EnrichmentJob` (`models/EnrichmentJob.ts`)

```ts
export type EnrichmentJobStatus = "queued" | "processing" | "done" | "failed" | "rejected";

export interface IEnrichmentJob {
  torId: Types.ObjectId;              // ref "Tor", unique
  status: EnrichmentJobStatus;
  sourceContentHash: string;          // the Tor hash this job targets; re-enqueue when it changes
  attempts: number;                   // default 0
  maxAttempts: number;                // default 5
  lockedBy: string | null;
  lockedUntil: Date | null;
  nextRunAt: Date;                    // default Date.now; retry backoff sets this forward
  lastError: { message: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes: `{ torId: 1 }` unique; `{ status: 1, nextRunAt: 1, lockedUntil: 1 }`.

`repositories/enrichmentJobRepo.ts` (pattern lifted from TORPulse's
`ingestion-job.repository.ts`):

| fn | behaviour |
|---|---|
| `enqueue(torId, hash)` | `upsert` by `torId`. On insert or when `sourceContentHash` differs: set `status:"queued"`, `attempts:0`, `nextRunAt:now`, clear lock + `lastError`, set `sourceContentHash`. On an unchanged hash with a terminal status: leave it. |
| `claimNext(workerId)` | atomic `findOneAndUpdate`: match `attempts < maxAttempts` AND (`status:"queued"` OR (`status:"processing"` AND `lockedUntil <= now`) OR (`status:"failed"` AND `nextRunAt <= now`)); set `status:"processing"`, `lockedBy`, `lockedUntil = now + LEASE_MS` (10 min), `$inc attempts`; sort `nextRunAt:1, createdAt:1`; `returnDocument:"after"`. |
| `complete(jobId, workerId, outcome)` | guarded by `lockedBy`; `status = outcome` (`"done"` \| `"rejected"`), clear lock, clear `lastError`. |
| `fail(jobId, workerId, err)` | guarded by `lockedBy`; if `attempts < maxAttempts` → `status:"failed"`, `nextRunAt = now + min(60s * 5^(attempts-1), 2h)`; else `status:"failed"`, `nextRunAt` far future (dead-letter). Record `lastError`. |
| `renew(jobId, workerId)` | optional lease extension for long Gemini calls; push `lockedUntil` forward. |

A stale `processing` job (worker died) is reclaimable once `lockedUntil` passes —
no boot-time sweep needed, unlike `IngestionRun`.

## 5. `Tor` model additions (`models/Tor.ts`)

The current schema already carries `aiSummary` (embedded: `keyPoints`,
`qualifications`, `evaluationCriteria[]`, `confidence`, `model`, `generatedAt`),
`fairnessFlags`, `similarTORs: ObjectId[]`, `technologyStack`,
`qualificationRequirements`, `submissionDeadline`, `referencePrice`, `budget`,
`sourceContentHash`. Add:

| Field | Type | Notes |
|---|---|---|
| `category` | `string` enum (§7 taxonomy) + `"other"`, `index` | primary group for filtering + price comparison |
| `categoryTags` | `[String]`, default `[]`, `index` | secondary labels |
| `taxonomyVersion` | `string` | which taxonomy revision produced `category` (re-categorize aware) |
| `classification` | embedded `_id:false`, default `null` | `{ isSoftwareRelated: boolean; reason: string; confidence: number; model: string; at: Date }` |
| `pipelineStatus` | `string` enum, default `"pending"`, `index` | `pending` → `processing` → `enriched` \| `rejected` \| `failed` |

`pipelineStatus` semantics: `pending` = Tor exists, enrichment not done;
`enriched` = Gemini done and software-related; `rejected` = Gemini done, not
software-related (row kept for audit, hidden from all public reads);
`failed` = Gemini errored past `maxAttempts`.

`aiSummary.model` doubles as the extractor-id provenance (no separate field).
`similarTORs` is the existing hook for a future "find similar" feature — untouched
this phase.

### Field mapping (Gemini result → `Tor`)

| Tor field | from |
|---|---|
| `classification` | `{ isSoftwareRelated, classificationReason → reason, confidence, model, at:now }` |
| `pipelineStatus` | `isSoftwareRelated ? "enriched" : "rejected"` |
| `description` | `summary` |
| `aiSummary.keyPoints` | `keyPoints` |
| `aiSummary.qualifications` | `qualifications` |
| `aiSummary.evaluationCriteria` | `evaluationCriteria[] {label, weight?}` |
| `aiSummary.confidence` | bucket `confidence` → `high` (≥0.8) / `medium` (≥0.5) / `low` |
| `aiSummary.model`, `aiSummary.generatedAt` | extractor id, `now` |
| `technologyStack` | `technologyStack` |
| `qualificationRequirements` | `qualifications` (flat list, kept for filtering) |
| `submissionDeadline` | `submissionDeadline` parsed to `Date` only when unambiguous, else left unset |
| `category`, `categoryTags`, `taxonomyVersion` | `category`, `categoryTags`, current taxonomy version |

Structured (non-AI) fields — `title`, `agency`, `department`, `budget`,
`referencePrice`, `procurementMethod/Type`, `goodsCategory`, `announcementDate`,
`sourceListingUrl` — continue to come from `mapProject` during discovery, unchanged.

## 6. Discovery changes (`ingestion/`)

### 6.1 Agency filter (`feat/11`)

- `.env`: `INGEST_AGENCIES` — comma-separated **exact** `masterOrgGroupName` values.
  v1 seed (see §11):
  `สำนักดิจิทัลกรุงเทพมหานคร,สำนักการแพทย์,สำนักอนามัย,สำนักสิ่งแวดล้อม,สำนักการจราจรและขนส่ง`
- `ingestion/agencyFilter.ts`: `parseAgencyAllowlist(env)` → `Set<string>` (trimmed;
  empty/unset ⇒ allow all, preserving current behaviour for the admin endpoint).
- `runIngestion.processProject`: after `detail = await client.projectDetail(...)`,
  before any `Tor` write:
  ```ts
  if (allowlist.size && !allowlist.has((detail.masterOrgGroupName ?? "").trim())) {
    stats.torsSkipped += 1;
    return;                     // no Tor, no EnrichmentJob, no PDF fetch
  }
  ```
- `IIngestionRunStats` gains `torsSkipped: number` (default 0); `outcomeSummary`
  includes it.

The e-GP search API ignores an org parameter (verified), so the filter is
client-side on the already-fetched detail. `torsFound` still counts search hits;
`torsSkipped` explains the gap to `torsCreated + torsUpdated`.

### 6.2 Date-incremental search (optional, recommended)

`collectProjects` currently passes no `fromDate/toDate` — it takes the newest
`maxProjects` every run. Add a rolling window:

- `.env`: `INGEST_LOOKBACK_DAYS` (default `7`).
- Pass `fromDate = todayUTC − INGEST_LOOKBACK_DAYS`, `toDate = today` to
  `searchProjects`. `maxProjects` stays a hard ceiling.
- This is a safety bound, not a watermark; idempotency still does the real
  dedup work. A wider one-off backfill is just a larger `INGEST_LOOKBACK_DAYS` +
  `maxProjects` on a manual run.

### 6.3 Enqueue enrichment

At the end of `processProject`, once the `Tor` is saved **and** (created OR hash
changed):

```ts
await enrichmentJobRepo.enqueue(tor._id, mapped.sourceContentHash);
```

Not gated on PDF success: a `scanned`/`missing` PDF still gets a Gemini attempt
(Gemini reads the bytes we have; a truly `missing` doc yields a low-confidence
`isSoftwareRelated` judgement from title/agency alone, which is acceptable and
logged). Skipped-agency and unchanged TORs are never enqueued.

### 6.4 Keyword pre-gate (funnel, cost control)

Before enqueue, a cheap regex gate on `title + goodsCategory + procurementType`:

- `ingestion/softwareKeywordGate.ts` — `looksSoftwareRelated(text): boolean`
  against a configurable pattern
  (`ซอฟต์แวร์|software|ระบบสารสนเทศ|แอปพลิเคชัน|application|คอมพิวเตอร์|เว็บ|website|`
  `ดิจิทัล|digital|ฐานข้อมูล|database|คลาวด์|cloud|API|โปรแกรม|IT|`
  `เทคโนโลยีสารสนเทศ|AI|ปัญญาประดิษฐ์|CCTV|ระบบกล้อง|ระบบบริหารจัดการ`).
- The default admin/scheduled run already searches `INGEST_DEFAULT_SEARCH=ซอฟต์แวร์`,
  so most hits pass. A miss ⇒ create the `Tor` with `pipelineStatus:"rejected"` and
  `classification:{ isSoftwareRelated:false, reason:"keyword pre-gate", confidence:0,
  model:"keyword-gate", at:now }`, **do not enqueue**, **do not call Gemini**.
- Ambiguous / positive ⇒ enqueue for Gemini to confirm.

### 6.5 Download size cap hardening

`egpClient.downloadFile` currently caps only via the `content-length` header; a
chunked response with no header is unbounded. Add a streaming cap: read the body
through `res.body` and abort once accumulated bytes exceed `EGP_MAX_FILE_BYTES`.
Small, self-contained change to the existing client; keeps the header check as the
fast path.

## 7. Taxonomy (`config/taxonomy.ts`)

A versioned constant this phase (not a collection):

```ts
export const TAXONOMY_VERSION = "2026-08-31";
export const TAXONOMY = [
  "software-development",        // จ้างพัฒนา/จัดทำระบบ/แอป
  "web-application",
  "mobile-application",
  "information-system",          // ระบบสารสนเทศทั่วไป / MIS
  "data-platform-analytics",    // data lake, BI, dashboard
  "gis",
  "cctv-its",                   // กล้องวงจรปิด / ระบบจราจรอัจฉริยะ
  "iot-sensor",
  "cloud-infrastructure",
  "network-datacenter",
  "cybersecurity",
  "erp-back-office",
  "hospital-information-system",
  "e-learning",
  "chatbot-line-oa",
  "software-license",           // จัดหา/ต่ออายุ license
  "system-maintenance",         // จ้างบำรุงรักษาระบบ (MA)
  "it-consulting-sa",           // ที่ปรึกษา / ออกแบบระบบ
  "hardware-with-software",     // ครุภัณฑ์คอมพิวเตอร์ที่มี software เป็นสาระสำคัญ
  "other",
] as const;
export type TorCategory = (typeof TAXONOMY)[number];
```

`TorCategorizer` seam (folded into the extractor call this phase):

```ts
export interface TorCategorizer {
  readonly id: string;
  readonly taxonomyVersion: string;
  categorize(input: CategorizeInput): Promise<{ category: TorCategory; tags: string[]; confidence: number }>;
}
```

`TaxonomyCategorizer` (v1) trusts the `category` field Gemini returns in the same
structured response, validates it against `TAXONOMY` (unknown ⇒ `"other"`), and
falls back to a `goodsCategory`/`title` rule map when Gemini omits it. A future
`EmbeddingCategorizer` implements the same interface without touching the pipeline.

## 8. Enrichment worker (`ingestion/enrichment/`)

### 8.1 `drainEnrichmentQueue(deps)` — the Cloud Run Job body

```
workerId = `enrich-${randomUUID()}`
create an IngestionRun { trigger:"scheduled", phase:"enrichment" }   // §10
loop:
  job = await enrichmentJobRepo.claimNext(workerId)
  if (!job) break
  tor = await Tor.findById(job.torId)
  if (!tor) { complete(job, "done"); continue }           // Tor deleted under us
  try:
    result = await extractor.extract({ tor, pdf: loadPdf(tor), meta })
    applyResultToTor(tor, result); await tor.save()
    complete(job, result.isSoftwareRelated ? "done" : "rejected")
  catch err:
    if (isRateLimit(err)) await sleep(backoff)
    fail(job, workerId, err); logEvent("ai-pipeline", "error", ...)
  if (++processed >= MAX_AI_CALLS_PER_RUN) break           // cost guard; rest waits for next cron
finalize the IngestionRun (torsFound = claimed, enrichedOk / enrichedRejected / enrichedFailed)
```

- `loadPdf(tor)` = `storage.getStream(tor.sourceDocument.storageKey)` → Buffer;
  `storageKey === null` ⇒ pass no PDF (title/agency-only classification).
- `MAX_AI_CALLS_PER_RUN` (`.env`, default `50`) caps spend per invocation.
- Runs single-flight per process; horizontal scale = more Job instances, safe via
  the lease.

### 8.2 `GeminiExtractor` (`ingestion/enrichment/geminiExtractor.ts`)

| concern | choice |
|---|---|
| SDK | `@google/genai` with `vertexai: true`, `project`, `location` |
| Auth | Cloud Run: Application Default Credentials via the attached service account (no key file). Local: `gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS`. |
| Model | `VERTEX_MODEL`, default `gemini-2.5-flash` (cheap, multimodal, built-in OCR) |
| Input | each stored TOR PDF as an `inlineData` part (`application/pdf`, base64) + a text part with known metadata (title, agency, budget, referencePrice, goodsCategory) and the field instructions |
| Output | `responseMimeType:"application/json"` + `responseSchema` (controlled generation); then re-validate with a Zod schema |
| Size cap | combined PDF > ~15 MB or > 40 pages ⇒ send the main TOR PDF's first 40 pages only; append `"truncated to N pages"` to a `notes[]` returned on the result and logged |
| Retry | 3× exponential on 429 / 503; other errors bubble to `fail(job)` |
| Cost log | log `usageMetadata` (input/output tokens) per call under `component:"classifier.gemini"` |
| Prompt | reuse the untrusted-document framing from TORPulse's extractor: treat `<tor_document>` as data, never instructions; extract only supported facts; no guessing; null / `[]` for unknowns. State that title/agency/budget are already known. |

Zod result schema:

```ts
{
  isSoftwareRelated: boolean,
  classificationReason: string,          // ≥1 char
  confidence: number,                    // 0..1
  category: string,                      // validated against TAXONOMY downstream
  categoryTags: string[],
  summary: string | null,
  keyPoints: string[],
  qualifications: string[],
  evaluationCriteria: { label: string, weight: number | null }[],
  technologyStack: string[],
  submissionDeadline: string | null,     // ISO when certain, else source text, else null
}
```

### 8.3 `TorExtractor` seam

```ts
export interface TorExtractor {
  readonly id: string;                   // → tor.aiSummary.model / classification.model
  extract(input: ExtractInput): Promise<TorExtractionResult>;
}
```

`EXTRACTOR` env selects the impl (`"gemini"` default). Future `DocumentAiExtractor`
/ `OpenDataLoaderExtractor` drop in without pipeline changes.

## 9. GCS storage driver (`storage/gcsStorage.ts`)

Replace the throwing stub with a real `@google-cloud/storage` implementation of
`BlobStorage`:

- constructor reads `GCS_BUCKET`; auth via ADC (same service account as Vertex).
- `put(key, buf, {contentType})` → `bucket.file(key).save(buf, { contentType, resumable:false })`.
- `getStream(key)` → `bucket.file(key).createReadStream()`.
- `exists(key)` → `bucket.file(key).exists()` `[0]`.
- `publicUrl(key)` → `null` (bucket stays private; the API streams bytes via
  `GET /api/tors/:id/document`, which already falls back to that path).
- `getStorage()` switches on `STORAGE_DRIVER` (`"local"` default, `"gcs"` in Cloud Run).

Local dev and tests keep `localDiskStorage`; no test hits real GCS.

## 10. `IngestionRun` change

Add `phase: "discovery" | "enrichment"` (default `"discovery"`, `index`). The
enrichment worker creates its own run rows so both phases share one history view.

`IIngestionRunStats` gains four fields, all default `0`:

- `torsSkipped` — discovery, agency-filtered out (§6.1)
- `enrichedOk` — enrichment, Gemini done + software-related
- `enrichedRejected` — enrichment, Gemini done + not software-related
- `enrichedFailed` — enrichment, Gemini errored past `maxAttempts`

Discovery keeps writing `torsFound/torsCreated/torsUpdated/torsFailed` +
`torsSkipped`; enrichment writes only `torsFound` (jobs claimed) +
`enrichedOk/enrichedRejected/enrichedFailed`. `IngestionRun.status` keeps its
existing `running/success/partial/failed` meaning per phase.

`markInterruptedRunsFailed()` stays as-is but is only meaningful for
`phase:"discovery"` in-process runs; scope its query to
`{ status:"running", phase:"discovery" }` so a discovery boot does not clobber a
live enrichment run (and vice-versa if a sweep is added there).

## 11. Config — `.env.example` additions

```
# Enrichment / Vertex AI
EXTRACTOR=gemini
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-flash
MAX_AI_CALLS_PER_RUN=50
# GOOGLE_APPLICATION_CREDENTIALS=   # local dev only

# Agency allowlist (exact masterOrgGroupName; empty = allow all)
INGEST_AGENCIES=สำนักดิจิทัลกรุงเทพมหานคร,สำนักการแพทย์,สำนักอนามัย,สำนักสิ่งแวดล้อม,สำนักการจราจรและขนส่ง
INGEST_LOOKBACK_DAYS=7

# Storage (Cloud Run uses gcs)
STORAGE_DRIVER=local
GCS_BUCKET=
```

Existing e-GP / storage vars from `feat/tor-ingestion` are unchanged.

## 12. Public read API

New `controllers/torController.ts` + routes under the existing
`routes/torRoutes.ts` (currently only `/:id/document`). All public; validation via
Zod + the central `errorHandler`; a malformed `:id` returns 400 (the fix-wave
already added the CastError branch).

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/tors` | `q` (text on `title`), `agency` (repeatable), `category` (repeatable), `budgetMin`, `budgetMax`, `publishedFrom`, `publishedTo`, `page` (≥1), `pageSize` (1..100, default 20) | `200 { data: TorListItem[], page, pageSize, totalCount, hasNextPage }` |
| GET | `/api/tors/:id` | — | `200 { tor }` or `404` |
| GET | `/api/tors/price-stats` | `groupBy=category` (only value this phase), plus the same filters as list | `200 { groups: [{ key, count, min, p25, median, p75, max }] }` over `referencePrice` (falls back to `budget` when `referencePrice` is unset) |
| GET | `/api/tors/:id/document` | — | unchanged |

**Every read filters `pipelineStatus: "enriched"`** — `pending` / `rejected` /
`failed` rows never appear in the public API. `TorListItem` is a projection
(`title, agency, category, budget, referencePrice, announcementDate,
submissionDeadline, status, sourceListingUrl, id`) — no `aiSummary` blob in list
responses. Detail returns the full document minus internal fields
(`sourceContentHash`, `classification`, `ingestionRunId`).

Indexes to add: `{ category: 1, announcementDate: -1 }`,
`{ agency: 1, announcementDate: -1 }`, `{ pipelineStatus: 1, announcementDate: -1 }`.
The existing `title/description/agency` text index serves `q`.

## 13. Deployment (GCP)

One Docker image, three entrypoints (npm scripts / container `command`):

| Target | Cloud resource | command | notes |
|---|---|---|---|
| `tor-api` | Cloud Run **Service** | `node dist/server.js` | min instances 0, CPU on request, region `asia-southeast1` |
| `tor-discovery` | Cloud Run **Job** | `node dist/jobs/discovery.js` | new entrypoint: `markInterruptedRunsFailed()` → `runIngestion({trigger:"scheduled", ...})` → **`await result.done`** → exit; memory 512Mi, task timeout 30 min, retries 0 |
| `tor-enrichment` | Cloud Run **Job** | `node dist/jobs/enrichment.js` | new entrypoint: `drainEnrichmentQueue()` → exit; memory 1Gi, task timeout 30 min, retries 0 |

- **New files:** `src/jobs/discovery.ts`, `src/jobs/enrichment.ts` (thin `main()`
  wrappers: connect Mongo, run, disconnect, set `process.exitCode`). `package.json`
  scripts `job:discovery`, `job:enrichment`.
- **Cloud Scheduler:** `tor-discovery` at `0 * * * *`; `tor-enrichment` at
  `*/15 * * * *`; each invokes the Job via `run.jobs.run` with a service account
  holding `run.developer` on that job. (3 free scheduler jobs — fits.)
  These cron strings are **the only place cadence lives** — nothing in code assumes
  an interval. Change either with one command and no redeploy:
  `gcloud scheduler jobs update http tor-discovery --schedule="*/30 * * * *"`.
  Both jobs are also idempotent to run ad-hoc (`gcloud run jobs execute …`) or more
  than once per window. `INGEST_LOOKBACK_DAYS` and `MAX_AI_CALLS_PER_RUN` let a
  chosen cadence stay correct (widen the window if you slow discovery down).
- **Service accounts:** `tor-jobs-sa` → `roles/aiplatform.user`,
  `roles/storage.objectAdmin` (on the bucket), Secret Manager accessor.
  `tor-api-sa` → `roles/storage.objectViewer`, Secret Manager accessor.
- **Secrets (Secret Manager → env):** `MONGODB_URI`. No AI key (ADC). Everything
  else is plain env on the resource.
- **MongoDB Atlas M0:** network access `0.0.0.0/0` (Cloud Run has no static egress
  without a paid VPC connector) + a strong SRV credential. Acceptable for this
  phase; documented as a known trade-off.
- **Vertex region:** if `gemini-2.5-flash` is unavailable in `asia-southeast1`,
  call `us-central1` (latency only).
- **Free-tier fit:** Cloud Run + Jobs + Scheduler + Atlas M0 + Artifact Registry
  (0.5 GB) sit inside always-free quotas at this volume. Vertex AI is
  pay-per-token, covered by trial credit, then on the order of ฿1–10 per run on
  Flash. GCS: a few hundred MB of PDFs ≈ free-tier.
- **Deploy:** `gcloud run deploy` / `gcloud run jobs deploy` from a workstation;
  a GitHub Actions workflow is a later additive step.

## 14. Testing (Jest + ts-jest, `mongodb-memory-server`)

Fixtures: capture 2–3 real e-GP responses (search / detail / announcements) into
`src/**/__tests__/fixtures/egp/`; reuse the two committed sample PDFs. A recorded
Gemini JSON response fixture stands in for the live call.

| Suite | covers |
|---|---|
| `enrichmentJobRepo.test.ts` | `enqueue` idempotency (same hash = no-op, new hash = re-queue), `claimNext` picks queued / expired-lease / retry-due and skips `attempts >= max`, `fail` backoff schedule, `complete` lock guard |
| `agencyFilter.test.ts` | allowlist parse (trim, empty ⇒ allow-all); `processProject` skips a non-listed agency (no Tor, no job, `torsSkipped++`) |
| `softwareKeywordGate.test.ts` | table of titles → pass / reject |
| `geminiExtractor.test.ts` | with a stub `generateContent`: result mapped onto `Tor`, `confidence` bucketing, `category` validated against `TAXONOMY` (unknown ⇒ `"other"`), Zod rejects a malformed response; a `RUN_VERTEX_TESTS=1`-gated live smoke test (not in CI) |
| `drainEnrichmentQueue.test.ts` | fixtures + memory Mongo: software TOR ⇒ `pipelineStatus:"enriched"`, fields written, job `done`; non-software ⇒ `"rejected"`, job `rejected`, no public exposure; Gemini throw ⇒ job `failed`, backoff set, loop continues; `MAX_AI_CALLS_PER_RUN` stops the loop |
| `gcsStorage.test.ts` | interface conformance against an in-memory `@google-cloud/storage` mock (`put`/`getStream`/`exists` round-trip) |
| `torController.test.ts` (supertest) | list filters + pagination + `hasNextPage`; only `enriched` rows returned; `price-stats` percentiles on a seeded set; `:id` 404 / malformed-id 400 |
| `runIngestion.test.ts` (extend) | enqueue-on-create, enqueue-on-hash-change, no enqueue when unchanged or agency-skipped |

`npm test` already runs `jest --runInBand`.

## 15. Future-proofing (not built now)

- **`DataSource` collection** replaces `INGEST_AGENCIES` when a second portal or
  per-agency scheduling is needed — additive.
- **Embeddings / `similarTORs`:** `EmbeddingCategorizer` behind the `TorCategorizer`
  seam; `similarTORs: ObjectId[]` already on `Tor`.
- **`price-stats` `groupBy=cluster`:** the endpoint takes `groupBy` now; a new value
  is a repository branch, not an API change.
- **Fairness scoring:** consumes `budget` vs `referencePrice` + `aiSummary`; a new
  enrichment stage or job type.
- **Real-time:** shorten the discovery cron, or wire `runIngestion` to a Pub/Sub
  push — `processProject` is already the per-item unit.

## 16. Resolved review decisions

1. **`feat/tor-ingestion` merges to `main` as-is first** — no pre-merge code
   changes; only the two ledger carry-over items in §2.1 (PII eyeball, follow-up
   minor-findings PR).
2. **`IngestionRun` counts:** add `enrichedOk / enrichedRejected / enrichedFailed`
   (plus `torsSkipped`) — done in §10.
3. **Model: `gemini-2.5-flash`.** Not revisited this phase.
4. **Cron cadence is Scheduler-side config, not code** (§13) — starts at discovery
   `0 * * * *` / enrichment `*/15 * * * *`, changed later with one
   `gcloud scheduler jobs update` and no redeploy.
