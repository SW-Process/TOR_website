# Lifecycle source: gprocurement (process5) instead of the stale BMA portal

Date: 2026-10-06. Branch: `feat/tor-gproc-lifecycle` (stacked on `feat/tor-procurement-deadline`).
Builds on `2026-10-03-tor-procurement-lifecycle-design.md`.
Status: Implemented by `docs/superpowers/plans/2026-10-06-gprocurement-lifecycle-source.md`.

## Problem

The lifecycle refresh reads each project's announcements and contract status from the BMA portal
(`egp2.bangkok.go.th`). That data lags the national e-GP system (`process5.gprocurement.go.th`):

- Project 69099318020 is already awarded on process5 (winner announced 2026-10-06) while egp2
  still shows it as inviting, so it reads "เปิดรับ" in our UI.
- Many egp2 invitation PDFs are the **draft** set with the bid date left blank (project
  69099312832: egp2 had only blank drafts; the real invitation was published 2026-10-01 with the
  bid date 20 ตุลาคม 2569 filled in).
- New open tenders are not discovered in time, so the product shows no currently open TOR.

## Findings (read-only probes on 2026-10-06, all ungated: no Cloudflare check, no token)

All calls are keyed by the 11-digit project number we already store as `Tor.projectCode`.

| Purpose | Request | Notes |
|---|---|---|
| Project status | `GET egp-oann10-service/pb/a-egp-allt-project/announcement/getProjectDetail?projectId=` | `projectStatus` `A` active / `R` cancelled, `announceType`, `methodId`, `stepId` |
| Announcement list ("ดูข้อมูล") | `GET …/announcement/greenBook?mode=LINK&methodId=<methodId>&tempProjectId=<id>&pageAnnounceType=<announceType>` | `greenBookAnnouncementTypeLinkDto[]`: `announceType` (`B0` draft tender doc, `D0` invitation, `W0` winner, `price`, `BOQ`), `announceDate`, `announceFlag` |
| Invitation PDF handle | `GET egp-approval-service/apv-common/infoProcureDocAnnounZip?projectId=` | `data.buildName2` = templateId of the invitation; `buildName1` = `<id>_<DDMMYYYY พ.ศ.>_1.zip` (date of the invitation) |
| Invitation PDF | `POST egp-template-service/dant/view-pdf?templateId=<buildName2>` (GET returns 405) | `data` = the PDF as base64: the signed "(สำเนา)" invitation with the bid date filled in |

Two facts that shape the design:

1. In these filled-in PDFs the form values are extracted **out of reading order** (the day is in
   the sentence, the month/year and the times come after it). A text regex on the sentence fails.
   Keep Gemini reading the PDF.
2. The invitation PDF comes from `view-pdf`, **not** from the zip bundle. The zip is not used.

A reference implementation of the same sources exists in
`01219346-65-CSP-2026/BangkokTOR-backend` (no LICENSE file; we use only the observed endpoints,
not its code).

## Goal

The lifecycle refresh decides stage and reads the bid deadline from process5, so existing TORs
stop being stale and their deadlines come from the real invitation. egp2 stays as the fallback.

## Scope (this spec = "A")

In:
- A `GprocClient` for the four calls above.
- Stage derivation from process5 for TORs the refresh checks.
- Bid deadline read from the `view-pdf` invitation PDF (latest invitation), replacing the egp2 file.
- Fallback to the existing egp2 path when process5 cannot answer.

Out (separate specs):
- The Chrome extension / `POST /api/ingestion/capture` for discovering new open tenders ("B").
- Several invitation announcements for one project (re-issued / amended); first version uses the
  single invitation `infoProcureDocAnnounZip` returns.
- Disabling or hiding existing TORs. Existing TORs are corrected by the refresh itself.
- Replacing egp2 discovery.

## Design

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `scraper/gprocClient.ts` | The four HTTP calls, polite (UA, delay, timeout, retries), JSON envelope parsing. `GprocClientLike` interface for fakes. | `fetch`, env |
| `ingestion/gprocMap.ts` (pure) | process5 payloads → `{ stage inputs, announcements[] }`; announce-type code → `AnnouncementKind`; cancelled by `projectStatus === "R"`. | `procurementStage.deriveStage` |
| `ingestion/lifecycle/refreshLifecycle.ts` | Per TOR: try process5; on `null`/error fall back to egp2; same guarded write. | the two clients |
| `ingestion/lifecycle/deadlineStep.ts` | Latest invitation → PDF buffer (process5 or egp2) → hash → Gemini → guarded write. | clients, extractor |

### Stage and announcements

- `announceType`: `D0` → `invitation`, `W0` → `winner`, `B0` → `bidding-draft`, `price` →
  `reference-price`, `BOQ` ignored, anything else → `unknown` (never decides the stage; logged once per code).
- `publishedAt` = `announceDate`. `announcementId` = `gproc:<announceType>:<announceDate>` so a
  re-issued invitation (new date) is a new id and re-opens deadline reading.
- `hasFile` = true for `D0`.
- Stage = existing `deriveStage(announcements, contractStatus)`, with `projectStatus === "R"` forcing
  `cancelled`. `contractStatus`: process5 has no equivalent field in the calls above, so the refresh keeps
  the stored value (from egp2 / earlier writes) untouched; see Open items.
- `Tor.procurement.source: "egp2" | "gproc"` records which source produced the last stage write
  (new optional field; absent = egp2). Not exposed publicly.

### Deadline

1. Pick the latest `D0` (single invitation in v1).
2. `infoProcureDocAnnounZip` → `buildName2`; `POST view-pdf` → base64 → `Buffer`.
3. `fileSha256` as today; the same once-per-invitation / month-precision re-check rules apply
   (`deadlineAttempt`, `precision`).
4. Gemini reads the PDF (`extractBidDeadline`, unchanged). The announcement date is the `D0` date.
5. Same guarded write; admin values still win.

Nothing about month-only deadlines, admin override, caps or error classification changes.

### Fallback and failure

- Per TOR: process5 returns `null` (unknown project) or throws → use the egp2 path exactly as today and
  set `procurement.source` to `egp2`. A process5 outage degrades to today's behaviour, never to failures.
- A failed or absent `view-pdf`/`zip-info` does NOT fall back to the egp2 file: an error is retried next
  run, a `null` (no bundle yet) is skipped and never clears a stored deadline.
- Circuit breaker: after 3 consecutive process5 errors in a run (not "unknown project"), process5 is not
  called for the rest of the run (one warning; the summary says so). A process5 response with a missing
  announcement list, a detail without `announceType`/`methodId`, or zero announcements for a TOR that
  had some is treated as an error (fallback to egp2).
- Contract status: when process5 answered and the TOR has a listing URL, egp2 `projectDetail` is read
  best-effort only for `masterContractAvailableName`; on error or without a URL the stored value is kept.
- Discovery (`runIngestion`) skips the egp2 `procurement` write for an existing TOR whose
  `procurement.source` is `gproc` while process5 is enabled, so it cannot revert the stage.
- Config: `GPROC_ENABLED` (default `true`), `GPROC_BASE_URL` (default `https://process5.gprocurement.go.th`),
  `GPROC_DELAY_MS` (default 500), `GPROC_TIMEOUT_MS` (default 30000). Added to `.env.example`.
- Politeness: one request at a time, delay between calls, descriptive User-Agent, stop the batch for
  the TOR (not the run) on repeated errors. Calls per TOR: 2 for the stage check, plus 2 only when a
  deadline read is needed.

### Reporting (what the run says about its sources)

The run's `outcomeSummary` (shown on the admin card) and `SystemLog` must make the source visible:

- Stage source: `process5 ok N, fell back to BMA portal M (project unknown to process5 A, process5 error B)`.
  Appended only when process5 is in use; with it off the summary is exactly today's string.
- Bid deadlines: the existing totals plus a per-source breakdown
  `(process5 read a, unreadable b, errors c; BMA portal read …)`.
- One log line per **open (inviting) TOR** that had a deadline attempt: `open TOR <code>: bid deadline from
  process5|BMA portal: read ok (day|month only <date>) | PDF read but no deadline found | failed (<reason>) |
  not attempted (cap reached)`. Failures are `warning`, the rest `info`. TORs already read for their current
  invitation produce no line.
- Each process5 failure already logs a `warning` naming the TOR (fallback reason).

### Candidate selection

Today a TOR is a lifecycle candidate only if it has a `sourceListingUrl` (needed to recover the egp2
project id). process5 needs only `projectCode`, so with `GPROC_ENABLED` a TOR with a valid 11-digit
`projectCode` and no listing URL is also a candidate (this is what TORs created by the future extension
flow "B" will look like). The egp2 fallback path still requires the listing URL and is skipped without it.
All other candidate rules (enriched only, unfinished, backfill, month-only re-check) are unchanged.

### Data model

Only `procurement.source` is new. Announcement ids change format for process5-sourced TORs; the
guarded writer already replaces the announcement list as a whole and preserves `storageKey` by id
(`mergeProcurement`), so a source switch simply carries no stored keys over (acceptable: PDFs for
process5 are not stored in v1).

## Testing

- `gprocMap` pure tests against **recorded real responses** (stored as fixtures, no secrets): an awarded
  project (D0 → price → W0), an inviting project (D0), a draft-only project (B0), a cancelled project
  (`projectStatus: R`), an unknown announce type.
- `GprocClient` with a fake `fetch`: envelopes, `view-pdf` POST + base64 decode, 405/5xx/timeouts, delay.
- `refreshLifecycle` with fake clients: process5 wins over egp2; fallback on null and on error; the guarded
  write and `source` field; no change when process5 is disabled.
- `deadlineStep`: PDF from process5 → Gemini fake → stored once; hash unchanged skips Gemini; month-only
  re-check keeps working; process5 PDF failure falls back or records nothing.
- Existing suites unchanged.

## Rollout

1. Deploy backend with `GPROC_ENABLED=true` and the refresh as before.
2. First manual lifecycle run with the two sliders raised; expect many stage changes (stale "inviting"
   TORs becoming awarded) and new deadlines for projects that were blank on egp2.
3. No data is deleted. If process5 misbehaves, set `GPROC_ENABLED=false`. With it off, TORs whose
   `deadlineAttempt` id starts with `gproc-` get no egp2 deadline re-reads (accepted).

## Open items

- **Fallback flapping**: when process5 fails and the run falls back to egp2 for a TOR whose stored
  `deadlineAttempt.announcementId` starts with `gproc-`, the deadline step is skipped for that TOR (the
  egp2 invitation id differs and could overwrite a good process5 deadline). A process5 loader that
  returns no PDF never clears a stored deadline either.
- **Invitation choice (M3)**: `invitationPdf` ignores which invitation it serves; a re-issued `D0` while
  `buildName2` still points at the old bundle would read the old PDF. Guard idea: compare `buildName1`
  date with the `D0` Bangkok day. Out of scope with multi-invitation support.
- **Candidate-queue starvation**: unanswerable no-listing-URL TORs stay candidates and are re-checked
  oldest-first every run; must be fixed before the extension flow (B).
- **First-run re-read**: the first process5 run re-reads each invitation once, because the invitation
  ids change (`gproc-…` instead of the egp2 uuid); the existing deadline is kept until that read
  succeeds, and `MAX_DEADLINE_EXTRACTIONS_PER_RUN` bounds the spend.

- **Several invitations per project** (re-issued / amended): v1 trusts the single `buildName2`. Verify
  with a real project that has more than one `D0`.
- **Contract status** (`ส่งงานครบถ้วน` etc.) is used by the refresh to stop re-checking finished TORs; process5
  call(s) that expose it are not identified yet. Until then it is not refreshed from process5.
- **Other announce types** (cancellation, amendment, corrected winner) are mapped to `unknown`; collect
  the codes seen in production logs and extend the table.
- **Stability / terms**: these are internal e-GP endpoints with no contract; the design assumes they may
  change or start requiring the Cloudflare check, hence the fallback and the kill switch.
- **Province filter**: process5 has `infoDeptSub` (agency address) if Bangkok-only filtering is needed for
  the extension flow (B); not needed for A.
