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
| `contractStatus` | raw e-GP string (and code if present) |
| `announcements[]` | `{ announcementId, typeName, kind, publishedAt, hasFile, storageKey? }`; `kind` is the normalised type |
| `bidDeadline` | `{ date, source: "invitation-pdf" \| "admin", extractedAt }` |
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
  `contractStatus` not "ส่งงานครบถ้วน"), oldest `lastCheckedAt` first, capped by
  `MAX_LIFECYCLE_REFRESH_PER_RUN` (default 100; add to `.env.example`). Each TOR
  costs two e-GP requests through the existing polite `EgpClient`.
- Updates `procurement` only. It must **not** modify `sourceContentHash` and must
  **not** enqueue full enrichment.
- Recorded as an `IngestionRun` with `phase: "lifecycle"`; per-TOR failures are
  logged (`SystemLog`, source `ingestion`) and retried on the next run (their
  `lastCheckedAt` does not advance). Stale `running` rows are swept as for
  enrichment (generalise `sweepStaleEnrichmentRuns`).
- **Hash fix in discovery:** `canonicalDetailHash` no longer includes
  `masterContractAvailableName`. Instead of a one-time migration script, discovery
  adopts the new hash lazily when it sees a TOR again, writing it silently and counting
  the TOR as unchanged (no PDF re-download, no enrichment) in two cases: (i) the stored
  hash equals `legacyDetailHash` (the old hash, which still includes contract status) of
  the freshly fetched detail; or (ii) the TOR is legacy-era (has no `procurement` yet)
  and its stored core fields (title, agency, department, budget, reference price,
  method, type, goods category) equal the fresh ones, so the only possible difference is
  the contract status. This is robust to admin edits: an admin-edited legacy TOR simply
  falls through to the normal update path, as it did before. A script recomputing
  hashes from stored fields would have mis-hashed such TORs.

### 3. Real bid deadline from the invitation

- When refresh finds an `invitation` announcement with a file that has no stored
  copy, download it via `EgpClient.downloadFile` into `BlobStorage`
  (`tor-pdfs/<projectCode>/<announcementId>.pdf`) and enqueue a job.
- Reuse `EnrichmentJob` with a new `kind` (`full` | `deadline`; default `full`) so
  lease, backoff and dead-letter behaviour are shared. `TorExtractor` gains an
  `extractBidDeadline(pdf)` method (small schema: date + confidence), counted
  against `MAX_AI_CALLS_PER_RUN`.
- Unreadable result → `bidDeadline` stays empty and the UI shows "ไม่ระบุวันปิดรับ".
  Not retried until a new `invitation` announcement id appears.
- Admin edits (existing TOR records page) write `bidDeadline` with
  `source: "admin"`, which takes precedence over AI values.

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

1. Schema, stage derivation, `kind` normalisation, hash change + migration script.
2. Lifecycle refresh job, run record, admin trigger, env + deployment docs.
3. API fields/filter and UI for all stages (including the admin pipeline view).
4. Invitation download + bid-deadline extraction (after the PDF verification above).

## Testing

- Table-driven tests for stage derivation using real announcement sequences from
  the sample (including cancel-then-reinvite and null-typed announcements).
- Refresh job against a fake `EgpClientLike`: updates `procurement`, respects the
  cap and ordering, never touches the hash or enqueues full enrichment, logs
  failures without advancing `lastCheckedAt`.
- Legacy-hash adoption: unchanged detail, or contract-status-only drift on a legacy-era TOR → no update and no enqueue; genuine change → still an update.
- Deadline extraction with a fake extractor: stored once per invitation id,
  admin value wins, unreadable PDF leaves it empty.
- API: new fields, status computation at the 7-day boundary, stage filter.

## Open items

- Meaning of the current `submissionDeadline` (verify on real PDFs).
- Other cancellation announcement names beyond "ยกเลิกประกาศเชิญชวน"; widen the
  sample before finalising `kind` normalisation.
- Whether the e-GP sample (unfiltered by announce type) matches the TOR-draft
  population the system actually ingests.
