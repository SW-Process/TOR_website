# Input Validation Rules

**ASVS 5.0 requirement:** 2.1.1 (Level 1): *"Verify that the application's documentation defines input validation rules for how to check the validity of data items against an expected structure."*

This document lists every piece of input TOR Checker accepts and the rule it must pass. The code is the source of truth; each section names the file that enforces the rule.

## 1. General rules

These apply to every endpoint.

| Rule | How it is enforced | ASVS |
| --- | --- | --- |
| Validation happens on the server | Every rule below runs in the Express backend. Checks in the Next.js frontend only give faster feedback and are never relied on. | 2.2.2 |
| Positive validation | Inputs are checked against allowed types, lengths, ranges, patterns and enum values, using [Zod](https://zod.dev) schemas or explicit checks in each controller. Anything that doesn't match is rejected, never "cleaned up". | 2.2.1 |
| Unknown fields are refused | Request bodies that change data use `.strict()` schemas where marked **strict** below, so a client cannot set a field the endpoint didn't intend (e.g. `role`, `pipelineStatus`). | 15.3.3 |
| Body size | JSON bodies are limited to 100 KB (`express.json()` default). File uploads have their own limit (section 9). | 5.2.1 |
| No query operators from the client | Express 5 parses query strings with the "simple" parser, so `?status[$ne]=x` arrives as a plain string, not an object. Values are then checked by Zod, so they can't be turned into MongoDB operators. | 1.2.4 |
| Database ids | Every `:id` path parameter that is a MongoDB ObjectId is checked with `isValidObjectId()` before it reaches a query. An invalid id answers `400` (or `404` on public pages). | 2.2.1 |
| Text search | User search text is escaped with `escapeRegExp()` before it is used in a `$regex`, so it is always matched literally. | 1.2.4 |
| Second layer | Mongoose schemas repeat the important limits (enums, `maxlength`, required fields), so data written by any code path is still checked. | — |
| Error response | A failed check answers `400 Bad Request` with a short English message naming the field (e.g. `"Password must be at least 8 characters"`). The frontend translates the common ones to Thai. | 16.5.1 |

## 2. Authentication and account

Enforced in `backend/src/controllers/authController.ts` and `backend/src/utils/passwordPolicy.ts`.

| Field | Endpoint(s) | Rule |
| --- | --- | --- |
| `email` | register, login, forgot-password, change email | String matching `^[^\s@]+@[^\s@]+\.[^\s@]+$`; trimmed and lowercased before lookup and storage. |
| `password` (new) | register, reset-password, change password, `npm run create-admin` | String of **at least 8 characters**, **at most 72 bytes** in UTF-8 (about 72 English or 24 Thai characters), and **not** one of the 3,000 most common passwords (case-insensitive, `backend/src/config/commonPasswords.ts`). Any characters are allowed; there are no "must contain a number/symbol" rules (ASVS 6.2.5). |
| `password` (login) | login | String of at least 8 characters. A password longer than 72 bytes never matches, because bcrypt would only compare its first 72 bytes. |
| `currentPassword` | change password, change email, delete account | Required for accounts that have a password; must match the stored bcrypt hash. Google-only accounts have none to give. |
| `confirmEmail` | delete account (Google-only accounts) | Must equal the account's email (trimmed, lowercased). |
| `displayName` | `PATCH /api/auth/me` | String, trimmed, at most 60 characters. Blank resets it to the default. |
| `token` | reset-password | Exactly `<userId>.<secret>`: two parts split by `.`, the first a valid ObjectId. The secret is hashed with SHA-256 and compared in constant time with the stored hash; it must not be expired (1 hour) and works once. |
| `:id` | `DELETE /api/auth/sessions/:id` | Valid ObjectId of one of the caller's own sessions. |
| `code`, `state` | `GET /api/auth/google/callback` | Both strings; `state` must equal the value in the OAuth state cookie. The Google ID token must be signed for our client id and have `email_verified: true`. |

## 3. Vendor data

Enforced in `backend/src/controllers/vendorProfileController.ts`, `bookmarkController.ts`, `hiddenTorController.ts`, `dayNoteController.ts`, `notificationController.ts`, `matchController.ts`.

### Company profile (`PUT /api/vendor/profile`)

| Field | Rule |
| --- | --- |
| `companyName`, `businessType`, `serviceArea` | Optional string, trimmed, at most 200 characters. Non-strings are rejected. |
| `registeredCapital`, `yearsExperience`, `teamSize` | Optional number ≥ 0, finite. A string is accepted only if it is a plain decimal (`^-?\d+(\.\d+)?$`), so `"0x10"`, `"1e9"` and `"Infinity"` are rejected. |
| `budgetMin`, `budgetMax` (or `budgetRange.min/max`) | Same number rule; `budgetMin` must not exceed `budgetMax`. |
| `certifications`, `technologyStack`, `interestedCategories` | Optional array of at most 100 strings, each trimmed and at most 120 characters; blank entries are dropped. |

### Saved searches (`/api/vendor/profile/saved-searches`)

| Field | Rule |
| --- | --- |
| `name` | Required on create, string, trimmed, at most 200 characters. |
| `filters` | Plain object (not an array or `null`). When alerts run, it is re-checked with the same schema as the TOR search (section 5); an invalid saved filter is skipped, never run. |
| `alertsEnabled` | Boolean. |
| `:searchId` | Must be one of the caller's own saved searches, else `404`. |

### Bookmarks (`/api/vendor/bookmarks/:torId`), **strict**

| Field | Rule |
| --- | --- |
| `:torId` | Valid ObjectId of a TOR that is public (`pipelineStatus: "enriched"`). |
| `applicationStatus` | One of `interested`, `preparing`, `submitted`, `missed`. |
| `note` | String, trimmed, at most 2,000 characters. |
| (PATCH) | At least one of the two fields must be present. |

### Hidden TORs (`/api/vendor/hidden-tors/:torId`)

`:torId` must be a valid ObjectId of a public TOR. One vendor can hide at most **1,000** TORs; hiding is idempotent.

### Calendar day notes (`/api/vendor/day-notes/:date`), **strict**

| Field | Rule |
| --- | --- |
| `:date` | Must match `^\d{4}-\d{2}-\d{2}$`. This also keeps the key safe as a MongoDB field name (no `.` or `$`). |
| `note` | String of at most 2,000 characters. Blank (only spaces) deletes the note. |
| (count) | At most **1,000** notes per vendor. |

### Notifications and matches

| Endpoint | Rule |
| --- | --- |
| `GET /api/vendor/notifications` | `page` integer ≥ 1; `pageSize` integer 1–50 (default 20). |
| `PATCH /api/vendor/notifications/:id/read` | Valid ObjectId of one of the caller's notifications. |
| `GET /api/vendor/matches` | `page` integer ≥ 1; `pageSize` integer 1–100 (default 20). |

## 4. Chat with admins

Enforced in `backend/src/services/chat.ts`, `chatController.ts`, `adminChatController.ts`.

| Field | Rule |
| --- | --- |
| `text` (visitor and admin) | String, trimmed, 1–2,000 characters. |
| `after` (polling cursor) | Optional valid ObjectId. |
| Admin list: `status` | `open`, `closed` or `all`; `page` ≥ 1; `pageSize` 1–50. |
| Admin update (**strict**): `status` | `open` or `closed`. |
| `:id` | Valid ObjectId of a conversation. |

## 5. TOR search and public TOR data

Enforced in `backend/src/controllers/torController.ts`. The same schema is reused by the admin TOR list and by saved-search alerts.

| Query parameter | Rule |
| --- | --- |
| `q` | Optional string, trimmed, 1–200 characters, escaped before use in a regex. |
| `agency`, `category` | Optional string or list of strings. |
| `tech` | Optional list of at most 20 strings, each 1–100 characters; matched as whole values, case-insensitive. |
| `projectType` | Optional list of values from `PROJECT_TYPES` (`config/projectTypes.ts`). |
| `status` | Optional list of `draft`, `open`, `closing_soon`, `closed`, `awarded`, `cancelled`. |
| `budgetMin`, `budgetMax` | Optional numbers ≥ 0; `budgetMin` ≤ `budgetMax`. |
| `publishedFrom/To`, `deadlineFrom/To` | Optional dates; "from" must not be after "to". |
| `sort` | One of `announcementDate`, `bidDeadline`, `hearingEnd`, `budget`. |
| `order` | `asc` or `desc`. |
| `page`, `pageSize` | Integer ≥ 1; `pageSize` 1–100 (default 20). |
| `groupBy` (price stats) | Must be `category`. |
| `:id` (detail, document, view, report) | ObjectId of a public TOR; anything else answers `404`. |

### Reporting a TOR error (`POST /api/tors/:id/report`)

| Field | Rule |
| --- | --- |
| `description` | String, trimmed, 5–2,000 characters. |
| `reporterEmail` | Optional valid email, trimmed, lowercased, at most 200 characters. Kept only for anonymous reporters. |

## 6. Help center

Enforced in `backend/src/controllers/helpController.ts` (public) and `adminHelpController.ts` (admin).

| Field | Rule |
| --- | --- |
| Public FAQ list: `category` | Optional, one of the help category slugs (`config/helpCategories.ts`). |
| Public FAQ list: `q` | Optional string, trimmed, at most 100 characters. |
| Announcement `title` | String, trimmed, 3–200 characters. |
| Announcement `body` | String, trimmed, 1–20,000 characters. |
| Announcement `kind` | `news`, `update` or `maintenance`. |
| Announcement `pinned` | Boolean. |
| `status` | `draft` or `published`. |
| Announcement `endsAt` | ISO 8601 date-time with a time zone offset, or `null`. |
| FAQ `question` | String, trimmed, 3–300 characters. |
| FAQ `answer` | String, trimmed, 1–20,000 characters. |
| FAQ `category` | One of the help category slugs. |
| FAQ `featured` | Boolean. |
| FAQ `order` | Integer 0–100,000. |
| Create and update | **strict** |

Help text is shown as plain text with a small Markdown-like syntax. Links are only rendered when they point to a path on our site (starting with `/`, not `//`) or to an `https://` address; anything else (e.g. `javascript:`) is shown as text (`frontend/src/components/help/HelpBody.tsx`).

## 7. Admin data quality

Enforced in `backend/src/controllers/adminTorController.ts`, `adminReportController.ts`, `adminLogController.ts`.

### Correcting a TOR (`PATCH /api/admin/tors/:id`), **strict**

| Field | Rule |
| --- | --- |
| `title` | String, trimmed, 1–500 characters. |
| `agency` | String, trimmed, 1–200 characters. |
| `category` | One of the taxonomy slugs (`config/taxonomy.ts`). |
| `budget` | Number ≥ 0, or `null`. |
| `submissionDeadline` | Date, or `null`. |
| `status` | `open`, `closing_soon` or `closed`. |
| `bidDeadline` | `YYYY-MM-DD` that is a real date (stored as 23:59 Bangkok time), or `null`. |
| `resolveFlags` | Boolean. |

### Error reports and logs

| Endpoint | Rule |
| --- | --- |
| `GET /api/admin/reports` | `status` `open`, `resolved` or `all`; `page` ≥ 1; `pageSize` 1–50. |
| `PATCH /api/admin/reports/:id` (**strict**) | `status` `open` or `resolved`; `resolutionNote` trimmed, at most 1,000 characters. |
| `GET /api/admin/logs` | `severity` and `source` from fixed lists; `q` 1–200 characters; `from`/`to` dates with "from" not after "to"; `pageSize` 1–100. |
| `PATCH /api/admin/notifications/:id/read` | Valid ObjectId of one of the caller's admin notifications. |

## 8. Data ingestion (admin only)

Enforced in `backend/src/controllers/ingestionController.ts`.

| Field | Rule |
| --- | --- |
| `maxProjects` | Integer 1–500 (default `INGEST_DEFAULT_MAX_PROJECTS`, 50). |
| `lookbackDays` | Integer 1–6,000 (default `INGEST_LOOKBACK_DAYS`, 7). |
| `searchText` | String of at most 200 characters. |
| `maxCalls` (AI enrichment) | Integer 1–200. |
| `maxTors` (lifecycle) | Integer 1–300. |
| `maxDeadlineExtractions` | Integer 1–200. |
| `onlyOpen` | Boolean. |
| Capture `projects` | Array of 1–100 objects. |
| Capture `projectCode` | Exactly 11 digits (`^\d{11}$`). Duplicates are dropped (first one wins). |
| Capture `title`, `agency` | Optional strings of at most 500 characters. |

Data that comes from the e-GP systems and from Gemini is also untrusted: it is mapped field by field into the `Tor` schema, and only `enriched` TORs are ever shown publicly.

## 9. File uploads

Enforced in `backend/src/routes/authRoutes.ts`, `backend/src/controllers/authController.ts`, `backend/src/utils/imageType.ts`.

| Check | Rule |
| --- | --- |
| Field | One multipart file in the field `avatar`. |
| Size | At most **5 MB** (multer limit), checked before the file is processed. |
| Declared type | `Content-Type` must be `image/jpeg`, `image/png`, `image/webp` or `image/gif`. |
| Real type | The first bytes must be a JPEG, PNG, WebP or GIF signature ("magic bytes"). An HTML or SVG file renamed to `.png` is rejected. The type stored and served is the detected one, not the one the client claimed. |
| Storage name | Always `avatars/<userId>`; the uploaded file name is never used. |
| Serving | Served with `X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`, so it can only ever render as an image. |

## 10. Known limits

These are Level 2 items, not required for Level 1, and are noted here so they aren't mistaken for oversights.

- The number of saved searches per vendor is not capped (ASVS 2.1.3 / 2.3.2, Level 2).
- Combinations of fields are only checked where they matter (budget and date ranges). There is no general cross-field validation (ASVS 2.2.3, Level 2).
