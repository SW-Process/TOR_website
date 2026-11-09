# API Reference

The REST API of the TOR Checker backend (Express, [`backend/src`](../../backend/src)): every endpoint, who may call it, what it takes and what it returns. Written from the route and controller code, so it matches what the server does today.

## Contents

- [Conventions](#conventions)
- [Endpoint index](#endpoint-index)
- [Shared objects](#shared-objects)
- [Health](#health)
- [Authentication and account](#authentication-and-account) · `/api/auth`
- [TORs](#tors) · `/api/tors`
- [Vendor](#vendor) · `/api/vendor`
- [Chat](#chat) · `/api/chat`
- [Help center](#help-center) · `/api/help`
- [Admin](#admin) · `/api/admin`
- [Ingestion](#ingestion) · `/api/ingestion`

## Conventions

### Base URL and format

- Base URL: `http://localhost:8000` in development, the backend's Cloud Run URL in production. Every path starts with `/api`.
- Requests and responses are JSON (`Content-Type: application/json`), except the avatar upload (`multipart/form-data`) and the PDF and image downloads.
- Dates are ISO 8601 strings in UTC, e.g. `2026-11-09T06:30:00.000Z`. A date-only value is `YYYY-MM-DD` (a Bangkok calendar day).
- Ids are MongoDB ObjectIds: 24 hex characters. Documents returned as they are stored carry `_id`; shaped responses carry `id`.
- Every response has an `X-Request-Id` header. Quote it when reporting a problem, so it can be found in the logs.

### Sessions and access levels

Signing in sets an HttpOnly session cookie (`__Host-token` in production, `token` in development). Browsers send it automatically; call the API with `credentials: "include"`. There are no API keys.

- A session ends after **30 minutes** without activity or **12 hours** after sign-in, whichever comes first (`SESSION_IDLE_TIMEOUT_MINUTES`, `SESSION_MAX_HOURS`).
- A request with the header `X-Background-Request: 1` (status polling) does not count as activity.

| Access | Meaning |
|---|---|
| **Public** | No session needed |
| **Optional session** | Works without a session; a signed-in user gets a slightly different answer |
| **Signed in** | Any account |
| **Vendor** | Vendor accounts only |
| **Vendor or admin** | Either role; the data is always the caller's own |
| **Admin** | Admin accounts, signed in with two-step verification (unless `ADMIN_MFA_REQUIRED=false`) |
| **Re-auth** | Also needs a recent re-authentication, see below |

### Re-authentication

Sensitive account changes need proof that the person at the keyboard owns the account. A request passes when either

- the session signed in or re-authenticated in the last **10 minutes**, or
- the body itself carries the account's factors: `currentPassword` (if the account has a password) and `mfaCode` (if two-step verification is on).

Otherwise the answer is `401` with `{ "code": "reauth_required", "methods": ["password", "totp"] }`. Call [`POST /api/auth/reauth`](#post-apiauthreauth) and retry. A Google-only account without two-step verification has `methods: ["google"]` and re-authenticates by signing in with Google again.

### Cross-site protection

A `POST`, `PUT`, `PATCH` or `DELETE` whose `Origin` header is not the frontend (`CLIENT_ORIGIN`, plus any `TRUSTED_ORIGINS`) is refused with `403 { "message": "Cross-site request blocked" }`. So is one without `Origin` but with `Sec-Fetch-Site: cross-site`. Requests from tools such as curl send neither header and pass. The admin Chrome extension may only reach `POST /api/ingestion/capture`.

### Errors

Every error is JSON with a `message`, and sometimes a machine-readable `code` or more fields:

```json
{ "message": "Invalid or expired session", "code": "session_invalid" }
```

| Status | When |
|---|---|
| `400` | Invalid input. The message names the field, e.g. `budgetMin must not exceed budgetMax`; an invalid id gives `Invalid id` |
| `401` | No session or an expired one (`code: "session_invalid"`), wrong credentials, or re-authentication needed (`code: "reauth_required"`) |
| `403` | Wrong role (`Insufficient permissions`), admin without two-step verification (`code: "mfa_required"`), or a cross-site request |
| `404` | Not found, including records that belong to someone else |
| `405` | An HTTP method the API doesn't use, e.g. `TRACE` |
| `409` | Conflict: already exists, a limit reached, or a run already in progress |
| `429` | Rate limit hit; the `Retry-After` header says how many seconds to wait |
| `500` | Server error; the message is generic and the details go to the server log only |
| `502`, `503` | A dependency is unavailable: file storage, Google sign-in, or the e-GP source |

### Rate limits

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 per IP and email, and 50 per IP, per 15 minutes |
| `POST /api/auth/register` | 10 per IP per hour |
| `POST /api/auth/mfa/verify` | 10 per pending sign-in, and 30 per IP, per 15 minutes |
| `POST /api/auth/forgot-password` | 5 per IP and email, and 20 per IP, per hour |
| `POST /api/auth/reset-password` | 10 per IP per 15 minutes |
| Endpoints marked **Re-auth**, and `POST /api/auth/reauth` | 10 per IP per 15 minutes |
| `POST /api/tors/:id/report` | 10 per IP per hour |
| `POST /api/tors/:id/view` | 60 per IP per minute |
| `POST /api/chat/messages` | 30 per account per 5 minutes |

### Pagination

Paged lists take `page` (from 1) and `pageSize`, and answer with

```json
{ "data": [], "page": 1, "pageSize": 20, "totalCount": 57, "hasNextPage": true }
```

## Endpoint index

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | [`/api/health`](#get-apihealth) | Public | Check that the backend is up |
| POST | [`/api/auth/register`](#post-apiauthregister) | Public | Create a vendor account |
| POST | [`/api/auth/login`](#post-apiauthlogin) | Public | Sign in with email and password |
| POST | [`/api/auth/mfa/verify`](#post-apiauthmfaverify) | Public | Finish signing in with a two-step code |
| POST | [`/api/auth/logout`](#post-apiauthlogout) | Public | Sign out this device |
| POST | [`/api/auth/forgot-password`](#post-apiauthforgot-password) | Public | Email a password reset link |
| POST | [`/api/auth/reset-password`](#post-apiauthreset-password) | Public | Set a new password from the link |
| GET | [`/api/auth/google`](#get-apiauthgoogle) | Public | Sign in with Google |
| GET | [`/api/auth/google/callback`](#get-apiauthgooglecallback) | Public | Google's return address |
| GET | [`/api/auth/avatar/:userId`](#get-apiauthavataruserid) | Public | A user's profile picture |
| GET | [`/api/auth/me`](#get-apiauthme) | Signed in | The signed-in account |
| PATCH | [`/api/auth/me`](#patch-apiauthme) | Signed in | Change the display name |
| DELETE | [`/api/auth/me`](#delete-apiauthme) | Vendor, re-auth | Delete the account |
| PUT | [`/api/auth/password`](#put-apiauthpassword) | Signed in, re-auth | Change or set the password |
| PUT | [`/api/auth/email`](#put-apiauthemail) | Signed in, re-auth | Change the sign-in email |
| GET | [`/api/auth/reauth`](#get-apiauthreauth) | Signed in | Whether this session may make sensitive changes |
| POST | [`/api/auth/reauth`](#post-apiauthreauth) | Signed in | Re-authenticate for 10 minutes |
| POST | [`/api/auth/mfa/setup`](#post-apiauthmfasetup) | Signed in, re-auth | Start setting up an authenticator app |
| POST | [`/api/auth/mfa/enable`](#post-apiauthmfaenable) | Signed in | Turn two-step verification on |
| POST | [`/api/auth/mfa/disable`](#post-apiauthmfadisable) | Vendor, re-auth | Turn two-step verification off |
| POST | [`/api/auth/mfa/recovery-codes`](#post-apiauthmfarecovery-codes) | Signed in, re-auth | Replace the recovery codes |
| GET | [`/api/auth/sessions`](#get-apiauthsessions) | Signed in | Signed-in devices |
| DELETE | [`/api/auth/sessions/:id`](#delete-apiauthsessionsid) | Signed in, re-auth for other devices | Sign one device out |
| POST | [`/api/auth/logout-others`](#post-apiauthlogout-others) | Signed in, re-auth | Sign out every other device |
| GET | [`/api/auth/reports`](#get-apiauthreports) | Signed in | Error reports I sent |
| POST | [`/api/auth/avatar`](#post-apiauthavatar) | Signed in | Upload a profile picture |
| GET | [`/api/auth/google/link`](#get-apiauthgooglelink) | Signed in, re-auth | Connect Google to this account |
| DELETE | [`/api/auth/google`](#delete-apiauthgoogle) | Signed in, re-auth | Disconnect Google |
| GET | [`/api/tors`](#get-apitors) | Optional session | Search TORs |
| GET | [`/api/tors/price-stats`](#get-apitorsprice-stats) | Public | Price statistics by category |
| GET | [`/api/tors/agencies`](#get-apitorsagencies) | Public | Agencies, for the filter |
| GET | [`/api/tors/technologies`](#get-apitorstechnologies) | Public | Technologies, for the filter |
| GET | [`/api/tors/:id`](#get-apitorsid) | Public | One TOR in full |
| GET | [`/api/tors/:id/document`](#get-apitorsiddocument) | Public | Download the TOR PDF |
| POST | [`/api/tors/:id/report`](#post-apitorsidreport) | Optional session | Report incorrect data |
| POST | [`/api/tors/:id/view`](#post-apitorsidview) | Public | Count a page view |
| GET | [`/api/vendor/profile`](#get-apivendorprofile) | Vendor or admin | Business profile |
| PUT | [`/api/vendor/profile`](#put-apivendorprofile) | Vendor or admin | Update the business profile |
| GET | [`/api/vendor/profile/saved-searches`](#get-apivendorprofilesaved-searches) | Vendor | Saved searches |
| POST | [`/api/vendor/profile/saved-searches`](#post-apivendorprofilesaved-searches) | Vendor | Save a search |
| PATCH | [`/api/vendor/profile/saved-searches/:searchId`](#patch-apivendorprofilesaved-searchessearchid) | Vendor | Edit a saved search |
| DELETE | [`/api/vendor/profile/saved-searches/:searchId`](#delete-apivendorprofilesaved-searchessearchid) | Vendor | Delete a saved search |
| GET | [`/api/vendor/matches`](#get-apivendormatches) | Vendor or admin | TORs that match the profile |
| GET | [`/api/vendor/bookmarks`](#get-apivendorbookmarks) | Vendor or admin | Saved TORs |
| PUT | [`/api/vendor/bookmarks/:torId`](#put-apivendorbookmarkstorid) | Vendor or admin | Save a TOR |
| PATCH | [`/api/vendor/bookmarks/:torId`](#patch-apivendorbookmarkstorid) | Vendor or admin | Update application status or note |
| DELETE | [`/api/vendor/bookmarks/:torId`](#delete-apivendorbookmarkstorid) | Vendor or admin | Remove a saved TOR |
| GET | [`/api/vendor/hidden-tors`](#get-apivendorhidden-tors) | Vendor | Hidden TORs |
| PUT | [`/api/vendor/hidden-tors/:torId`](#put-apivendorhidden-torstorid) | Vendor | Hide a TOR |
| DELETE | [`/api/vendor/hidden-tors/:torId`](#delete-apivendorhidden-torstorid) | Vendor | Show a hidden TOR again |
| GET | [`/api/vendor/day-notes`](#get-apivendorday-notes) | Vendor or admin | Calendar notes |
| PUT | [`/api/vendor/day-notes/:date`](#put-apivendorday-notesdate) | Vendor or admin | Set or remove one day's note |
| GET | [`/api/vendor/notifications`](#get-apivendornotifications) | Vendor or admin | In-app notifications |
| PATCH | [`/api/vendor/notifications/:id/read`](#patch-apivendornotificationsidread) | Vendor or admin | Mark a notification read |
| GET | [`/api/chat/conversation`](#get-apichatconversation) | Signed in | My chat with the team |
| POST | [`/api/chat/messages`](#post-apichatmessages) | Signed in | Send a message |
| POST | [`/api/chat/read`](#post-apichatread) | Signed in | Mark replies as read |
| GET | [`/api/help`](#get-apihelp) | Public | Help-center front page |
| GET | [`/api/help/announcements`](#get-apihelpannouncements) | Public | Published announcements |
| GET | [`/api/help/announcements/:id`](#get-apihelpannouncementsid) | Public | One announcement |
| GET | [`/api/help/faqs`](#get-apihelpfaqs) | Public | Published FAQs |
| GET | [`/api/help/faqs/:id`](#get-apihelpfaqsid) | Public | One FAQ |
| GET | [`/api/admin/stats`](#get-apiadminstats) | Admin | Dashboard numbers |
| GET | [`/api/admin/tors`](#get-apiadmintors) | Admin | TOR records for review |
| GET | [`/api/admin/tors/reported`](#get-apiadmintorsreported) | Admin | TORs with open error reports |
| GET | [`/api/admin/tors/:id`](#get-apiadmintorsid) | Admin | One TOR for the edit form |
| GET | [`/api/admin/tors/:id/fairness-flags`](#get-apiadmintorsidfairness-flags) | Admin | Fairness flags in full |
| PATCH | [`/api/admin/tors/:id`](#patch-apiadmintorsid) | Admin | Correct a TOR |
| DELETE | [`/api/admin/tors/:id`](#delete-apiadmintorsid) | Admin | Hide a TOR from the site |
| GET | [`/api/admin/reports`](#get-apiadminreports) | Admin | Error reports |
| PATCH | [`/api/admin/reports/:id`](#patch-apiadminreportsid) | Admin | Resolve or reopen a report |
| GET | [`/api/admin/settings/fairness-prefilter`](#get-apiadminsettingsfairness-prefilter) | Admin | Fairness thresholds |
| PUT | [`/api/admin/settings/fairness-prefilter`](#put-apiadminsettingsfairness-prefilter) | Admin | Change the fairness thresholds |
| GET | [`/api/admin/notifications`](#get-apiadminnotifications) | Admin | Pipeline alerts |
| PATCH | [`/api/admin/notifications/:id/read`](#patch-apiadminnotificationsidread) | Admin | Mark an alert read |
| GET | [`/api/admin/logs`](#get-apiadminlogs) | Admin | System logs |
| GET | [`/api/admin/users`](#get-apiadminusers) | Admin | Find accounts by email |
| POST | [`/api/admin/users/:id/sessions/revoke`](#post-apiadminusersidsessionsrevoke) | Admin | Sign a user out everywhere |
| POST | [`/api/admin/sessions/revoke-all`](#post-apiadminsessionsrevoke-all) | Admin, re-auth | Sign everyone out |
| GET | [`/api/admin/chats`](#get-apiadminchats) | Admin | Chat inbox |
| GET | [`/api/admin/chats/:id/messages`](#get-apiadminchatsidmessages) | Admin | Messages in a thread |
| POST | [`/api/admin/chats/:id/messages`](#post-apiadminchatsidmessages) | Admin | Reply |
| POST | [`/api/admin/chats/:id/read`](#post-apiadminchatsidread) | Admin | Mark a thread read |
| PATCH | [`/api/admin/chats/:id`](#patch-apiadminchatsid) | Admin | Close or reopen a thread |
| GET | [`/api/admin/help/announcements`](#get-apiadminhelpannouncements) | Admin | All announcements, drafts included |
| POST | [`/api/admin/help/announcements`](#post-apiadminhelpannouncements) | Admin | Create an announcement |
| PATCH | [`/api/admin/help/announcements/:id`](#patch-apiadminhelpannouncementsid) | Admin | Edit an announcement |
| DELETE | [`/api/admin/help/announcements/:id`](#delete-apiadminhelpannouncementsid) | Admin | Delete an announcement |
| GET | [`/api/admin/help/faqs`](#get-apiadminhelpfaqs) | Admin | All FAQs, drafts included |
| POST | [`/api/admin/help/faqs`](#post-apiadminhelpfaqs) | Admin | Create a FAQ |
| PATCH | [`/api/admin/help/faqs/:id`](#patch-apiadminhelpfaqsid) | Admin | Edit a FAQ |
| DELETE | [`/api/admin/help/faqs/:id`](#delete-apiadminhelpfaqsid) | Admin | Delete a FAQ |
| POST | [`/api/ingestion/runs`](#post-apiingestionruns) | Admin | Discover new TORs now |
| GET | [`/api/ingestion/runs`](#get-apiingestionruns) | Admin | Recent runs |
| GET | [`/api/ingestion/runs/:id`](#get-apiingestionrunsid) | Admin | One run |
| POST | [`/api/ingestion/enrichment/runs`](#post-apiingestionenrichmentruns) | Admin | Run AI enrichment now |
| GET | [`/api/ingestion/enrichment/pending`](#get-apiingestionenrichmentpending) | Admin | TORs waiting for AI |
| POST | [`/api/ingestion/lifecycle/runs`](#post-apiingestionlifecycleruns) | Admin | Refresh procurement stages now |
| GET | [`/api/ingestion/lifecycle/pending`](#get-apiingestionlifecyclepending) | Admin | TORs the refresh would check |
| POST | [`/api/ingestion/capture`](#post-apiingestioncapture) | Admin | Add projects from the browser extension |
| GET | [`/api/ingestion/capture/pending`](#get-apiingestioncapturepending) | Admin | Captured TORs still without a PDF |

## Shared objects

### User

Returned by sign-in and account endpoints. Secrets (password hash, reset token, two-step secret) are never included.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | |
| `email` | string | Lower case |
| `displayName` | string \| null | null falls back to the part of the email before `@` |
| `role` | `"vendor"` \| `"admin"` | |
| `avatarUrl` | string \| null | e.g. `/api/auth/avatar/<id>` |
| `mfaEnabled`, `mfaEnabledAt` | boolean, date \| null | Two-step verification |
| `createdAt`, `updatedAt` | date | |

The account endpoints (`/api/auth/me` and the account changes) add:

| Field | Type | Notes |
|---|---|---|
| `hasPassword` | boolean | false for an account that only signs in with Google |
| `googleLinked` | boolean | |
| `recoveryCodesLeft` | number | Unused two-step recovery codes |
| `mfaRequired` | boolean | true for admins: the admin pages need two-step verification |
| `sessionMfa` | boolean | This session passed two-step verification |

### TOR summary

One search result, also used in bookmarks, matches and hidden TORs.

| Field | Type | Notes |
|---|---|---|
| `_id` | string | |
| `title`, `agency`, `projectCode` | string | `projectCode` is the 11-digit e-GP project number |
| `category` | string | One of the taxonomy slugs below |
| `projectType` | string | `new-development`, `enhancement`, `maintenance`, `license-purchase`, `hardware-purchase`, `consulting` |
| `budget`, `referencePrice` | number | Thai baht |
| `announcementDate`, `submissionDeadline` | date | |
| `technologyStack` | string[] | |
| `status` | string | Stored status: `open`, `closing_soon`, `closed` |
| `displayStatus` | string | What to show: `draft`, `open`, `closing_soon` (bid deadline within 7 days), `closed`, `awarded`, `cancelled` |
| `procurement` | object | `stage` (`draft`, `inviting`, `awarded`, `cancelled`), `contractStatus`, `bidDeadline` (`{ date, source, precision }`), `hearingEndDate`, `lastCheckedAt` |
| `sourceListingUrl` | string | The project page on e-GP |
| `viewCount` | number | |

Category slugs: `software-development`, `web-application`, `mobile-application`, `information-system`, `data-platform-analytics`, `gis`, `cctv-its`, `iot-sensor`, `cloud-infrastructure`, `network-datacenter`, `cybersecurity`, `erp-back-office`, `hospital-information-system`, `e-learning`, `chatbot-line-oa`, `software-license`, `system-maintenance`, `it-consulting-sa`, `hardware-with-software`, and a few more in [`config/taxonomy.ts`](../../backend/src/config/taxonomy.ts).

### TOR detail

Everything in the summary, plus:

| Field | Type | Notes |
|---|---|---|
| `department` | string | Unit within the agency |
| `aiSummary` | object \| null | `summary`, `keyPoints[]`, `qualifications[]`, `evaluationCriteria[]` (`{ label, weight }`), `confidence` (`high`, `medium`, `low`, or absent), `model`, `generatedAt` |
| `fairnessFlags` | array | Each `{ _id, field, severity, message, confidence, detectedAt, status }`. `field` is `budget`, `deadline`, `qualificationRequirements` or `other`; `severity` and `confidence` are `high`, `medium`, `low`; `status` is `open`, `acknowledged`, `dismissed`. The reasoning and data points are admin-only, see [`/api/admin/tors/:id/fairness-flags`](#get-apiadmintorsidfairness-flags) |
| `sourceDocument` | object \| null | `{ egpUrl, filename, kind ("tor" or "invitation"), textLayer, pageCount, byteSize, fetchedAt }` |
| `procurement.announcements` | array | `{ announcementId, typeName, kind, publishedAt, hasFile }` |
| `categoryTags` | string[] | |

### Person

How an admin endpoint shows an account (a reporter, a chat visitor, a resolver):

```json
{ "id": "…", "email": "a@b.co", "displayName": "บริษัท ตัวอย่าง จำกัด", "companyName": "บริษัท ตัวอย่าง จำกัด", "role": "vendor", "avatarUrl": null }
```

`displayName` is the vendor's company name, else the part of the email before `@`.

## Health

### GET /api/health

Check that the backend is up. **Public.**

**200**

```json
{ "status": "ok", "message": "Backend is running" }
```

## Authentication and account

### POST /api/auth/register

Create a vendor account and sign in. **Public.**

| Body | Type | Rules |
|---|---|---|
| `email` | string | A valid email |
| `password` | string | At least 8 characters; not a common or breached password, and not containing the email or site name |

**201** `{ "user": User }` and the session cookie.
**Errors:** `400` invalid email or a password the policy refuses (the message says why) · `409` `Email is already registered` · `429`

### POST /api/auth/login

Sign in with email and password. **Public.**

| Body | Type |
|---|---|
| `email` | string |
| `password` | string |

**200** `{ "user": User }` and the session cookie.
If the account has two-step verification on: **200** `{ "mfaRequired": true }` and a 5-minute pending sign-in cookie instead of a session. Finish with [`POST /api/auth/mfa/verify`](#post-apiauthmfaverify).
**Errors:** `400` invalid email or a password shorter than 8 characters · `401` `Invalid email or password` (the same for an unknown email) · `429`

### POST /api/auth/mfa/verify

Second sign-in step: a code from the authenticator app, or a recovery code. **Public**, needs the pending sign-in cookie from login or the Google callback.

| Body | Type |
|---|---|
| `code` | string, the 6-digit code or a 10-character recovery code |

**200** `{ "user": User }` with `sessionMfa: true`, and the session cookie.
**Errors:** `401` `code: "bad_code"` · `401` `code: "mfa_expired"` when the pending sign-in is older than 5 minutes or had 5 wrong codes; sign in again · `429`

### POST /api/auth/logout

Sign out this device: ends its session and clears the cookie. **Public** (does nothing harmful without a session).
**200** `{ "message": "Logged out" }`

### POST /api/auth/forgot-password

Email a password reset link, valid for one hour. **Public.** Answers the same whether or not the email has an account, so it can't be used to find accounts. At most one email per account per minute. Also works for a Google-only account, which then gets its first password.

| Body | Type |
|---|---|
| `email` | string |

**200** `{ "message": "If that email has an account, a reset link is on its way" }`
**Errors:** `400` invalid email · `429`

### POST /api/auth/reset-password

Set a new password from the emailed link. Signs out every device. **Public.**

| Body | Type | Notes |
|---|---|---|
| `token` | string | `<userId>.<token>` from the link's `#token=` fragment |
| `password` | string | Same rules as registration |

**200** `{ "message": "Password has been reset" }`
**Errors:** `400` `This reset link is invalid or has expired`, or a password the policy refuses · `429`

### GET /api/auth/google

Start signing in with Google: redirects to Google's consent screen. **Public.** Open it as a page, not with `fetch`.
**302** to Google. **Errors:** `503` when Google sign-in isn't configured.

### GET /api/auth/google/callback

Google redirects here with `code` and `state`. **Public**; not called directly. Verifies the Google identity, then

- signs in the account linked to that Google account, or the account with the same verified email (and links it), or creates a new vendor account;
- redirects to `/dashboard`, to `/account/profile?onboarding=1` for a new account, or to `/login/verify` when two-step verification is on;
- on failure redirects to `/login?error=<reason>`: `google_state`, `google_exchange`, `google_unverified_email` or `google_unavailable`.

When the flow was started by [`GET /api/auth/google/link`](#get-apiauthgooglelink), it links Google to the signed-in account instead and redirects to `/account/settings?section=password&google=<outcome>`: `linked`, `taken` (that Google account belongs to another user), `session` or `error`.

### GET /api/auth/avatar/:userId

A user's profile picture. **Public.** Cached privately for 5 minutes.
**200** the image (`image/jpeg`, `image/png`, `image/webp` or `image/gif`).
**Errors:** `404` no picture

### GET /api/auth/me

The signed-in account. **Signed in.**
**200** `{ "user": User }` with the account fields.

### PATCH /api/auth/me

Change the display name. **Signed in.**

| Body | Type | Rules |
|---|---|---|
| `displayName` | string | At most 60 characters; blank goes back to the default |

**200** `{ "user": User }` · **Errors:** `400`

### DELETE /api/auth/me

Delete the account permanently, with its business profile, saved TORs, notifications, chat and picture. Error reports it sent stay, without the reporter. **Vendor, re-auth.** Admin accounts can't be deleted here.

| Body | Type | Notes |
|---|---|---|
| `currentPassword` | string | For accounts with a password |
| `confirmEmail` | string | For Google-only accounts: the account's email |

**200** `{ "message": "Account deleted" }` and the cookie is cleared.
**Errors:** `400` `Type your account email to confirm` · `401` wrong password or `reauth_required` · `403` admin account

### PUT /api/auth/password

Change the password, or set a first one on a Google-only account. Signs out every other device; this one stays signed in. **Signed in, re-auth.**

| Body | Type | Notes |
|---|---|---|
| `currentPassword` | string | Required when the account already has one |
| `newPassword` | string | Same rules as registration |

**200** `{ "user": User }` · **Errors:** `400` policy · `401` `Current password is incorrect` or `reauth_required`

### PUT /api/auth/email

Change the sign-in email. An account without a password must set one first. A linked Google sign-in keeps working. **Signed in, re-auth.**

| Body | Type |
|---|---|
| `email` | string |
| `currentPassword` | string |

**200** `{ "user": User }`
**Errors:** `400` invalid email or `Set a password before changing your email` · `401` · `409` `Email is already registered`

### GET /api/auth/reauth

Whether this session may make sensitive changes now, and how to re-authenticate. **Signed in.**
**200** `{ "fresh": false, "methods": ["password", "totp"], "windowMs": 600000 }`

### POST /api/auth/reauth

Confirm the account's factors so this session may make sensitive changes for 10 minutes. **Signed in.** Rate limited.

| Body | Type | Notes |
|---|---|---|
| `currentPassword` | string | If the account has a password |
| `mfaCode` | string | If two-step verification is on |

**200** `{ "fresh": true, "windowMs": 600000 }`
**Errors:** `400` `code: "reauth_google"` for a Google-only account: sign in with Google again · `401` `code: "bad_credentials"` · `429`

### POST /api/auth/mfa/setup

Start setting up an authenticator app. **Signed in, re-auth.**
**200**

```json
{ "secret": "JBSWY3DPEHPK3PXP", "otpauthUrl": "otpauth://totp/…", "qrSvg": "<svg …>" }
```

Show the QR code, then confirm with [`POST /api/auth/mfa/enable`](#post-apiauthmfaenable).
**Errors:** `409` `Two-step verification is already on`

### POST /api/auth/mfa/enable

Confirm the new authenticator with a code and turn two-step verification on. This session counts as verified from now on. **Signed in.**

| Body | Type |
|---|---|
| `code` | string, the 6-digit code from the app |

**200** `{ "recoveryCodes": ["…"], "user": User }`. The 10 recovery codes are shown only this once.
**Errors:** `400` `code: "bad_code"` when the code is wrong or the setup expired

### POST /api/auth/mfa/disable

Turn two-step verification off. **Signed in, re-auth.** Admins can't.
**200** `{ "user": User }` · **Errors:** `400` not on · `403` admin account

### POST /api/auth/mfa/recovery-codes

Replace every recovery code with 10 new ones. **Signed in, re-auth.**
**200** `{ "recoveryCodes": ["…"], "user": User }` · **Errors:** `400` two-step verification is not on

### GET /api/auth/sessions

The account's signed-in devices, most recently used first. **Signed in.**
**200**

```json
{ "data": [{ "id": "…", "current": true, "active": true, "device": { "browser": "Chrome", "os": "macOS", "type": "desktop" }, "ip": "203.0.113.5", "method": "password", "createdAt": "…", "lastSeenAt": "…" }] }
```

`active` means used in the last 24 hours; `method` is `password` or `google`.

### DELETE /api/auth/sessions/:id

Sign one device out. Signing out this device is a logout and clears the cookie; another device needs **re-auth**. **Signed in.**
**204** · **Errors:** `400` invalid id · `401` `reauth_required` · `404` not one of your sessions

### POST /api/auth/logout-others

Sign out every device except this one. **Signed in, re-auth.**
**200** `{ "user": User }`

### GET /api/auth/reports

The error reports this account sent, newest first (up to 200). Who resolved a report stays private. **Signed in.**
**200**

```json
{ "data": [{ "id": "…", "description": "วันปิดรับน่าจะผิดปี", "status": "resolved", "createdAt": "…", "resolution": { "note": "แก้วันแล้ว", "resolvedAt": "…" }, "tor": { "id": "…", "title": "…", "agency": "…", "projectCode": "…", "category": "…" } }] }
```

`resolution` is null while open; `tor` is null when the TOR is no longer public.

### POST /api/auth/avatar

Upload or replace the profile picture. **Signed in.** `multipart/form-data` with one file field `avatar`: JPEG, PNG, WebP or GIF, at most 5 MB. The file's bytes are checked, not just its declared type.
**200** `{ "user": User }` · **Errors:** `400` missing, too large or not an allowed image

### GET /api/auth/google/link

Start connecting Google to the signed-in account. **Signed in, re-auth.** Open it as a page. Without a recent re-authentication it redirects to `/account/settings?section=password&google=reauth`.
**302** to Google; Google returns to [`/api/auth/google/callback`](#get-apiauthgooglecallback). **Errors:** `503` Google sign-in not configured

### DELETE /api/auth/google

Disconnect Google. Only for accounts with a password, so the account keeps a way to sign in. **Signed in, re-auth.**
**200** `{ "user": User }` · **Errors:** `400` `Set a password before disconnecting Google` · `401`

## TORs

Only TORs the AI has processed and kept as software procurement are public.

### GET /api/tors

Search, filter, sort and page TORs. **Optional session:** a signed-in vendor's hidden TORs are left out.

| Query | Type | Notes |
|---|---|---|
| `q` | string | Up to 200 characters. Case-insensitive match on title, agency, project code, AI summary, key points and technologies |
| `agency` | string, repeatable | Exact agency names (see [`/api/tors/agencies`](#get-apitorsagencies)) |
| `category` | string, repeatable | Category slugs |
| `tech` | string, repeatable | Up to 20; whole value, case-insensitive |
| `projectType` | string, repeatable | |
| `status` | string, repeatable | `draft`, `open`, `closing_soon`, `closed`, `awarded`, `cancelled` (the `displayStatus`) |
| `budgetMin`, `budgetMax` | number | Baht, inclusive |
| `publishedFrom`, `publishedTo` | date | Announcement date range, inclusive |
| `deadlineFrom`, `deadlineTo` | date | Bid deadline range; TORs without one don't match |
| `sort` | string | `announcementDate` (default), `bidDeadline`, `hearingEnd`, `budget` |
| `order` | `asc` \| `desc` | Default: newest, soonest deadline, soonest hearing end, largest budget |
| `page`, `pageSize` | number | `pageSize` 1–100, default 20 |

Repeat a key for several values: `?status=open&status=closing_soon`.

**200** a page of [TOR summaries](#tor-summary), plus `sort`, `order` and `totalBudget` (the sum over every match, using the reference price when there is no budget).

```http
GET /api/tors?q=CCTV&status=open&sort=bidDeadline&pageSize=24
```

**Errors:** `400` e.g. `budgetMin must not exceed budgetMax`, `publishedFrom must not be after publishedTo`

### GET /api/tors/price-stats

Price spread per category, for comparing a TOR's budget. **Public.** Takes the same filters as [`GET /api/tors`](#get-apitors), plus `groupBy=category` (the only grouping). Uses the reference price, or the budget when there is none.
**200**

```json
{ "groupBy": "category", "groups": [{ "key": "information-system", "count": 42, "min": 250000, "p25": 980000, "median": 2400000, "p75": 6100000, "max": 48000000 }] }
```

Groups are sorted by `count`, largest first.

### GET /api/tors/agencies

Every agency with at least one public TOR, in Thai alphabetical order. **Public.**
**200** `{ "data": ["สำนักการแพทย์", "…"], "totalCount": 312 }` (`totalCount` is the number of public TORs)

### GET /api/tors/technologies

Technologies across public TORs, most used first. **Public.**
**200** `{ "data": [{ "name": "PostgreSQL", "count": 18 }] }`

### GET /api/tors/:id

One public TOR in full. **Public.**
**200** `{ "tor": TOR detail }` · **Errors:** `400` invalid id · `404`

### GET /api/tors/:id/document

The stored TOR PDF, shown inline in the browser. **Public.**
**200** `application/pdf` · **Errors:** `404` no stored PDF · `502` storage unavailable

### POST /api/tors/:id/report

Report that a TOR's data is wrong. Administrators review it. **Optional session.**

| Body | Type | Rules |
|---|---|---|
| `description` | string | 5–2,000 characters |
| `reporterEmail` | string | Optional contact for a visitor without an account; ignored when signed in |

**201** `{ "report": { "id": "…", "torId": "…", "status": "open", "createdAt": "…" } }`
**Errors:** `400` · `404` TOR not found · `429`

### POST /api/tors/:id/view

Count one view of a TOR's page. The frontend calls it once per TOR per browser tab. **Public.**
**204** · **Errors:** `400` invalid id · `404` · `429`

## Vendor

Everything here works on the caller's own data.

### GET /api/vendor/profile

The business profile, created empty on first access. **Vendor or admin.**
**200** `{ "profile": Profile }`

| Profile field | Type |
|---|---|
| `_id`, `userId` | string |
| `companyName`, `businessType`, `serviceArea` | string |
| `registeredCapital`, `yearsExperience`, `teamSize` | number |
| `certifications`, `technologyStack`, `interestedCategories` | string[] |
| `budgetRange` | `{ min, max }` |
| `emailAlertsEnabled` | boolean, master switch for match emails |
| `savedSearches`, `hiddenTors`, `dayNotes` | also served by their own endpoints below |
| `createdAt`, `updatedAt` | date |

### PUT /api/vendor/profile

Replace the editable profile fields. A field left out is cleared, except `emailAlertsEnabled`, which changes only when sent. **Vendor or admin.**

| Body | Type | Rules |
|---|---|---|
| `companyName`, `businessType`, `serviceArea` | string | At most 200 characters |
| `registeredCapital`, `yearsExperience`, `teamSize` | number | ≥ 0 |
| `certifications`, `technologyStack`, `interestedCategories` | string[] | At most 100 items of 120 characters |
| `budgetMin`, `budgetMax` (or `budgetRange: { min, max }`) | number | ≥ 0, min ≤ max |
| `emailAlertsEnabled` | boolean | |

**200** `{ "profile": Profile }` · **Errors:** `400` the message names the field

### GET /api/vendor/profile/saved-searches

The vendor's saved searches, oldest first. **Vendor.**
**200** `{ "savedSearches": [{ "_id": "…", "name": "CCTV สำนักการแพทย์", "filters": { "q": "CCTV", "status": ["open"], "sort": "bidDeadline", "order": "asc" }, "alertsEnabled": true, "createdAt": "…" }] }`

### POST /api/vendor/profile/saved-searches

Save a search. **Vendor.**

| Body | Type | Rules |
|---|---|---|
| `name` | string | Required, at most 200 characters |
| `filters` | object | The query fields of [`GET /api/tors`](#get-apitors) except `page` and `pageSize`; repeatable ones as arrays. Must be a valid search, at most 4 KB |
| `alertsEnabled` | boolean | Notify in the app and by email when a new TOR matches |

**201** `{ "savedSearch": SavedSearch }`
**Errors:** `400` e.g. `filters has unknown fields: …`, `filters is not a valid search`, or `You can keep at most 50 saved searches`

### PATCH /api/vendor/profile/saved-searches/:searchId

Change any of `name`, `filters`, `alertsEnabled`. **Vendor.**
**200** `{ "savedSearch": SavedSearch }` · **Errors:** `400` · `404`

### DELETE /api/vendor/profile/saved-searches/:searchId

Delete a saved search. **Vendor.**
**204** · **Errors:** `404`

### GET /api/vendor/matches

Open TORs (draft, open or closing soon) ranked by how well they match the business profile. Hidden TORs are left out. **Vendor or admin.**

| Query | Type |
|---|---|
| `page`, `pageSize` | number, `pageSize` 1–100, default 20 |

**200** a page of `{ "tor": TOR summary, "matchScore": 85, "matchedCriteria": ["category", "technologyStack"] }`. `matchScore` is 0–100; `matchedCriteria` lists which of `category`, `technologyStack` and `budgetRange` matched.

### GET /api/vendor/bookmarks

Saved TORs, newest first, for the saved list and the application board. TORs no longer public are left out. **Vendor or admin.**
**200** `{ "data": [Bookmark & { "tor": TOR summary }] }`

| Bookmark field | Type |
|---|---|
| `torId` | string |
| `applicationStatus` | `interested`, `preparing`, `submitted`, `missed` |
| `note` | string \| null |
| `bookmarkedAt`, `updatedAt` | date |

### PUT /api/vendor/bookmarks/:torId

Save a TOR. Saving one already saved keeps its status. **Vendor or admin.**

| Body (optional) | Type | Rules |
|---|---|---|
| `applicationStatus` | string | One of the four above |
| `note` | string | At most 2,000 characters |

**200** `{ "bookmark": Bookmark }` · **Errors:** `400` invalid id, or more than 1,000 saved TORs · `404` TOR not found

### PATCH /api/vendor/bookmarks/:torId

Change the application status or note. **Vendor or admin.** Same body as above; at least one field.
**200** `{ "bookmark": Bookmark }` · **Errors:** `400` `Nothing to update` · `404` `Bookmark not found`

### DELETE /api/vendor/bookmarks/:torId

Remove a saved TOR. Removing one that isn't saved also succeeds. **Vendor or admin.**
**204**

### GET /api/vendor/hidden-tors

TORs the vendor hid from search results and matches, most recent first. **Vendor.**
**200** `{ "data": [{ "torId": "…", "hiddenAt": "…", "tor": TOR summary }] }`

### PUT /api/vendor/hidden-tors/:torId

Hide a TOR. Hiding one already hidden also succeeds. **Vendor.**
**204** · **Errors:** `400` invalid id · `404` TOR not found · `409` more than 1,000 hidden TORs

### DELETE /api/vendor/hidden-tors/:torId

Show a hidden TOR again. **Vendor.**
**204**

### GET /api/vendor/day-notes

Every note on the deadline calendar, keyed by day. **Vendor or admin.**
**200** `{ "notes": { "2026-11-20": "ยื่นซองก่อนบ่ายสาม" } }`

### PUT /api/vendor/day-notes/:date

Set one day's note; an empty note removes it. `:date` is `YYYY-MM-DD`. **Vendor or admin.**

| Body | Type | Rules |
|---|---|---|
| `note` | string | At most 2,000 characters |

**204** · **Errors:** `400` not a real day · `409` more than 1,000 notes

### GET /api/vendor/notifications

In-app notifications, newest first, with the unread count for the bell. **Vendor or admin.**

| Query | Type |
|---|---|
| `page`, `pageSize` | number, `pageSize` 1–50, default 20 |

**200** a page of notifications, plus `unreadCount`:

```json
{ "id": "…", "type": "saved_search_match", "message": "TOR ใหม่ตรงกับการค้นหาที่บันทึกไว้ \"Cloud\": …", "savedSearchId": "…", "read": false, "createdAt": "…", "tor": { "id": "…", "title": "…", "agency": "…", "projectCode": "…", "category": "…", "isPublic": true } }
```

`type` is `profile_match`, `saved_search_match` or `deadline_reminder`. `tor.isPublic` is false when the TOR has since been hidden.

### PATCH /api/vendor/notifications/:id/read

Mark one notification read. **Vendor or admin.**
**200** `{ "id": "…", "read": true }` · **Errors:** `400` invalid id · `404`

## Chat

One thread per account with the admin team.

### GET /api/chat/conversation

The caller's thread and its messages, oldest first (the latest 100). **Signed in.**

| Query | Type | Notes |
|---|---|---|
| `after` | message id | For polling: only messages newer than this one |

**200** `{ "conversation": { "id": "…", "status": "open", "unread": 1 }, "messages": [{ "id": "…", "from": "admin", "text": "…", "createdAt": "…" }] }`. Before the first message: `{ "conversation": null, "messages": [] }`. `unread` counts admin replies the user hasn't read; `from` is `visitor` or `admin`.

### POST /api/chat/messages

Send a message to the team. The first message starts the thread; writing to a closed thread reopens it. **Signed in.**

| Body | Type | Rules |
|---|---|---|
| `text` | string | 1–2,000 characters |

**201** `{ "conversation": { "id": "…" }, "message": Message }` · **Errors:** `400` · `429`

### POST /api/chat/read

Mark the team's replies as read. **Signed in.**
**204**

## Help center

Published content only.

### GET /api/help

The help-center front page in one request. **Public.**
**200**

```json
{
  "categories": [{ "slug": "search", "label": "การค้นหาและตัวกรอง TOR", "count": 6 }],
  "announcements": [{ "id": "…", "title": "…", "kind": "news", "pinned": true, "ended": false, "publishedAt": "…" }],
  "announcementCount": 9,
  "faqs": [{ "id": "…", "question": "…", "category": "search" }]
}
```

Up to 5 announcements (pinned and still running first, then newest; ended ones last) and up to 8 featured FAQs.

### GET /api/help/announcements

Every published announcement, in the same order. **Public.**
**200** `{ "data": [Announcement summary] }`

### GET /api/help/announcements/:id

One published announcement. **Public.**
**200** `{ "announcement": { …summary, "body": "…", "endsAt": null, "updatedAt": "…" } }` · **Errors:** `404`

### GET /api/help/faqs

Published FAQs in category order. **Public.**

| Query | Type | Notes |
|---|---|---|
| `category` | string | `getting-started`, `search`, `tor-details`, `ai-summary`, `vendor-profile`, `saved-tracking`, `account-security`, `data-reports` |
| `q` | string | Up to 100 characters; case-insensitive match on the question and answer |

**200** `{ "data": [{ "id": "…", "question": "…", "category": "…" }] }` · **Errors:** `400`

### GET /api/help/faqs/:id

One published FAQ and up to 5 others from its category. **Public.**
**200** `{ "faq": { "id": "…", "question": "…", "category": "…", "answer": "…", "updatedAt": "…" }, "related": [FAQ summary] }` · **Errors:** `404`

## Admin

Every endpoint here needs **Admin** access. Each state-changing request is written to the audit log with the admin, the route, the outcome and the names of the fields sent.

### GET /api/admin/stats

Numbers for the admin dashboard. TORs are counted by when they entered the system, in Bangkok time.

| Query | Type |
|---|---|
| `months` | `5` (default) or `8`: how many months of history |

**200**

```json
{
  "createdToday": 4, "createdYesterday": 7, "flaggedCount": 12,
  "lastDiscovery": { "status": "success", "startedAt": "…", "completedAt": "…" },
  "lastEnrichment": { "status": "partial", "startedAt": "…", "completedAt": "…" },
  "runs30d": { "finished": 60, "succeeded": 57 },
  "monthly": [{ "month": "2026-07", "count": 120 }]
}
```

`flaggedCount` is public TORs with at least one open fairness flag. `lastDiscovery` and `lastEnrichment` are null before the first run.

### GET /api/admin/tors

Public TORs for review, with all their fairness flags. Takes every query of [`GET /api/tors`](#get-apitors), plus:

| Query | Type | Notes |
|---|---|---|
| `flagged` | `true` | Only TORs with an open fairness flag |

**200** a page of TOR summaries with `fairnessFlags`, plus `flaggedCount` (TORs with open flags under the same filters).

### GET /api/admin/tors/reported

TORs with open error reports, most recently reported first.

| Query | Type |
|---|---|
| `page`, `pageSize` | number, `pageSize` 1–50, default 20 |

**200** a page of:

```json
{
  "tor": { "id": "…", "title": "…", "projectCode": "…", "agency": "…", "isPublic": true },
  "openReportCount": 2,
  "latestReport": { "id": "…", "description": "…", "createdAt": "…", "reporter": Person, "reporterEmail": null }
}
```

`reporter` is null for a visitor without an account, who may have left a `reporterEmail`.

### GET /api/admin/tors/:id

One public TOR in the same shape as an [`/api/admin/tors`](#get-apiadmintors) row, for the edit form.
**200** `{ "tor": … }` · **Errors:** `400` · `404`

### GET /api/admin/tors/:id/fairness-flags

Each fairness flag with the reasoning and data points behind it. The public TOR API leaves those two out.
**200**

```json
{
  "tor": { "_id": "…", "title": "…", "budget": 2000000, "referencePrice": 1500000, "…": "…" },
  "flags": [{
    "_id": "…", "field": "budget", "severity": "high", "message": "งบประมาณสูงกว่าราคากลางประมาณ 33%",
    "confidence": "high", "reasoning": "…", "status": "open", "detectedAt": "…",
    "dataPoints": [{ "label": "งบประมาณ", "value": "2,000,000 บาท", "source": "system" }]
  }]
}
```

`source` says whether the system or the AI supplied the data point. Flags made before these fields existed have `confidence` and `reasoning` null and no data points.
**Errors:** `400` · `404`

### PATCH /api/admin/tors/:id

Correct what the system read wrongly, mark the fairness flags reviewed, and resolve the TOR's error reports. Every field is optional; unknown fields are refused. Changes are recorded in the system log with their old and new values.

| Body | Type | Notes |
|---|---|---|
| `title` | string | 1–500 characters |
| `agency` | string | 1–200 characters |
| `category` | string | A category slug |
| `budget` | number \| null | ≥ 0; null clears it |
| `submissionDeadline` | date \| null | The deadline read from the TOR document |
| `status` | `open`, `closing_soon`, `closed` | `closed` closes the TOR by hand |
| `bidDeadline` | `YYYY-MM-DD` \| null | The real bid deadline, to the end of that Bangkok day; only once the TOR has procurement data |
| `resolveFlags` | boolean | Mark every open fairness flag as acknowledged |
| `resolveReports` | boolean | Resolve every open error report on this TOR |
| `resolutionNote` | string | At most 1,000 characters; only with `resolveReports` |

**200** `{ "tor": … }` as in [`GET /api/admin/tors/:id`](#get-apiadmintorsid)
**Errors:** `400` · `404` · `409` `TOR has no procurement data yet; wait for the next lifecycle refresh` (for `bidDeadline`)

### DELETE /api/admin/tors/:id

Take a TOR off the public site. It is not deleted, because the next ingestion run would only create it again; it is marked rejected instead.
**204** · **Errors:** `404`

### GET /api/admin/reports

Error reports, newest first, with the reporter and the TOR.

| Query | Type | Notes |
|---|---|---|
| `status` | `open` (default), `resolved`, `all` | |
| `torId` | id | Only one TOR's reports |
| `page`, `pageSize` | number | `pageSize` 1–50, default 20 |

**200** a page of reports, plus `counts: { "open": 3, "resolved": 41 }`:

```json
{
  "id": "…", "description": "…", "status": "resolved", "createdAt": "…",
  "reporter": Person, "reporterEmail": null,
  "tor": { "id": "…", "title": "…", "projectCode": "…", "agency": "…", "isPublic": true },
  "resolution": { "note": "…", "resolvedAt": "…", "resolvedBy": Person }
}
```

### PATCH /api/admin/reports/:id

Resolve a report, with an optional note, or reopen it.

| Body | Type | Rules |
|---|---|---|
| `status` | `resolved` \| `open` | Required |
| `resolutionNote` | string | At most 1,000 characters |

**200** `{ "report": { "id": "…", "status": "resolved", "resolvedAt": "…" } }` · **Errors:** `400` · `404`

### GET /api/admin/settings/fairness-prefilter

The thresholds that decide which AI fairness signals are published, and the defaults.
**200**

```json
{
  "settings": { "budgetDeviationPercent": 30, "minBidWindowDays": 7, "minSeverity": "low" },
  "defaults": { "budgetDeviationPercent": 30, "minBidWindowDays": 7, "minSeverity": "low" },
  "isDefault": true, "updatedAt": null, "updatedBy": null
}
```

### PUT /api/admin/settings/fairness-prefilter

Replace all three thresholds. They apply from the next AI enrichment run; TORs already processed keep their flags until processed again.

| Body | Type | Rules |
|---|---|---|
| `budgetDeviationPercent` | number | 1–500. A budget signal is kept only when the budget differs from the reference price by at least this much |
| `minBidWindowDays` | integer | 1–90. A deadline signal is kept only when the bid window is shorter than this |
| `minSeverity` | `low`, `medium`, `high` | Signals below it are dropped |

**200** same shape as GET, with `isDefault: false` · **Errors:** `400` a missing, unknown or out-of-range field; the saved values don't change

### GET /api/admin/notifications

The admin's own pipeline alerts, newest first (the latest 50), with the unread count.
**200** `{ "data": [{ "id": "…", "type": "pipeline_run_failed", "message": "…", "ingestionRunId": "…", "read": false, "readAt": null, "createdAt": "…" }], "unreadCount": 1 }`

### PATCH /api/admin/notifications/:id/read

Mark one of the admin's alerts read.
**200** `{ "id": "…", "read": true, "readAt": "…" }` · **Errors:** `400` · `404`

### GET /api/admin/logs

System logs, newest first.

| Query | Type | Notes |
|---|---|---|
| `severity` | `info`, `warning`, `error` | |
| `source` | `ingestion`, `ai-pipeline`, `application` | |
| `q` | string | Up to 200 characters; matches the component and the message |
| `from`, `to` | date or date-time | Inclusive; include a time zone offset |
| `page`, `pageSize` | number | `pageSize` 1–100, default 50 |

**200** a page of `{ _id, source, component, severity, message, context, ingestionRunId, timestamp }`, plus `counts: { "info": 120, "warning": 4, "error": 1 }` under the other filters.
**Errors:** `400` e.g. `from must not be after to`

### GET /api/admin/users

Find accounts by part of their email (up to 20), with how many devices each is signed in on.

| Query | Type | Rules |
|---|---|---|
| `email` | string | At least 3 characters |

**200** `{ "data": [{ "id": "…", "email": "…", "role": "vendor", "sessions": 2 }] }` · **Errors:** `400`

### POST /api/admin/users/:id/sessions/revoke

Sign a user out of every device.
**200** `{ "ended": 2 }` · **Errors:** `400` · `404`

### POST /api/admin/sessions/revoke-all

Sign every user out of every device, except the calling admin's own session. **Admin, re-auth.**
**200** `{ "ended": 57 }` · **Errors:** `401` `reauth_required`

### GET /api/admin/chats

The chat inbox, by latest message.

| Query | Type | Notes |
|---|---|---|
| `status` | `open` (default), `closed`, `all` | |
| `page`, `pageSize` | number | `pageSize` 1–50, default 20 |

**200** a page of threads, plus `counts: { "open": 4, "closed": 20, "unread": 2 }`:

```json
{ "id": "…", "status": "open", "visitor": Person, "lastMessageAt": "…", "lastMessagePreview": "…", "lastMessageFrom": "visitor", "unread": 1, "createdAt": "…" }
```

`visitor` is null when the account has been deleted.

### GET /api/admin/chats/:id/messages

A thread's messages, oldest first (the latest 100). Takes `after` like [`GET /api/chat/conversation`](#get-apichatconversation).
**200** `{ "messages": [Message] }` · **Errors:** `400` · `404`

### POST /api/admin/chats/:id/messages

Reply in a thread. Body `{ "text": "…" }`, 1–2,000 characters.
**201** `{ "message": Message }` · **Errors:** `400` · `404`

### POST /api/admin/chats/:id/read

Mark the visitor's messages as read.
**204** · **Errors:** `400` · `404`

### PATCH /api/admin/chats/:id

Close or reopen a thread. Body `{ "status": "open" | "closed" }`.
**200** `{ "chat": { "id": "…", "status": "closed" } }` · **Errors:** `400` · `404`

### GET /api/admin/help/announcements

Every announcement: drafts first (latest edit first), then published ones in the public order.
**200** `{ "data": [Announcement] }` with every stored field

### POST /api/admin/help/announcements

Create an announcement.

| Body | Type | Rules |
|---|---|---|
| `title` | string | Required, 3–200 characters |
| `body` | string | Required, at most 20,000 characters |
| `kind` | `news` (default), `update`, `maintenance` | |
| `pinned` | boolean | |
| `status` | `draft` (default) \| `published` | Publishing sets `publishedAt` |
| `endsAt` | date-time with offset \| null | When the notice stops being current |

**201** `{ "announcement": Announcement }` · **Errors:** `400`

### PATCH /api/admin/help/announcements/:id

Change any of the fields above.
**200** `{ "announcement": Announcement }` · **Errors:** `400` · `404`

### DELETE /api/admin/help/announcements/:id

**204** · **Errors:** `400` · `404`

### GET /api/admin/help/faqs

Every FAQ, drafts included, by category and order.
**200** `{ "data": [FAQ] }`

### POST /api/admin/help/faqs

Create a FAQ.

| Body | Type | Rules |
|---|---|---|
| `question` | string | Required, 3–300 characters |
| `answer` | string | Required, at most 20,000 characters |
| `category` | string | Required, a help category slug (see [`/api/help/faqs`](#get-apihelpfaqs)) |
| `featured` | boolean | Shown on the help front page |
| `order` | integer | 0–100,000; position within the category |
| `status` | `draft` (default) \| `published` | |

**201** `{ "faq": FAQ }` · **Errors:** `400`

### PATCH /api/admin/help/faqs/:id

Change any of the fields above.
**200** `{ "faq": FAQ }` · **Errors:** `400` · `404`

### DELETE /api/admin/help/faqs/:id

**204** · **Errors:** `400` · `404`

## Ingestion

Start and watch the jobs that bring TORs in. They also run on a schedule (Cloud Scheduler); these endpoints run them now. Every endpoint needs **Admin** access and is audit-logged. A run that starts work answers `202` at once and keeps going in the background; follow it with [`GET /api/ingestion/runs`](#get-apiingestionruns).

### POST /api/ingestion/runs

Discover new TORs on e-GP now.

| Body (all optional) | Type | Rules |
|---|---|---|
| `maxProjects` | integer | 1–500, default 50 (`INGEST_DEFAULT_MAX_PROJECTS`) |
| `searchText` | string | At most 200 characters, default `ซอฟต์แวร์` (`INGEST_DEFAULT_SEARCH`) |
| `lookbackDays` | integer | 1–6,000, default 7 (`INGEST_LOOKBACK_DAYS`) |
| `announceAllTypes` | boolean | Include every announcement type, not only the usual ones |

**202** `{ "runId": "…", "status": "running" }` · **Errors:** `400` · `409` a run is already in progress

### GET /api/ingestion/runs

Recent runs of every kind, newest first.

| Query | Type |
|---|---|
| `limit` | integer 1–100, default 20 |

**200** `{ "runs": [IngestionRun] }`

| IngestionRun field | Type | Notes |
|---|---|---|
| `_id` | string | |
| `trigger` | `scheduled` \| `manual` | |
| `phase` | `discovery`, `enrichment`, `lifecycle`, `capture` | |
| `triggeredBy` | string \| null | The admin, for manual runs |
| `status` | `running`, `success`, `partial`, `failed` | A run whose worker died shows as failed |
| `startedAt`, `completedAt` | date | |
| `stats` | object | Counters: `torsFound`, `torsCreated`, `torsUpdated`, `torsFailed`, `torsSkipped`, `torsUnchanged`, `enrichedOk`, `enrichedRejected`, `enrichedFailed`, `enrichmentPlanned`, `enrichmentRetried` |
| `outcomeSummary` | string | |

### GET /api/ingestion/runs/:id

One run. **200** `{ "run": IngestionRun }` · **Errors:** `400` · `404`

### POST /api/ingestion/enrichment/runs

Send the TORs waiting for AI to Gemini now. When it finishes it refreshes the new TORs' procurement stage and notifies matching vendors.

| Body (optional) | Type | Rules |
|---|---|---|
| `maxCalls` | integer | 1–200; default from `MAX_AI_CALLS_PER_RUN` |

**202** `{ "status": "running" }` · **Errors:** `400` · `409` an enrichment run is already in progress

### GET /api/ingestion/enrichment/pending

How many TORs the next enrichment run would process.
**200** `{ "runnable": 35, "maxCalls": 20, "willProcess": 20 }`

### POST /api/ingestion/lifecycle/runs

Check e-GP now for each TOR's procurement stage and bid deadline.

| Body (all optional) | Type | Rules |
|---|---|---|
| `maxTors` | integer | 1–300; default from `MAX_LIFECYCLE_REFRESH_PER_RUN` |
| `maxDeadlineExtractions` | integer | 1–200 invitation PDFs to read for the bid deadline; default from `MAX_DEADLINE_EXTRACTIONS_PER_RUN` |
| `onlyOpen` | boolean | Only TORs still open for bids |
| `onlyDraft` | boolean | Only TORs still in draft |

**202** `{ "status": "running" }` · **Errors:** `400` · `409` a refresh is already in progress

### GET /api/ingestion/lifecycle/pending

How many TORs the next refresh would check. Takes `onlyOpen` and `onlyDraft` as `true` or `1`.
**200** `{ "candidates": 140, "maxTors": 100, "willCheck": 100, "maxDeadlineExtractions": 30 }`

### POST /api/ingestion/capture

Add projects the admin collected from the e-GP search page with the Chrome extension. Called by the extension, which may send from its own origin.

| Body | Type | Rules |
|---|---|---|
| `projects` | array | 1–100 items; repeated project codes are dropped |
| `projects[].projectCode` | string | 11 digits |
| `projects[].title`, `projects[].agency` | string | Optional hints, at most 500 characters |

**202** `{ "runId": "…", "status": "running" }`
**Errors:** `400` · `409` a capture run is already in progress · `503` the e-GP source is turned off (`GPROC_ENABLED=false`) or file storage is not configured

### GET /api/ingestion/capture/pending

Captured TORs that have no PDF yet, so they are not queued for AI.
**200** `{ "stuck": 3 }`
