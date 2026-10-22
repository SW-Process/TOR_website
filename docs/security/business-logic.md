# Business Logic Rules and Resource Limits

**ASVS 5.0 requirements documented here:**
- **2.1.2 (L2):** how combined data items are checked for consistency (section 1);
- **2.1.3 (L2):** the business limits, per user and across the application (sections 2–3);
- **15.1.3 (L2):** the functions that are slow or costly, and how they are kept from hurting availability (section 4).

ASVS 2.2.3, 2.3.2, 2.3.3, 2.3.4 and 15.2.2 are implemented against this document. Per-field rules are in [input-validation.md](input-validation.md).

## 1. Rules across fields (ASVS 2.1.2, 2.2.3)

| Where | Rule | Enforced in |
| --- | --- | --- |
| Business profile | `budgetMin` ≤ `budgetMax` | `vendorProfileController.ts` |
| TOR search and saved searches | `budgetMin` ≤ `budgetMax`; `publishedFrom` ≤ `publishedTo`; `deadlineFrom` ≤ `deadlineTo` | `listQuerySchema` in `torController.ts` |
| Saved search | Its filters must be the search's own fields and pass the same schema as a live search, since they're replayed into it later | `savedFilterProblem()` in `torController.ts` |
| Bookmark | Only on a TOR that exists and is public (`pipelineStatus: "enriched"`); one per vendor and TOR (unique index) | `bookmarkController.ts`, `models/Bookmark.ts` |
| Calendar note | Its key is a real calendar date (`YYYY-MM-DD`, not 2026-02-30) | `dayNoteController.ts` |
| Admin TOR edit | `bidDeadline` is a real date; an admin deadline always wins over one read from a PDF, and a month-only PDF deadline never shows as "closing soon" | `adminTorController.ts`, `utils/torStatus.ts` |
| TOR status | Derived, never typed in: manual close → cancelled → awarded → inviting by bid deadline → draft | `computeTorStatus()` in `utils/torStatus.ts` |
| MFA set-up | A seed must be confirmed with a code from it within 15 minutes, or it's discarded | `services/mfa.ts` |
| Password reset | Token, account and expiry must all match; the new password must pass the policy for **that** account (its e-mail and name) | `authController.ts` |

## 2. Per-user limits (ASVS 2.1.3, 2.3.2)

| What | Limit | When exceeded |
| --- | --- | --- |
| Saved searches | 50 per vendor | `400` "You can keep at most 50 saved searches" |
| Bookmarks (saved TORs) | 1,000 per vendor; updating an existing one is always allowed | `400` |
| Hidden TORs | 1,000 per vendor | `409` |
| Calendar notes | 1,000 days per vendor, 2,000 characters each | `400` |
| Profile lists (technologies, certifications, categories) | 100 items of 120 characters | `400` |
| Bookmark note, chat message, error report | 2,000 characters | `400` |
| Saved-search filters | 4 KB of JSON | `400` |
| Signed-in devices | 10 per account (the oldest is signed out) | See [session-management.md](session-management.md#3-concurrent-sessions-asvs-712) |
| Support-chat messages | 30 per account per 5 minutes | `429` |
| Sign-in, sign-up, reset, re-authentication, MFA codes | See [authentication-defenses.md](authentication-defenses.md#31-configured-limits) | `429` |
| Error reports | 10 per IP per hour | `429` |
| TOR view counter | 60 per IP per minute, plus once per browser session | `429` / not counted |
| Avatar | 5 MB, JPEG/PNG/WebP/GIF by content | `400` |

## 3. Application-wide limits (ASVS 2.1.3, 2.3.2)

| What | Limit | Setting |
| --- | --- | --- |
| Request body (JSON) | 100 KB | Express default |
| Page size of any list | 100 | Zod schemas |
| Search text | 200 characters; technology filter 20 values | `torController.ts` |
| Discovery run | 1–500 projects per run (default 50) | `INGEST_DEFAULT_MAX_PROJECTS` |
| Capture from the extension | 1–100 projects per call | `CAPTURE_MAX_PROJECTS` |
| AI (Gemini) calls per enrichment run | 50 | `MAX_AI_CALLS_PER_RUN` |
| TORs checked per lifecycle run | 100 | `MAX_LIFECYCLE_REFRESH_PER_RUN` |
| AI deadline reads per lifecycle run | 20 | `MAX_DEADLINE_EXTRACTIONS_PER_RUN` |
| Retries per enrichment job | 5, then the job is `failed` | `EnrichmentJob.maxAttempts` |
| e-GP file download | 50 MB | `EGP_MAX_FILE_BYTES` |
| e-GP document bundle (zip) | 500 files, 200 MB unpacked, 50 MB per PDF; checked before unpacking | `torFromBundle.ts` |
| Runs of one phase at a time | 1 (discovery, enrichment, lifecycle, capture each refuse a second with `409`) | `ingestionController.ts` |

## 4. Costly functions and availability (ASVS 15.1.3, 15.2.2)

| Function | Why it is costly | How availability is protected |
| --- | --- | --- |
| AI enrichment (Gemini, one multimodal call per TOR) | Money and seconds per call | Runs as a **separate Cloud Run job** on a schedule, not in a user request. A queue with leases (`EnrichmentJob`), a per-run cap on calls, retries with backoff, and a dead end (`failed`) after 5 attempts. Only new or changed TORs are queued (content hash). |
| AI deadline extraction | As above | Capped per run; once per invitation file (by SHA-256); the post-enrichment chain obeys the same cap. |
| Discovery and lifecycle (e-GP scraping) | Many slow external calls | Separate jobs; polite delays, timeouts and retries per call; per-run caps; one run per phase at a time; a stalled run is detected and failed (`jobs/stalledRuns.ts`). |
| Admin-started runs | Same work started from the panel | The API answers `202` at once and runs the work in the background, so no request waits on it; `409` if one is already running. |
| Capture | Up to 100 projects of e-GP calls | `202` and background work; at most 100 projects per call. |
| Password hashing (bcrypt cost 12) | ~250 ms of CPU per hash | Only on sign-in, sign-up and password changes, which are rate limited; password length is capped at 128 characters. |
| Recovery-code check (bcrypt cost 10, up to 10 hashes) | Up to ~0.5 s | Only on the MFA step, which is rate limited per account and per IP. |
| Breached-password check | An external call | 3-second timeout, fails open, only after the local checks pass. |
| TOR search and statistics | Aggregations over all TORs | Indexes on every filtered field; regex search on escaped text; page size ≤ 100; the stats endpoints are simple aggregations. |
| PDF and avatar streaming | Bandwidth | Streamed from Cloud Storage, never buffered whole; files are size-capped on the way in. |

Cloud Run adds platform-level protection: a request timeout, a maximum number of instances, and concurrency per instance.

## 5. Atomicity and locking (ASVS 2.3.3, 2.3.4)

| Operation | How it stays consistent |
| --- | --- |
| Deleting an account (user, profile, bookmarks, notifications, chat, sessions, report anonymisation) | One MongoDB transaction (`utils/transaction.ts`): all or nothing. Atlas is a replica set, so transactions apply in production; a standalone `mongod` (local Docker) runs the same steps without one. |
| Enrichment jobs | Claimed under a lease (`lockedBy`, `lockedUntil`), so two workers never process the same TOR. |
| Procurement updates | Optimistic precondition on `lastCheckedAt` (`procurementWrite.ts`), so a slow refresh can't overwrite a newer one. |
| One-time secrets (TOTP step, recovery codes, pending sign-in, reset token) | Used up with a conditional update, so two requests can't both use one. |
| Bookmarks, one chat per user, one profile per vendor, one job per TOR | Unique indexes. |
| Starting runs | A check for a running run of the same phase. This check-then-create isn't atomic, so two admins clicking at the same instant could start two runs; the run's own leases and idempotent upserts keep the data correct. |
