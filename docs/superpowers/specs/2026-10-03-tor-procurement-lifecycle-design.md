# TOR Procurement Lifecycle — Design

Date: 2026-10-03
Status: design approved in conversation; written spec awaiting review

## Context

A TOR's only user-visible status today is `open | closing_soon | closed`
(`Tor.status`). It is not sourced from e-GP: the frontend derives it from
`submissionDeadline` (`frontend/src/lib/torApi.ts`, `CLOSING_SOON_DAYS = 7`), the
stored value is `open` for every row, and a TOR with no known deadline is shown as
"เปิดรับ" no matter how far its procurement has progressed.

A 70-project sample of the e-GP public API (6 search terms, no announce-type
filter) shows the real lifecycle is richer, and that e-GP does **not** return a
bid submission deadline at all:

- Announcement types (`masterAnnounceTypeName`): ประกาศรายชื่อผู้ชนะ / ผู้ได้รับการ
  คัดเลือก (48), ประกาศเชิญชวน (32), ประกาศราคากลาง (23), no name (23), ร่างเอกสาร
  ประกวดราคา (17), ร่างขอบเขตของงาน (TOR) (16), ยกเลิกประกาศเชิญชวน (7), แผนการ
  จัดซื้อจัดจ้าง (1), ไม่ระบุ (1). The latest announcement was a winner notice for
  43 of 70 projects.
- Contract status (`masterContractAvailableName`): ระหว่างดำเนินการ, จัดทำสัญญา/ PO
  แล้ว, ส่งงานตามกำหนด, ส่งงานครบถ้วน, ยกเลิกโครงการ.
- A project can be re-invited after a cancellation.

Current ingestion (`runIngestion`) only discovers projects by their TOR-draft
announcement within `lookbackDays`, keeps only the TOR announcement
(`mapProject`), and never revisits old TORs. `sourceContentHash` includes
`masterContractAvailableName`, so any re-sighting of a project whose contract
status changed counts as "updated" and re-enqueues AI enrichment.

## Goals

- Show every TOR in listings with its true procurement stage, not a deadline guess.
- Make "ใกล้ปิดรับ" correct: only for TORs in the inviting stage, using the real
  bid deadline read from the invitation announcement.
- Keep stages fresh by re-checking existing TORs periodically, within a bounded
  e-GP and Gemini budget.

## Non-goals

- Changing the AI enrichment / fairness pipeline, other than adding a `kind` to
  its job queue.
- Vendor-facing notifications on stage changes.
- Tracking contract progress beyond showing the raw e-GP `contractStatus`.

## Decisions (agreed)

1. Listings show **all** stages; nothing is hidden by default.
2. Existing TORs are re-checked periodically, and invitation files are downloaded
   to read the real bid deadline.
3. Approach A: a separate lifecycle-refresh job (not folded into discovery).
4. Cadence: once a day, at most 100 TORs per run (env-configurable).

## Design

### 1. Data model

New embedded `Tor.procurement`:

| Field | Meaning |
|---|---|
| `stage` | `draft` \| `inviting` \| `awarded` \| `cancelled` |
| `contractStatus` | raw e-GP string |
| `announcements[]` | `{ announcementId, typeName, kind, publishedAt, hasFile, storageKey? }`; `kind` is the normalised type |
| `bidDeadline` | `{ date, source: "invitation-pdf" \| "admin", extractedAt }` |
| `deadlineAttempt` | `{ announcementId, at, outcome }` — last extraction attempt (step 4) |
| `lastCheckedAt` | last successful refresh |

`kind` normalises type names: `tor-draft`, `bidding-draft`, `reference-price`,
`invitation`, `cancellation`, `winner`, `plan`, `unknown` (null / ไม่ระบุ). Unknown
announcements never decide the stage.

**Stage derivation** (pure function, announcements ordered by `publishedAt`):

1. `cancelled` if `contractStatus` is "ยกเลิกโครงการ", or the latest announcement
   among `invitation` / `cancellation` is a `cancellation`.
2. else `awarded` if any `winner` announcement exists.
3. else `inviting` if any `invitation` exists.
4. else `draft`.

**User-facing status** (computed at read time; first match wins):

| # | Status | Condition |
|---|---|---|
| 1 | ปิดรับแล้ว (admin) | admin set `status = "closed"` |
| 2 | ยกเลิก | `stage = cancelled` |
| 3 | ประกาศผู้ชนะแล้ว | `stage = awarded` |
| 4a | ปิดรับแล้ว | `inviting`, `bidDeadline` in the past |
| 4b | ใกล้ปิดรับ | `inviting`, deadline within 7 days |
| 4c | เปิดรับ | `inviting`, deadline more than 7 days away |
| 4d | เปิดรับ (ไม่ระบุวันปิด) | `inviting`, no `bidDeadline` |
| 5 | ร่าง TOR | `draft` |

Whether the existing `submissionDeadline` (extracted from the TOR draft PDF) is a
bid deadline or a public-hearing deadline is **unverified**; it must be checked
against 3–5 real PDFs before delivery step 4, and then either kept with a clear
meaning or retired in favour of `bidDeadline`.

### 2. Lifecycle refresh job

- New entrypoint `dist/jobs/lifecycle.js`, run as a Cloud Run Job on Cloud
  Scheduler (see `docs/deployment/gcp.md`), plus an admin "run now" card on the
  scraper-status page and `POST /api/ingestion/lifecycle/runs`.
- Selects `enriched` TORs that are not finished (stage not `cancelled`, and
  `contractStatus` not one of "ส่งงานครบถ้วน", "ส่งงานตามกำหนด", "ส่งงานล่าช้ากว่ากำหนด" — work
  delivered in full, on time or late), oldest `lastCheckedAt` first, capped by
  `MAX_LIFECYCLE_REFRESH_PER_RUN` (default 100; add to `.env.example`). Each TOR
  costs two e-GP requests through the existing polite `EgpClient`.
- Updates `procurement` only. It must **not** modify `sourceContentHash` and must
  **not** enqueue full enrichment.
- Recorded as an `IngestionRun` with `phase: "lifecycle"` (stats reuse existing fields:
  `torsFound` = selected, `torsUpdated` = procurement changed, plus `torsUnchanged`,
  `torsSkipped`, `torsFailed`); per-TOR failures are
  logged (`SystemLog`, source `ingestion`) and retried on the next run (their
  `lastCheckedAt` does not advance). Stale `running` rows are swept as for
  enrichment (generalise `sweepStaleEnrichmentRuns`).
- **Hash fix in discovery:** `canonicalDetailHash` no longer includes
  `masterContractAvailableName`. Instead of a one-time migration script, discovery
  adopts the new hash lazily when it sees a TOR again, writing it silently and counting
  the TOR as unchanged (no PDF re-download, no enrichment) in two cases: (i) the stored
  hash equals `legacyDetailHash` (the old hash, which still includes contract status) of
  the freshly fetched detail; or (ii) its stored core fields (title, agency, department, budget, reference price,
  method, type, goods category) equal the fresh ones, so the only possible difference is
  the contract status. This must keep working after the lifecycle refresh job starts
  writing `procurement`, so it is deliberately not conditioned on `procurement` being
  absent. This is robust to admin edits: an admin-edited legacy TOR simply
  falls through to the normal update path, as it did before. A script recomputing
  hashes from stored fields would have mis-hashed such TORs.

### 3. Real bid deadline from the invitation

**Decision (2026-10-04, replaces the earlier "reuse `EnrichmentJob`" idea):** extraction runs
inline in the lifecycle refresh, with no queue. `enrichmentjobs.torId` is unique, so a second
job kind per TOR would mean reworking the index, lease and progress counters, and the scope
below is only a handful of files. Scope is **`inviting` TORs only**: on 2026-10-04 production
had 8 `inviting` TORs (6 with an invitation file); invitations of awarded or cancelled TORs
are not fetched because the UI never uses their deadline.

After refresh writes a TOR whose stage is `inviting`, it does one more step in the same run:

1. Pick the latest `invitation` announcement with `hasFile`. Skip when
   `procurement.deadlineAttempt.announcementId` already equals its id, or when
   `bidDeadline.source` is `"admin"`.
2. Download via `EgpClient.downloadFile` into `BlobStorage`
   (`tor-pdfs/<projectCode>/<announcementId>.pdf`) and record `storageKey` on that announcement.
3. `TorExtractor` gains `extractBidDeadline(pdf)` (one Gemini call; returns date + confidence;
   reuses the Buddhist-era year fix in `torExtractor.ts`). Low confidence or unreadable →
   write nothing; the UI shows an unknown deadline ("เปิดรับ" without a date).
4. Record `procurement.deadlineAttempt = { announcementId, at, outcome }` so the same
   announcement is never retried; a new invitation id re-opens extraction.
5. Cap: `MAX_DEADLINE_EXTRACTIONS_PER_RUN` (default 20), separate from `MAX_AI_CALLS_PER_RUN`.
6. A failure on one file is logged and never undoes the stage/announcement write already made
   for that TOR, nor delays other TORs.

- Admin edits write `bidDeadline` with `source: "admin"` via a new "กำหนดยื่นข้อเสนอ" field on
  the TOR records page. It wins over AI values and neither refresh nor extraction overwrites it.
  The existing "วันที่ระบุในเอกสาร TOR" (`submissionDeadline`) field stays as is.
- Writers: `bidDeadline`, `storageKey` and `deadlineAttempt` are written by targeted `$set`
  with an optimistic precondition (see the "Before step 4" open item), now implemented for
  both the refresh and discovery writers.
- First task of the plan: read 3–5 real invitation PDFs by eye to confirm where the bid
  deadline appears before fixing the extraction prompt (also answers the `submissionDeadline`
  meaning open item).

### 4. API and UI

- `GET /api/tors`: returns `stage`, `contractStatus`, `bidDeadline` and the
  computed `status`; adds a `stage`/status filter covering the seven distinct statuses above (rows 1 and 4a share a label).
- Public pages: status badges for every stage, filter chips for the statuses, and
  a dated announcement timeline on the TOR detail page. Non-`enriched` TORs stay
  hidden from public views as today.
- Admin TOR records: filter and badge for all five `pipelineStatus` values (with the
  last job error for `rejected` / `failed`), plus stage and `lastCheckedAt`.
- The frontend has its own Mongoose models (`frontend/src/models/`); check at plan
  time whether the new fields need mirroring there.

## Delivery order

Each step is independently shippable and gets its own PR:

1. Schema, stage derivation, `kind` normalisation, hash change with lazy legacy-hash adoption.
2. Lifecycle refresh job, run record, admin trigger, env + deployment docs.
3. API fields/filter and UI for all stages (including the admin pipeline view).
4. Invitation download + bid-deadline extraction (after the PDF verification above).

## Testing

- Table-driven tests for stage derivation using real announcement sequences from
  the sample (including cancel-then-reinvite and null-typed announcements).
- Refresh job against a fake `EgpClientLike`: updates `procurement`, respects the
  cap and ordering, never touches the hash or enqueues full enrichment, logs
  failures without advancing `lastCheckedAt`.
- Legacy-hash adoption: unchanged detail, or contract-status-only drift on a TOR with a legacy hash → no update and no enqueue; genuine change → still an update.
- Re-sighting must save once per TOR (procurement + hash/fields together) so a failed procurement write can never strand a TOR without its enrichment enqueue.
- Deadline extraction with a fake extractor: stored once per invitation id,
  admin value wins, unreadable PDF leaves it empty.
- API: new fields, status computation at the 7-day boundary, stage filter.

## Open items

- A winner announcement dated after the latest cancellation currently reads as `cancelled`
  (literal precedence rule). Checked against production on 2026-10-04: of the 63 public
  TORs, 8 are `cancelled` (2 by contract status "ยกเลิกโครงการ", 6 by a cancellation
  announcement newer than the latest invitation) and none has a winner announcement dated
  after its latest cancellation, so the rule is kept for now. Re-check when more data
  arrives; if a cancelled-then-awarded project appears, a winner dated after the latest
  cancellation should read `awarded`.
- Meaning of the current `submissionDeadline` (verify on real PDFs).
- Other cancellation announcement names beyond "ยกเลิกประกาศเชิญชวน"; widen the
  sample before finalising `kind` normalisation.
- Whether the e-GP sample (unfiltered by announce type) matches the TOR-draft
  population the system actually ingests.
- A TOR that fails every run, or is skipped every run because its listing URL has no
  recoverable e-GP project id, keeps its old `lastCheckedAt`, so it stays at the front of
  the queue and takes one slot of the daily cap (and, for skips, writes a warning every
  day). Harmless for a few permanent cases; if many accumulate, order by a separate
  `procurement.lastAttemptAt`.
- **Before step 4 (must):** both writers of `procurement` — the lifecycle refresh
  (targeted `$set` of `procurement.stage|announcements|lastCheckedAt|contractStatus`) and
  discovery (`runIngestion` saves the whole subdocument via `mergeProcurement`) — work from
  a read taken before slow e-GP calls, with no precondition on the write. That is harmless
  today because neither sets `storageKey` or `bidDeadline`, but once step 4 writes
  `storageKey`/`bidDeadline` a concurrent writer can silently drop them. Step 4 must add an
  optimistic precondition to both writers (e.g. `{ procurement: null }` /
  `{ "procurement.lastCheckedAt": <value read> }` on the refresh, and per-path `$set` or the
  same precondition on discovery's write) and treat `matchedCount === 0` as retry/skip.
- `refreshLifecycle` records a fatal abort (or a run where every TOR fails) as an
  `IngestionRun` with `status: "failed"` but returns normally, so the Cloud Run job exits
  0 and Cloud Run shows success. Either expose the run status in the result and set
  `process.exitCode = 1` in `jobs/lifecycle.ts`, or alert on a failed lifecycle run.
- The stale-run sweep thresholds (10 min idle, 35 min total) are not scaled to the lifecycle
  cap: with the e-GP client's worst-case retries one TOR can take longer than the idle
  threshold, and a 300-TOR manual run can exceed 35 minutes. A healthy-but-slow run can then be
  swept as `failed` (and a second manual run started) until it finishes and overwrites the
  status. Use a lifecycle-specific threshold scaled to the cap, or a heartbeat inside the
  retry loop.
- Manual discovery (`POST /api/ingestion/runs`) returns 409 whenever *any* run is `running`
  (its guard is not scoped to the discovery phase), so a running lifecycle or enrichment run
  blocks it, and the admin UI clears its pending state without a message. Scope the guard to
  `phase: "discovery"` or show a message on 409. Related: the UI's first poll can run
  before the new run row exists and stop showing "pending"; add a short grace period.
