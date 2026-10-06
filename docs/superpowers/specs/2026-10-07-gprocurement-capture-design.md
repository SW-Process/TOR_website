# Discovering open TORs from the national e-GP with a Chrome extension

Date: 2026-10-07. Branch: `feat/tor-gproc-capture` (from `main` after PR #143).
Builds on `2026-10-06-gprocurement-lifecycle-source-design.md` (the "A" scope: lifecycle from process5).
This is the "B" scope of that spec.

## Problem

Discovery (`runIngestion`) lists projects from the BMA portal (egp2), which lags the national e-GP
(`process5.gprocurement.go.th`). New open tenders appear on process5 first, so the product shows only a
handful of "เปิดรับ" TORs. The process5 **search** page is behind Cloudflare Turnstile, which we do not
bypass. The per-project endpoints (detail, announcements, invitation PDF, document bundle) are ungated.

## Goal

An admin searches on process5 normally (passing Turnstile themselves). A Chrome extension reads the
search results the page already loaded and sends the project numbers to the backend. The backend creates
the missing TORs from process5 data and feeds them into the existing pipeline: enrichment (Gemini)
and the lifecycle refresh (stage + real bid deadline).

## Agreed decisions

| Question | Decision |
|---|---|
| Who uses it | Admins only, manually, when they search. Authenticated by the existing admin session. No automatic or scheduled capture (it would contradict "a human passes Turnstile"). |
| What the extension sends | Only 11-digit project numbers (plus the title/agency already on screen, for display only). The backend never stores client-supplied fields. |
| Where details come from | The backend asks process5 itself, with the existing polite `GprocClient`. |
| TOR file for enrichment | The draft TOR PDF inside the document bundle (zip): `Attach_TOR_*.pdf`. The bid deadline still comes from the `view-pdf` invitation PDF (unchanged). |
| "ดูประกาศต้นฉบับที่ e-GP" button | Follows the TOR's datasource: `gproc` → process5, `egp2` → the egp2 listing URL. |

## Scope

In:
1. `POST /api/ingestion/capture` and its background run (admin only).
2. `GprocClient` additions: document bundle info + download, draft-bundle variant.
3. TOR creation from process5 data and hand-off to enrichment.
4. The Chrome extension (`extension/`), Manifest V3, loaded unpacked in admins' browsers.
5. Source-aware link for the "ดูประกาศต้นฉบับที่ e-GP" button.
6. Lifecycle queue fix: a TOR the refresh skips (no listing URL and process5 cannot answer) must still get
   `lastCheckedAt` bumped, so it stops sitting at the head of the oldest-first queue (see Open items, last point).

Out (separate work):
- Replacing egp2 discovery, or any scheduled process5 discovery.
- Several invitations per project; contract status from process5.
- Disabling or hiding existing TORs.
- Publishing the extension to the Chrome Web Store.

## Findings (read-only probes on 2026-10-06, project 69099312832)

- `infoProcureDocAnnounZip?projectId=` → `data.zipId` (32 hex) and `buildName1`
  (`<project>_<DDMMYYYY พ.ศ.>_1.zip`, the invitation bundle).
- `infoProcureDocAnnounZipTemp?projectId=` → the **draft** bundle (`buildName1` `…_23092569.zip`, dated
  the draft day).
- `GET egp-upload-service/v1/downloadFileTest?fileId=<zipId>` → `application/zip`, no token. The draft
  bundle was ~9.4 MB and contained `Attach_TOR_1.pdf` (~10 MB, the TOR draft), `annoudoc_*.pdf`
  (announcement) and `doc_*.pdf` (bidding document).
- `getProjectDetail` returns `projectName`, `deptName`, `deptSubName`, `budgetYear`, `announceType`,
  `methodId`, `projectStatus`: enough to create a TOR without any egp2 data.
- **Search results (recorded by the user from the page's own request):**
  `GET egp-oann10-service/pb/a-egp-allt-project/announcement?budgetYear=2570&moiId=100000&announceType=2&announcementTodayFlag=false&page=<n>`
  returns `{ data: [...], response: { responseCode: 0 } }`, 10 rows per page (`sumProjectMoneyAndCount`
  on the same path reports `totalPages` / `recordsTotal`). A row has `projectId` (the 11-digit project number),
  `projectName`, `deptName`, `deptSubName`, `announceType` (`D0` for the invitation list), `announceDate`,
  `priceBuild`, `projectMoney`, `projectStatus`, `methodId`, `stepId`. That is all the extension needs.
  The page's search URL is `…/egp-agpc01-web/announcement?keywordSearch=&advancedSearch=true`.
- The greenBook rows carry `priceBuild` (the reference price) on the draft row.

## Design

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `extension/` (new) | Content script reads search results from the process5 page's own responses; popup shows the count and a send button; background service worker calls the API with the admin cookie. Pure parser `parseSearchResults(json)` tested against a recorded fixture. | Chrome APIs |
| `controllers/ingestionController.ts` (modify) | `POST /capture` validates, creates an `IngestionRun` (phase `capture`), returns `202`; background processing. `GET /runs/:id` (existing) is polled for progress. | `captureProjects` |
| `ingestion/capture/captureProjects.ts` (new) | Per project: skip existing, ask process5, apply agency allowlist and keyword gate, create the TOR, fetch the TOR file, enqueue enrichment. Serial, delayed, per-project error isolation, circuit breaker. | `GprocClientLike`, `BlobStorage`, `enqueueEnrichmentJob` |
| `ingestion/capture/mapGprocTor.ts` (new, pure) | process5 detail + announcements → Tor fields and `procurement` (reuses `buildGprocProcurement`). | `gprocMap` |
| `scraper/gprocClient.ts` (modify) | `documentBundle(projectId, { draft })` → `{ zipId, name } | null`; `downloadBundle(zipId)` → `Buffer` with a size cap. | fetch |
| `ingestion/capture/torFromBundle.ts` (new, pure + zip) | Lists the zip entries, picks the TOR PDF, extracts only that entry. | a zip reader |
| `controllers/torController.ts` (modify) | Source-aware `sourceListingUrl` on the public detail. | `procurement.source` |

### Extension

- MV3. Content script runs only on `https://process5.gprocurement.go.th/egp-agpc01-web/announcement*`.
  It observes the responses of the page's own request to
  `…/egp-oann10-service/pb/a-egp-allt-project/announcement?…&page=<n>` (the path ends in `/announcement`;
  `…/announcement/sumProjectMoneyAndCount` and other sub-paths are ignored) and extracts the rows. It does
  not issue the search itself and never touches the Turnstile token.
- Pages hold only 10 rows, so the extension **accumulates** rows across the pages the admin visits
  (extension storage, deduplicated by project number) until they press Send, then clears them.
- Popup: "collected N projects", a **Send** button (at most 100 per send), **Clear**, and the result of the
  last send (created / already known / skipped with the reason / failed). Nothing is sent without the click.
- Background worker sends `POST /api/ingestion/capture` with `credentials: "include"` and the API
  host permission. If the admin is not logged in the popup says so.
- Parser: pure `parseSearchResults(body)` returns `{ projectCode, title, agency }[]` for rows whose
  `projectId` matches `^\d{11}$`; any other shape returns `[]` (never throws). Tested against the recorded sample.
- Cookie caveat: the session cookie is `HttpOnly; SameSite=Lax`. Whether Chrome sends it from the
  extension's worker must be verified first (first task of the plan). Fallback if it does not: a short-lived
  token the admin generates from the admin page (still admin-only). Decide then; not designed here.

### Capture endpoint

`POST /api/ingestion/capture` (admin only, `requireAuth` + `requireRole("admin")`).
- Body: `{ projects: [{ projectCode, title?, agency? }] }` (the bare `projectCodes: string[]` form is not used).
- Validation: 1..100 entries, `projectCode` matches `^\d{11}$`, `title`/`agency` optional strings (<= 500 chars); duplicates removed; otherwise `400`.
- `title`/`agency` are a **skip-only hint** (step 3 of the per-project steps): they may avoid a process5 call, never create or change stored data.
- One capture run at a time (`409` if one is running), like the lifecycle run. Stale runs are swept.
- Creates an `IngestionRun` (`phase: "capture"`, `trigger: "manual"`, `stats.torsFound` = count) and
  returns `202 { runId }`. Progress (`torsCreated`, `torsUnchanged` = already known, `torsSkipped`,
  `torsFailed`) is written as it goes; the extension polls `GET /api/ingestion/runs/:id`. The
  `IngestionPhase` enum and the admin runs list get a `capture` value.
- Per-project result lines go to `SystemLog` (`ingestion`, with the run id), so skipped and failed
  projects can be explained: `capture <code>: skipped (agency not in INGEST_AGENCIES)`,
  `capture <code>: failed (<reason>)`, etc.

### `captureProjects` (per project, serial)

1. Existing TOR with this `projectCode` → count as already known; do nothing (the lifecycle refresh
   keeps it current).
2. Skip-only pre-filter with the client's hint (agency allowlist and keyword gate): a hint that clearly fails
   both gates skips the project without calling process5 (a wrong or lying hint can only cause a skip, never
   a write). Without a hint, or when the hint passes, continue.
3. `gproc.projectDetail(code)`: `null` → skipped (unknown to process5); error → failed (counts toward the
   breaker: 3 consecutive process5 errors stop the run, remaining codes reported as not processed).
4. Agency allowlist (`parseAgencyAllowlist(INGEST_AGENCIES)` against the server's `deptName`/`deptSubName`): no
   match → skipped. Software keyword gate (`looksSoftwareRelated(title + …)`): no match → skipped, the
   same gate discovery uses. (A skipped project is not stored; capturing it again re-checks it.)
5. `gproc.announcements(...)` → `buildGprocProcurement` for `procurement`.
6. Create the `Tor`: `title`, `agency`, `department`, `budget`/`referencePrice` where available,
   `projectCode`, `procurement` (with `source: "gproc"`), `pipelineStatus` default,
   `sourceContentHash` = hash of the canonical detail, `ingestionRunId`. No `sourceListingUrl`.
   The announcement date is the earliest announcement date.
7. TOR file: `documentBundle(code, { draft: true })`, falling back to the published bundle, then
   `downloadBundle` (cap: 50 MB), then `torFromBundle` picks the TOR PDF and stores it through the same
   `BlobStorage` path and `sourceDocument` fields as `fetchAndStoreTorPdf`
   (`tor-pdfs/<code>/<name>.pdf`, `pdfInspect` text layer). No TOR file found, or any file error →
   `sourceDocument.textLayer: "missing"` and the TOR is created but not enqueued; it stays invisible
   (`pipelineStatus` not enriched) and a later capture of the same code retries the file only. (Rule: a TOR
   without a stored file is never sent to enrichment.)
8. `enqueueEnrichmentJob(torId, sourceContentHash)`: the existing batch classifies and summarises it.
   The lifecycle refresh then fills the real bid deadline (it already handles TORs with no listing URL).

Politeness: strictly serial, `GPROC_DELAY_MS` between calls, the existing timeout/retry rules, a polite
User-Agent, no Cloudflare bypass. Per project: 2 calls for the check, up to 2 more for the bundle info
plus one ~10 MB download only for a new, relevant project.

### TOR file selection (`torFromBundle`)

- Read the zip central directory first; never extract anything else; ignore entries over a size cap.
- Prefer an entry whose name matches `/^Attach_TOR/i` (case-insensitive, `.pdf`); if several, take the
  largest; if none, no TOR (do not guess among `annoudoc_*`/`doc_*`).
- File names inside the zip may be TIS-620 encoded; match on the ASCII part only.
- A corrupt or encrypted zip → "missing" (never throws out of the project).

### Source-aware original link

`sourceListingUrl` (what the "ดูประกาศต้นฉบับที่ e-GP" button uses) is computed by the backend on the
public detail from the stored datasource:
- `procurement.source === "gproc"` → the process5 project page for the `projectCode`;
- otherwise → the stored egp2 `sourceListingUrl`, as today.

`procurement.source` itself stays hidden from the public API. A TOR created by capture has no stored
listing URL, so the button now appears for it too. The link follows the last stored source (a run that fell
back to egp2 flips it; accepted).
- The process5 link is `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=<projectCode>`
  (the search page with the project number as the keyword), built in one place (`gprocProjectUrl(projectCode)`).
  **Open:** the page has no known per-project URL; whether `keywordSearch=<number>` pre-fills and runs the search
  has to be confirmed in a browser (it may need Turnstile once). If a real project-page URL turns up, only
  `gprocProjectUrl` changes.

### Data model

- `IngestionPhase` gains `capture`.
- No new Tor fields. `Tor.sourceDocument` and `procurement.source` already exist.

### Security

- Admin-only route; the body is only strings matching `^\d{11}$`; nothing from the client is stored.
- The extension requests host permissions for process5 and our API only, and never reads cookies itself.
- Responses never include process5 internals (zip ids, file ids).
- Zip handling: size caps (download and per entry), no extraction to disk outside the single chosen
  entry, no path use from entry names.

## Testing

- `mapGprocTor` and `torFromBundle`: pure tests, with a small real zip fixture (TOR entry, other entries,
  TIS-620 names, no TOR entry, corrupt zip).
- `captureProjects` with fake `GprocClientLike`, in-memory storage and a fake enqueue: existing TOR
  untouched; unknown project → skipped; agency mismatch and keyword gate → skipped; created TOR has
  `source: "gproc"`, correct fields, stored file, enqueued once; missing TOR file → created, not enqueued;
  process5 error isolation and the 3-error breaker; serial order; counters.
- `POST /capture` route: admin only, `400` on invalid body/size, `409` while running, `202`, progress via
  the run.
- Source-aware link: gproc TOR → process5 link, egp2 TOR → its listing URL, no `source` leak.
- Extension: `parseSearchResults` against a recorded fixture (the sample is needed, see Open items);
  popup/worker verified by hand.
- The suite never calls the real network or Chrome.

## Rollout

1. Backend first (behind admin auth), exercised with curl against a few known project numbers.
2. Extension loaded unpacked by an admin; first uses with small searches.
3. No data is deleted. A failed or unwanted capture leaves at most a TOR that never reaches `enriched`.

## Open items (need input or a spike)

1. ~~Search-results sample~~ received (see Findings); it becomes the parser fixture.
2. **Original-link URL:** confirm `…/announcement?keywordSearch=<projectCode>` opens the right project in a
   browser, or capture the real project-page URL (see "Source-aware original link").
3. **Cookie from the extension:** verify `HttpOnly; SameSite=Lax` works from the worker; else add the
   admin-generated token.
4. **TOR file names in bundles:** confirm `Attach_TOR_*` across several projects; collect any other
   naming seen in production logs.
5. **Draft vs published bundle:** confirm the draft bundle stays downloadable after the invitation is out.
6. **Cloud Run request time:** the background run is in-process like the other admin runs; confirm the
   same pattern is acceptable for ~100 projects (a few minutes of downloads) or cap the batch lower.
7. Carried over from the lifecycle spec: a TOR with no listing URL that process5 cannot answer for keeps no
   `lastCheckedAt` and stays at the head of the lifecycle queue (must be fixed with this work, since capture
   creates exactly such TORs).
