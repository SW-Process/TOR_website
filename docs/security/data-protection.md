# Data Classification and Protection

**ASVS 5.0 requirements documented here:**
- **14.1.1 (L2):** every kind of sensitive data the application creates or handles, sorted into protection levels, including data that is only encoded (section 2);
- **14.1.2 (L2):** the protection requirements of each level: encryption, integrity, retention, logging, access, privacy (section 3).

Section 4 shows where the code meets them (ASVS 14.2.4). Thai personal-data law (PDPA, พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562) applies to the personal data here; the site's privacy policy page states what is collected and why.

## 1. Protection levels

| Level | Meaning | Examples |
| --- | --- | --- |
| **L-S Secret** | Lets someone act as the user or the system. Must never be readable by anyone, including us. | Passwords, TOTP seeds, recovery codes, reset tokens, session tokens, server keys |
| **L-C Confidential** | Personal or business data about one account. Only that account and the admins who need it may see it. | E-mail, sign-in history, business profile, bookmarks, notes, chat, error-report contact |
| **L-I Internal** | Not personal, but not for the public. | Security and pipeline logs, ingestion internals, unpublished help drafts |
| **L-P Public** | Meant for everyone. | Published TORs, AI summaries, help articles |

## 2. Inventory (ASVS 14.1.1)

| Data | Where | Level | Notes |
| --- | --- | :-: | --- |
| Password | Never stored: `users.passwordHash` holds a bcrypt hash (`select: false`) | L-S | |
| TOTP seed | `users.mfaSecretEnc` (AES-256-GCM, `select: false`); shown to the user once at set-up as a QR code | L-S | |
| Recovery codes | `users.mfaRecoveryCodes` (bcrypt hashes, `select: false`); shown once | L-S | |
| Password-reset token | `users.resetPasswordTokenHash` (SHA-256, `select: false`); the raw token only in the e-mailed link's `#fragment` | L-S | |
| Session token (JWT) | HttpOnly cookie | L-S | **Only signed, not encrypted**: its payload (user id, session id, role, token version) is base64url and readable by whoever holds the cookie. It holds nothing secret by itself. |
| MFA-pending token (JWT) | HttpOnly cookie, 5 minutes | L-S | Same note: signed only; holds the user id and method. |
| OAuth flow cookie | HttpOnly cookie, 10 minutes | L-S | **Base64url-encoded JSON, not encrypted**: state, PKCE verifier, nonce. Readable by its own browser only. |
| Server keys and credentials | Secret Manager / `.env` | L-S | See [cryptography.md](cryptography.md). |
| E-mail address, display name, avatar | `users` | L-C | The avatar is public by URL (`/api/auth/avatar/:id`) once uploaded. |
| Google account id | `users.googleOAuthId` | L-C | |
| Sign-in history: device, browser, IP, times | `sessions` | L-C | IP addresses are personal data. |
| Business profile: company, capital, team size, technologies, budget range | `vendorprofiles` | L-C | Business-confidential. |
| Saved searches, hidden TORs, calendar notes | `vendorprofiles` | L-C | |
| Bookmarks, application status, notes | `bookmarks` | L-C | |
| Notifications | `notifications`, `adminnotifications` | L-C | |
| Support chat | `chatconversations`, `chatmessages` | L-C | Free text: may contain anything the user types. |
| Error reports | `errorreports` (description, optional reporter e-mail) | L-C | |
| Security log | Cloud Logging | L-I | Holds user ids, IPs, user agents, masked e-mails (see [logging.md](logging.md)). |
| Pipeline log, ingestion runs | `systemlogs`, `ingestionruns` | L-I | |
| Help drafts | `announcements`, `faqs` with `status: "draft"` | L-I | |
| TORs, AI summaries, fairness signals, statistics | `tors` (enriched only), Cloud Storage PDFs | L-P | Copied from public e-GP records. Fairness signals are worded as neutral review prompts. |

## 3. Protection requirements per level (ASVS 14.1.2)

| Requirement | L-S Secret | L-C Confidential | L-I Internal | L-P Public |
| --- | --- | --- | --- | --- |
| **At rest** | One-way hashed (bcrypt / SHA-256), or AES-256-GCM sealed when it must be read back (TOTP seeds); never stored in plain text | Atlas encryption at rest (default) | Platform encryption at rest | Platform encryption at rest |
| **In transit** | TLS only; cookies `Secure`, `HttpOnly`, `SameSite=Lax`, `__Host-` | TLS only | TLS only | TLS only |
| **Integrity** | Signed (JWT HS256) or authenticated encryption (GCM tag) | Written only by validated API endpoints | Append-only by design | SHA-256 of stored files for change detection |
| **Access** | Nobody reads them through the API: fields are `select: false` and stripped from every JSON response | The owning account; admins only for support data they need (reports, chat, a user's session count); never in bulk to the public | Admins (pipeline log in the panel), the team (Cloud Logging, IAM) | Everyone |
| **In logs** | Never, not even masked | User id instead of e-mail; e-mail masked if no account matched; free text (chat, notes, report descriptions) never logged | Allowed | Allowed |
| **In the browser** | Only the HttpOnly cookies; never in `localStorage`, `sessionStorage` or a URL query | Shown to its owner; not cached: API responses are `Cache-Control: no-store`, pages `private, no-store` | Admin panel only | Cacheable |
| **To third parties** | Never | Only the processors needed to run the service: SendGrid gets the e-mail address and message for e-mails we send; no trackers or analytics | Google Cloud only | Anyone |
| **Retention** | Reset tokens: 1 hour; pending MFA: 5 minutes; sessions: 12 hours (TTL index); seeds and codes: until MFA is off or the account is deleted | Until the user deletes it, or the account is deleted (everything tied to the account is deleted in one transaction; error reports are kept but anonymised) | Cloud Logging 30 days; `systemlogs` until deleted (gap: TTL planned) | Kept |
| **Privacy** | | Collected only where a feature needs it; the business profile is optional; account deletion is self-service | | |

## 4. Where it is enforced (ASVS 14.2.4)

| Control | Code |
| --- | --- |
| Secret fields never selected or serialised | `select: false` and the `toJSON` transform in `backend/src/models/User.ts` |
| Hashing and encryption | `models/User.ts`, `services/mfa.ts`, `utils/secretBox.ts` |
| No caching of API answers or pages (14.2.2, 14.3.2) | `middleware/securityHeaders.ts` (`Cache-Control: no-store`), `frontend/src/proxy.ts` (`private, no-store`) |
| No sensitive data in URLs (14.2.1) | Reset token in the `#fragment`; no secrets in query strings; Referrer-Policy `no-referrer` (API) and `strict-origin-when-cross-origin` (frontend) |
| No browser storage of sensitive data (14.3.3) | Only HttpOnly cookies. The UI's one browser-storage entry is a "viewed this TOR" flag in `sessionStorage` (a public TOR id); calendar notes an older version kept in `localStorage` are uploaded once and removed (`lib/useDayNotes.ts`). |
| No trackers (14.2.3) | The frontend loads no third-party scripts, and its CSP (`script-src 'self' 'nonce-…'`, `connect-src 'self' <API>`) would block them |
| Logging rules | `utils/securityLog.ts` (masking, no bodies) |
| Ownership of L-C data | Every query filters by the caller's id ([authorization.md](authorization.md)) |
| Deletion | `DELETE /api/auth/me` in a transaction (`utils/transaction.ts`) |
