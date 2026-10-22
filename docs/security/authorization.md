# Authorization Rules

**ASVS 5.0 requirements:**
- **8.1.1 (L1):** *"Verify that authorization documentation defines rules for restricting function-level and data-specific access based on consumer permissions and resource attributes."*
- **8.1.2 (L2):** *"…defines rules for field-level access restrictions (both read and write) based on consumer permissions and resource attributes…"* (section 4.3).

This document defines who may call which function (section 3), whose data each function may touch (section 4), and which fields each caller may read or write (section 4.3). The rules are enforced in the Express backend (ASVS 8.3.1); the frontend only hides links and pages for convenience.

## 1. Roles

| Role | Who | How the role is granted |
| --- | --- | --- |
| **Public** | Anyone, not signed in | — |
| **Vendor** | A company user | Signs up with email and password, or with Google. Every new account is a vendor. |
| **Admin** | A TOR Checker operator | Created only on the server with `npm run create-admin -- <email> <password>`. There is no API, page or sign-up flow that creates an admin or changes anyone's role. |

A signed-in user has exactly one role, `vendor` or `admin`, stored in `users.role`.

## 2. How access is checked

| Mechanism | What it does | File |
| --- | --- | --- |
| `requireAuth` | Needs a valid session cookie. Verifies the JWT (HS256 only), loads the user **and the role from the database** on every request, and checks that the session row still exists and the token version is current. Otherwise `401`. | `backend/src/middleware/auth.ts` |
| `requireRole(...roles)` | After `requireAuth`, the user's role must be in the list. Otherwise `403 "Insufficient permissions"`. | same |
| `requireAdminMfa` | After `requireRole("admin")`, the session must have passed two-step verification. Otherwise `403` with `code: "mfa_required"` (ASVS 6.3.3). | same |
| `requireRecentAuth` | For changes to the account's own authentication (e-mail, password, MFA, Google, sessions, deletion): the factors again, or a full sign-in within 10 minutes. Otherwise `401 reauth_required`. | `backend/src/services/reauth.ts` |
| `optionalAuth` | Attaches the user when a valid session exists, but never blocks. Used where signed-in users get extra behaviour on a public route. | same |
| Ownership filters | Every query on a user's own data filters by the id from the session (`req.user.id`), never by an id the client sends. | controllers (section 4) |
| Public visibility gate | Public TOR endpoints only ever read TORs with `pipelineStatus: "enriched"`. | `torController.ts`, `torDocumentController.ts` |

Rules that make these checks dependable:
- **The role comes from the database, not from the token.** Changing a role, or deleting an account, takes effect on the next request. Bumping `tokenVersion` (password change, reset, "log out other devices") or deleting a session row revokes a session at once (ASVS 8.3.2, 7.4.1).
- **Admin and ingestion routes are protected as a whole router** (`router.use(requireAuth, requireRole("admin"), requireAdminMfa, auditAdminAction)`), so a new admin route can't be added without the checks, and every change it makes is written to the security log.
- **Deny by default.** A route that doesn't list a check is public by design; every such route is listed in section 3.
- **Not found rather than forbidden.** Asking for another user's item (bookmark, notification, saved search, session) answers `404`, so it doesn't confirm the item exists.

## 3. Function-level rules

✅ allowed · ❌ refused (`401` when not signed in, `403` when the role is wrong) · 🔒 own data only (section 4)

### 3.1 Public and account endpoints

| Endpoint | Public | Vendor | Admin | Notes |
| --- | :-: | :-: | :-: | --- |
| `GET /api/health` | ✅ | ✅ | ✅ | No data. |
| `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password` | ✅ | ✅ | ✅ | Rate limited. Register always creates a vendor. |
| `POST /api/auth/logout` | ✅ | ✅ | ✅ | Ends only the caller's own session. |
| `POST /api/auth/mfa/verify` | ✅ | ✅ | ✅ | Second sign-in step: needs the pending cookie from a correct password or Google sign-in. Rate limited. |
| `GET/POST /api/auth/reauth` | ❌ | 🔒 | 🔒 | Re-authenticate this session. Rate limited. |
| `POST /api/auth/mfa/setup`, `/mfa/enable`, `/mfa/disable`, `/mfa/recovery-codes` | ❌ | 🔒 | 🔒 | Need a fresh re-authentication (except `enable`, which needs a code from the new seed). Admins can't disable. |
| `GET /api/auth/google`, `/google/callback` | ✅ | ✅ | ✅ | Google sign-in. A new account is a vendor. |
| `GET/PATCH /api/auth/me` | ❌ | 🔒 | 🔒 | |
| `DELETE /api/auth/me` | ❌ | 🔒 | ❌ | Admins can't delete their own account here, so the panel can't be left without an admin by accident. |
| `PUT /api/auth/password`, `PUT /api/auth/email` | ❌ | 🔒 | 🔒 | Need the current password, and a fresh re-authentication. Rate limited. |
| `GET /api/auth/sessions` | ❌ | 🔒 | 🔒 | |
| `POST /api/auth/logout-others`, `DELETE /api/auth/sessions/:id` | ❌ | 🔒 | 🔒 | Need a fresh re-authentication (except signing out the current device). |
| `GET /api/auth/reports` | ❌ | 🔒 | 🔒 | The caller's own error reports. |
| `POST /api/auth/avatar` | ❌ | 🔒 | 🔒 | |
| `GET /api/auth/avatar/:userId` | ✅ | ✅ | ✅ | Avatars are public pictures by design (shown in chat and admin lists). Served sandboxed. |
| `GET /api/auth/google/link`, `DELETE /api/auth/google` | ❌ | 🔒 | 🔒 | Need a fresh re-authentication. Unlink needs a password on the account, so the user can still sign in. |

### 3.2 TORs and help center

| Endpoint | Public | Vendor | Admin | Notes |
| --- | :-: | :-: | :-: | --- |
| `GET /api/tors`, `/price-stats`, `/agencies`, `/technologies` | ✅ | ✅ | ✅ | Public TORs only. A signed-in vendor's hidden TORs are left out. |
| `GET /api/tors/:id`, `/api/tors/:id/document` | ✅ | ✅ | ✅ | Public TORs only; internal fields are removed (section 4.3). |
| `POST /api/tors/:id/report` | ✅ | ✅ | ✅ | Rate limited. Linked to the account when signed in. |
| `POST /api/tors/:id/view` | ✅ | ✅ | ✅ | Rate limited. |
| `GET /api/help`, `/announcements`, `/announcements/:id`, `/faqs`, `/faqs/:id` | ✅ | ✅ | ✅ | Published items only; drafts and ended announcements are hidden. |

### 3.3 Vendor features (`/api/vendor`, signed in)

| Endpoint | Public | Vendor | Admin | Notes |
| --- | :-: | :-: | :-: | --- |
| `GET/PUT /profile` | ❌ | 🔒 | 🔒 | Admins may keep a profile too, to try the vendor features. |
| `GET /matches` | ❌ | 🔒 | 🔒 | |
| `GET /bookmarks`, `PUT/PATCH/DELETE /bookmarks/:torId` | ❌ | 🔒 | 🔒 | |
| `GET/PUT /day-notes`, `/day-notes/:date` | ❌ | 🔒 | 🔒 | |
| `GET /notifications`, `PATCH /notifications/:id/read` | ❌ | 🔒 | 🔒 | |
| `GET/POST /profile/saved-searches`, `PATCH/DELETE /profile/saved-searches/:searchId` | ❌ | 🔒 | ❌ | Vendor only. |
| `GET /hidden-tors`, `PUT/DELETE /hidden-tors/:torId` | ❌ | 🔒 | ❌ | Vendor only. |

### 3.4 Chat (`/api/chat`, signed in)

| Endpoint | Public | Vendor | Admin | Notes |
| --- | :-: | :-: | :-: | --- |
| `GET /conversation`, `POST /messages`, `POST /read` | ❌ | 🔒 | 🔒 | One thread per account. The chat widget is only shown to vendors. |

### 3.5 Admin panel (`/api/admin`, admin only)

Every admin and ingestion endpoint also needs the admin's session to have passed two-step verification (`requireAdminMfa`).

| Endpoint | Public | Vendor | Admin |
| --- | :-: | :-: | :-: |
| `GET /stats` | ❌ | ❌ | ✅ |
| `GET /users?email=` (find accounts, with their device counts) | ❌ | ❌ | ✅ |
| `POST /users/:id/sessions/revoke` (sign one user out everywhere) | ❌ | ❌ | ✅ |
| `POST /sessions/revoke-all` (sign everyone else out; needs re-authentication) | ❌ | ❌ | ✅ |
| `GET /notifications`, `PATCH /notifications/:id/read` | ❌ | ❌ | 🔒 |
| `GET /tors`, `GET /tors/reported` | ❌ | ❌ | ✅ |
| `PATCH /tors/:id` (correct fields, mark flags reviewed) | ❌ | ❌ | ✅ |
| `DELETE /tors/:id` (hide from the public; sets `pipelineStatus: "rejected"`, nothing is deleted) | ❌ | ❌ | ✅ |
| `GET /reports`, `PATCH /reports/:id` | ❌ | ❌ | ✅ |
| `GET /logs` | ❌ | ❌ | ✅ |
| `GET /chats`, `PATCH /chats/:id`, `GET/POST /chats/:id/messages`, `POST /chats/:id/read` | ❌ | ❌ | ✅ |
| `GET/POST /help/announcements`, `PATCH/DELETE /help/announcements/:id` | ❌ | ❌ | ✅ |
| `GET/POST /help/faqs`, `PATCH/DELETE /help/faqs/:id` | ❌ | ❌ | ✅ |

### 3.6 Data ingestion (`/api/ingestion`, admin only)

| Endpoint | Public | Vendor | Admin | Notes |
| --- | :-: | :-: | :-: | --- |
| `POST/GET /runs`, `GET /runs/:id` | ❌ | ❌ | ✅ | |
| `POST /enrichment/runs`, `GET /enrichment/pending` | ❌ | ❌ | ✅ | Each run is capped (`maxCalls` ≤ 200) to limit AI cost. |
| `POST /lifecycle/runs`, `GET /lifecycle/pending` | ❌ | ❌ | ✅ | |
| `POST /capture`, `GET /capture/pending` | ❌ | ❌ | ✅ | Called by the admin Chrome extension with the admin's session cookie. |

Scheduled jobs (discovery, enrichment, lifecycle) don't go through the API: they run as Cloud Run Jobs with their own service account (`tor-jobs-sa`), started by Cloud Scheduler.

## 4. Data-specific rules

### 4.1 A user's own data

Every query below filters by the caller's id from the session. Ids sent by the client (a bookmark's `torId`, a `searchId`, a session id) only pick an item **within** the caller's own data.

| Data | Owner check |
| --- | --- |
| Account (`users`) | `User.findById(req.user.id)` |
| Sessions | `{ userId: req.user.id }` on list and revoke |
| Avatar | Stored as `avatars/<req.user.id>`; the client can't choose the key |
| Vendor profile | `{ userId: req.user.id }` |
| Saved searches | Looked up inside the caller's profile (`profile.savedSearches.id(searchId)`) |
| Bookmarks | `{ vendorId: <caller's profile id>, torId }` |
| Hidden TORs, day notes | Inside the caller's profile |
| Notifications | `{ _id, vendorId: <caller's profile id> }` |
| Admin notifications | `{ _id, adminId: req.user.id }` |
| Chat thread | `{ user: req.user.id }`; a visitor can't read or post to another thread |
| Error reports ("my reports") | `{ reportedBy: req.user.id }` |

These rules block IDOR / broken object level authorization (ASVS 8.2.2).

### 4.2 What admins can see and change

Admins share one workspace: every admin sees every user report, chat thread, ingestion run and system log. This is intended; admins are a small trusted team. Their powers are still bounded:
- They can correct only the TOR fields listed in the strict update schema (title, agency, category, budget, deadlines, status, flag review). Fields like `pipelineStatus`, the AI summary or the source document can't be set through the API.
- Hiding a TOR changes its status; nothing is deleted.
- They can't read passwords or reset tokens (never returned, stored hashed), create other admins, change roles, or impersonate a user.

### 4.3 Field-level rules (ASVS 8.1.2, 8.2.3)

**Write rules.** Every write endpoint accepts only the fields listed below. Zod schemas are `.strict()` (an unknown field is `400`) and hand-written validators copy named fields only, so a field that isn't listed can't be set however the request is shaped (mass assignment, ASVS 15.3.3).

| Endpoint | Caller | Fields it may write | Never writable through the API |
| --- | --- | --- | --- |
| `POST /api/auth/register` | anyone | `email`, `password` | `role` (always `vendor`), `tokenVersion`, every `mfa*` field |
| `PATCH /api/auth/me` | owner | `displayName` | everything else |
| `PUT /api/auth/email`, `PUT /api/auth/password` | owner (re-authenticated) | `email`; `password` | |
| `POST /api/auth/mfa/*` | owner (re-authenticated) | the MFA fields, through the set-up flow only | the seed itself (generated by the server) |
| `PUT /api/vendor/profile` | owner | `companyName`, `businessType`, `registeredCapital`, `yearsExperience`, `teamSize`, `certifications`, `technologyStack`, `interestedCategories`, `budgetRange` (`budgetMin` ≤ `budgetMax`), `serviceArea`, `emailAlertsEnabled` | `userId`, `savedSearches`, `hiddenTors`, `dayNotes` (each has its own endpoint) |
| Saved searches | vendor owner | `name`, `filters` (only the search's own fields), `alertsEnabled` | |
| Bookmarks | owner | `applicationStatus`, `note` | `vendorId`, `torId` (from the session and the URL) |
| Day notes | owner | the note text for one date | |
| `POST /api/tors/:id/report` | anyone | `description`, `reporterEmail` | `reportedBy` (from the session), `status`, `resolvedBy` |
| `PATCH /api/admin/tors/:id` | admin | `title`, `agency`, `category`, `budget`, `submissionDeadline`, `status`, `bidDeadline`, `resolveFlags` | `pipelineStatus`, `aiSummary`, `classification`, `sourceDocument`, `procurement` (other than the bid deadline), `projectCode`, `viewCount` |
| `PATCH /api/admin/reports/:id` | admin | `status`, `resolutionNote` | `torId`, `reportedBy`, `description` |
| Help announcements and FAQs | admin | their content fields and `status` | `createdBy`, `updatedBy` (from the session) |

**Read rules.**

| Data | Who may read | Fields never returned | Where |
| --- | --- | --- | --- |
| User | the owner (`/me`); admins see e-mail and role in reports, chats and the session lookup | `passwordHash`, `tokenVersion`, `resetPasswordTokenHash`, `resetPasswordExpiresAt`, `avatarKey`, `avatarContentType`, every `mfaSecret*`/`mfaPending*`/`mfaRecoveryCodes`/`mfaLastStep` field | `User` schema `select: false` + `toJSON` |
| Session list | the owner | Raw User-Agent (only parsed device, browser and OS) | `listSessions` |
| Session lookup (admin) | admins | Only id, e-mail, role and the number of signed-in devices; no IPs or devices | `findUsers` |
| Public TOR | everyone | `sourceContentHash`, `classification`, `ingestionRunId`, `sourceDocument.storageKey`, `sourceDocument.sha256`, announcement storage keys, `procurement.deadlineAttempt`, `procurement.source` | `getTor` projection |
| Public TOR list | everyone | Only the list projection (title, agency, budget, dates, status, …) | `LIST_PROJECTION` |
| Fairness flags | admins in the panel; the public sees only the TOR's neutral signals on its page | | admin projection |
| My error reports | the reporter | The admin who resolved it | `listMyReports` |
| Notifications about a TOR that is no longer public | the vendor | Only title, agency and code, marked `isPublic: false` | `listNotifications` |

### 4.4 Rules based on resource state

| Resource | Rule |
| --- | --- |
| TOR | Visible, bookmarkable, hideable and reportable by the public only when `pipelineStatus` is `enriched`. |
| Help announcement / FAQ | Public only when `status` is `published`; an announcement also disappears after its `endsAt`. |
| Account without a password (Google only) | Can't change email or unlink Google until it sets a password. |
| Admin account | Can't be deleted through `DELETE /api/auth/me`, and can't turn two-step verification off. Its admin access needs an MFA-verified session. |
| Account with MFA on | Every sign-in needs the second factor; re-authentication needs the password and a code. |

## 5. Protections around the rules

| Control | Why it matters for authorization |
| --- | --- |
| Session revocation (logout, session list, `tokenVersion`) | A stolen or old session can be cut off at once. |
| CSRF guard (`backend/src/middleware/originCheck.ts`) | Another website can't make a signed-in user's browser call an allowed endpoint. The Chrome extension is allowed only on `POST /api/ingestion/capture`, which still needs an admin session. |
| CORS fixed to `CLIENT_ORIGIN` with credentials | Other origins can't read API responses with the user's cookie. |
| Rate limits | Slow down guessing on endpoints that re-check a password. |
| Frontend `RequireAuth` and role checks in the header | Only hide pages and links. Every protected action is checked again by the API. |

## 6. Known limits

| Item | Note |
| --- | --- |
| `/admin` pages in the frontend | A non-admin who types the URL sees the empty admin layout, but every API call it makes answers `403`, so no data is shown. A role check in the frontend would be a UX improvement only. |
| Avatars are public by user id | Intended; avatars are not considered sensitive. |
| Admins see every report, chat and run | Intended: one shared admin workspace (section 4.2). |

## 7. Verification

The backend test suite checks these rules, for example:

| Test file | Rule it checks |
| --- | --- |
| `adminTors.test.ts`, `adminReports.test.ts`, `adminLogs.test.ts`, `help.test.ts`, `ingestionRoutes.test.ts` | Anonymous users get `401` and vendors get `403` on admin routes. |
| `vendorBookmarks.test.ts` | Saved searches and hidden TORs stay closed to admins. |
| `vendorNotifications.test.ts` | A vendor sees only their own notifications and can't mark another vendor's as read (`404`). |
| `vendorHiddenTors.test.ts` | Each vendor's hidden list is separate; non-public TORs can't be hidden. |
| `dayNotes.test.ts` | Day notes need a session and stay with their owner. |
| `sessions.test.ts` | Logging out other devices and changing the password revoke the other sessions; the token version is never returned. |
| `torRoutes.test.ts`, `torProcurementExposure.test.ts` | Only enriched TORs are public, and internal fields (`storageKey`, `deadlineAttempt`, `procurement.source`) are never returned. |
| `originCheck.test.ts` | Cross-site state-changing requests are refused. |
| `mfa.test.ts` | Admin and ingestion routes refuse an admin session without MFA; admins can't switch MFA off. |
| `reauth.test.ts`, `adminSessions.test.ts` | Sensitive account changes need re-authentication; only admins can end other people's sessions. |
| `businessLimits.test.ts` | Saved-search filters can't carry unknown fields such as `__proto__` or `$where`. |

Not yet covered by a test: a visitor reading another visitor's chat thread (the code filters by `user: req.user.id`, but no test tries it).
