# OWASP ASVS 5.0 Compliance Checklist

**Application:** TOR Checker · **Standard:** [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en) · **Target:** all of Level 1 and Level 2, selected Level 3 · **Risk mapping:** [OWASP Top 10:2025](https://owasp.org/Top10/)

Every Level 1 (section 2) and Level 2 (section 4) requirement is listed below with its status, the code that implements it, and the test that proves it. Paths are relative to the repository root.

## 1. Summary

| | Level 1 | Level 2 |
| --- | ---: | ---: |
| ✅ Met | **62** | **135** |
| ⚠️ Partly met (reason given) | 0 | 3 |
| ⏳ Implemented, needs a tool run to confirm (SSL Labs) | 1 | 1 |
| ❌ Not met | 0 | 1 |
| ➖ Not applicable to this application | 7 | 43 |
| **Total** | **70** | **183** |

- **Level 1: 62 of the 63 applicable requirements met (98%);** the last one (12.1.1, TLS versions) only needs an SSL Labs scan to confirm.
- **Level 2: 135 of the 140 applicable requirements met (96%).** One is not met (5.4.3, antivirus scanning of e-GP PDFs), three are partly met and one awaits the same SSL Labs scan; all five are listed with their next step in [section 4.18](#418-what-is-not-fully-met).
- **Level 3:** 22 requirements met as well (section 5).

Legend: ✅ met · ⏳ pending a tool run · ➖ not applicable (reason given) · **A01–A10**: OWASP Top 10:2025 category the requirement mitigates.

## 2. Level 1 requirements

### V1 Encoding and Sanitization

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 1.2.1 | Context-aware output encoding for HTML | ✅ | React escapes all text output; no `dangerouslySetInnerHTML` in `frontend/src` | Code search | A05 |
| 1.2.2 | URLs built safely, no `javascript:` / `data:` | ✅ | `safeHref()` in `frontend/src/components/help/HelpBody.tsx` allows only `/path` and `https://`; `safeNextPath()` in the login page | Manual test | A05 |
| 1.2.3 | Encoding when building JSON/JS | ✅ | All API responses use `res.json()` | — | A05 |
| 1.2.4 | Parameterized queries / ORM against injection | ✅ | Mongoose queries with Zod-validated values; Express 5 "simple" query parser (no `$` operators from the URL); `escapeRegExp()` for search text | `torRoutes.test.ts` (search, filters) | A05 |
| 1.2.5 | No OS command injection | ✅ | The application runs no shell commands | Code search (`child_process` not used) | A05 |
| 1.3.1 | Sanitize HTML from rich-text editors | ✅ | No HTML is accepted; help articles use a plain-text format rendered by React | — | A05 |
| 1.3.2 | No `eval()` or dynamic code | ✅ | No `eval` / `new Function` in the code | Code search; SAST | A05 |
| 1.5.1 | XML parsers safe from XXE | ➖ | No XML is parsed anywhere | — | A05 |

### V2 Validation and Business Logic

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 2.1.1 | Input validation rules documented | ✅ | [input-validation.md](input-validation.md) | — | A06 |
| 2.2.1 | Positive input validation | ✅ | Zod schemas in every controller (e.g. `listQuerySchema` in `torController.ts`, `updateSchema` in `adminTorController.ts`) | `torRoutes.test.ts`, `vendorProfile.test.ts`, `adminTors.test.ts` | A05 |
| 2.2.2 | Validation enforced at a trusted service layer | ✅ | All checks run in the Express backend; frontend checks are UX only | API tests call the backend directly | A06 |
| 2.3.1 | Business flows run in order, steps can't be skipped | ✅ | Password reset needs a valid single-use token; Google sign-in checks the `state` cookie | `passwordReset.test.ts`, `googleOAuth.test.ts` | A06 |

### V3 Web Frontend Security

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 3.2.1 | Responses can't be rendered in the wrong context | ✅ | `X-Content-Type-Options: nosniff` on every response (`backend/src/middleware/securityHeaders.ts`); avatars served with `sandbox` CSP and the type detected from their bytes | `securityHeaders.test.ts`, `avatarUpload.test.ts` | A02 |
| 3.2.2 | Text shown with safe rendering functions | ✅ | React text rendering | — | A05 |
| 3.3.1 | Cookies `Secure` with `__Host-`/`__Secure-` prefix | ✅ | `__Host-token`, `__Host-oauth_state`, `Secure`, `Path=/`, no `Domain` in production (`backend/src/utils/token.ts`) | `token.test.ts` | A02 |
| 3.4.1 | HSTS of at least 1 year | ✅ | `max-age=31536000; includeSubDomains` on backend and frontend (`frontend/next.config.ts`) | `securityHeaders.test.ts`; browser DevTools | A02 |
| 3.4.2 | CORS origin fixed or allowlisted, no `*` with credentials | ✅ | `cors({ origin: CLIENT_ORIGIN, credentials: true })` in `backend/src/app.ts` | Manual check | A02 |
| 3.5.1 | Protection against cross-site request forgery | ✅ | `Origin` / `Sec-Fetch-Site` check (`backend/src/middleware/originCheck.ts`) and `SameSite=Lax` cookies | `originCheck.test.ts` | A01 |
| 3.5.2 | No sensitive call without a CORS preflight | ✅ | The same check also blocks simple (no-preflight) cross-site requests, e.g. `POST /logout-others` | `originCheck.test.ts` | A01 |
| 3.5.3 | Sensitive actions don't use GET | ✅ | All state changes use POST/PUT/PATCH/DELETE (route files in `backend/src/routes`) | Code review | A01 |

### V4 API and Web Service

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 4.1.1 | Correct `Content-Type` with charset | ✅ | `res.json()` sends `application/json; charset=utf-8`; PDFs `application/pdf`; avatars their detected image type | Manual check (`curl -I`) | A02 |
| 4.4.1 | WebSockets use WSS | ➖ | No WebSockets; chat uses HTTPS polling | — | A04 |

### V5 File Handling

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 5.2.1 | Upload size limited | ✅ | Avatar ≤ 5 MB (multer in `backend/src/routes/authRoutes.ts`); JSON bodies ≤ 100 KB | — | A06 |
| 5.2.2 | File content matches its type (magic bytes) | ✅ | `detectImageType()` in `backend/src/utils/imageType.ts` | `imageType.test.ts`, `avatarUpload.test.ts` | A06 |
| 5.3.1 | Uploaded files never executed | ✅ | Files go to Cloud Storage and are streamed back; never served from a code directory | — | A06 |
| 5.3.2 | File paths built from trusted data only | ✅ | Storage key is always `avatars/<userId>` | Code review | A01 |

### V6 Authentication

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 6.1.1 | Brute-force and lockout defenses documented | ✅ | [authentication-defenses.md](authentication-defenses.md) | — | A07 |
| 6.2.1 | Passwords at least 8 characters | ✅ | `MIN_PASSWORD_LENGTH = 8` in `backend/src/utils/passwordPolicy.ts` | `passwordPolicy.test.ts` | A07 |
| 6.2.2 | Users can change their password | ✅ | `PUT /api/auth/password` | `account.test.ts` | A07 |
| 6.2.3 | Change needs current and new password | ✅ | `confirmPassword()` in `authController.ts` | `account.test.ts` | A07 |
| 6.2.4 | Refuse the top 3,000 common passwords | ✅ | `backend/src/config/commonPasswords.ts` (NCSC list), checked on register, reset, change and admin creation | `passwordPolicy.test.ts`, `passwordPolicyRoutes.test.ts` | A07 |
| 6.2.5 | No composition rules | ✅ | Any characters accepted; only length and commonness are checked | `passwordPolicy.test.ts` | A07 |
| 6.2.6 | Password fields use `type=password` | ✅ | All 10 password inputs in the frontend | Manual check | A07 |
| 6.2.7 | Paste and password managers allowed | ✅ | No paste blocking or `autocomplete="off"` | Manual check | A07 |
| 6.2.8 | Password checked exactly as typed (no truncation) | ✅ | HMAC-SHA256 pre-hash before bcrypt, so every character of up to 128 counts; legacy hashes refuse candidates over 72 bytes (`models/User.ts`) | `passwordPolicyRoutes.test.ts` | A07 |
| 6.3.1 | Brute force and credential stuffing prevented | ✅ | Rate limits (`backend/src/middleware/rateLimits.ts`): login 10 per IP+email and 50 per IP per 15 min | `rateLimit.test.ts`, `loginRateLimit.test.ts` | A07 |
| 6.3.2 | No default accounts | ✅ | Admins only created by `npm run create-admin` with a chosen email and password | Code review | A07 |
| 6.4.1 | Generated secrets random, expiring, single use | ✅ | Reset token: 256-bit random, SHA-256 stored, 1 hour, single use | `passwordReset.test.ts` | A07 |
| 6.4.2 | No password hints or secret questions | ✅ | None exist | — | A07 |

### V7 Session Management

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 7.2.1 | Session tokens verified by the backend | ✅ | `sessionUser()` in `backend/src/middleware/auth.ts` | `auth.test.ts`, `sessions.test.ts` | A07 |
| 7.2.2 | Dynamically generated tokens, no static keys | ✅ | A JWT is signed per sign-in (`signToken()`) | `auth.test.ts` | A07 |
| 7.2.3 | Reference tokens random with ≥ 128 bits | ✅ | Session row ids are only usable inside an HS256-signed JWT (256-bit secret) | `token.test.ts` | A07 |
| 7.2.4 | New token on every sign-in | ✅ | `startSession()` creates a new session row and token | `sessions.test.ts` | A07 |
| 7.4.1 | Logout really ends the session | ✅ | Session row deleted; `tokenVersion` for "sign out everywhere" | `sessions.test.ts` | A07 |
| 7.4.2 | Deleting an account ends all its sessions | ✅ | `Session.deleteMany` inside the account-deletion transaction | `sessions.test.ts`, `accountDeleteTransaction.test.ts` | A07 |

### V8 Authorization

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 8.1.1 | Authorization rules documented | ✅ | [authorization.md](authorization.md) | — | A01 |
| 8.2.1 | Function-level access restricted | ✅ | `requireAuth` + `requireRole()`; admin and ingestion routers guarded as a whole | `adminTors.test.ts`, `ingestionRoutes.test.ts`, `help.test.ts` | A01 |
| 8.2.2 | Data-level access restricted (no IDOR) | ✅ | Every owned-data query filters by `req.user.id` | `vendorNotifications.test.ts`, `vendorHiddenTors.test.ts`, `dayNotes.test.ts` | A01 |
| 8.3.1 | Enforced in a trusted service layer | ✅ | All checks in Express; frontend checks are UX only | API tests | A01 |

### V9 Self-contained Tokens

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 9.1.1 | Token signature verified before use | ✅ | `jwt.verify()` in `backend/src/utils/token.ts` | `token.test.ts` | A08 |
| 9.1.2 | Algorithm allowlist, never `none` | ✅ | `algorithms: ["HS256"]` | `token.test.ts` (rejects `none` and HS512) | A08 |
| 9.1.3 | Keys from trusted configuration | ✅ | `JWT_SECRET` from the environment / Secret Manager; no `jku`/`jwk` headers used | — | A08 |
| 9.2.1 | `exp` / `nbf` checked | ✅ | `exp` = the session's absolute end (≤ 12 h), checked by `jwt.verify()` | `token.test.ts` | A07 |

### V10 OAuth and OIDC

| ID | Requirement | Status | Reason | Top 10 |
| --- | --- | :-: | --- | :-: |
| 10.4.1 – 10.4.5 | Authorization server requirements (redirect URI allowlist, single-use and short-lived codes, allowed grants, refresh token replay) | ➖ | We are an OAuth **client**; Google is the authorization server. Our client-side controls are listed in section 4 (10.2.1, 10.5.4). | A07 |

### V11 Cryptography

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 11.3.1 | No insecure block modes | ✅ | Only AES-256-**GCM** (TOTP seeds, `utils/secretBox.ts`); no ECB or CBC | `totp.test.ts` | A04 |
| 11.3.2 | Only approved ciphers | ✅ | AES-256-GCM | `totp.test.ts` | A04 |
| 11.4.1 | Only approved hash functions | ✅ | SHA-256 (reset tokens, file hashes, PKCE), HMAC-SHA-256 (JWT, password pre-hash), bcrypt (passwords, recovery codes). SHA-1 appears only where a standard fixes it and no collision resistance is needed: HMAC-SHA1 in TOTP (RFC 6238, needed by every authenticator app) and the Pwned Passwords k-anonymity lookup. No MD5. | Code search | A04 |

### V12 Secure Communication

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 12.1.1 | Only TLS 1.2 / 1.3 | ⏳ | Google Cloud Run terminates TLS; the accepted versions must be confirmed | Run [SSL Labs](https://www.ssllabs.com/ssltest/) on the production URL and record the result | A04 |
| 12.2.1 | TLS for all external HTTP traffic | ✅ | Cloud Run serves HTTPS only; HSTS set | Browser | A04 |
| 12.2.2 | Publicly trusted certificates | ✅ | Google-managed certificates | Browser | A04 |

### V13 Configuration

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 13.4.1 | No source control metadata deployed | ✅ | `.git` excluded in `backend/.dockerignore` and `frontend/.dockerignore` | — | A02 |

### V14 Data Protection

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 14.2.1 | No sensitive data in URLs | ✅ | Session in an HttpOnly cookie; reset token in the URL `#fragment` and wiped after reading | `passwordReset.test.ts` | A04 |
| 14.3.1 | Authenticated data cleared from the browser on logout | ✅ | No account data in browser storage: day notes moved to the server (`/api/vendor/day-notes`); in-memory state cleared on logout | `dayNotes.test.ts`; DevTools check | A04 |

### V15 Secure Coding and Architecture

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 15.1.1 | Remediation time frames for dependencies documented | ✅ | [dependency-management.md](dependency-management.md) | — | A03 |
| 15.2.1 | No component past its remediation time frame | ✅ | `npm audit --omit=dev` run and recorded on 2026-10-22: critical and high findings fixed the same day; one moderate, unreachable finding inside its 90-day window ([dependency-management.md §6](dependency-management.md#6-current-status)). CI now fails on any new high or critical finding | `npm audit` in CI | A03 |
| 15.3.1 | Only required fields returned | ✅ | Mongoose projections and `toJSON` transforms (no `passwordHash`, tokens or storage keys) | `sessions.test.ts`, `torProcurementExposure.test.ts` | A01 |

V16 (Security Logging and Error Handling) and V17 (WebRTC) contain no Level 1 requirements; V16 is covered at Level 2 in section 4.

## 3. Mapping to OWASP Top 10:2025

| Top 10:2025 | How TOR Checker addresses it | Main ASVS requirements | Status |
| --- | --- | --- | :-: |
| **A01** Broken Access Control | Role checks on every protected route, admin MFA gate, ownership filters on all user data, field-level rules, CSRF guard, only public TORs exposed, outbound allowlist against SSRF | 8.1.1, 8.1.2, 8.2.1–8.2.3, 8.3.1, 3.5.1–3.5.5, 1.3.6, 5.3.2, 15.3.1 | ✅ |
| **A02** Security Misconfiguration | Security headers, nonce-based CSP, strict CORS, no default secrets, TRACE refused, no caching of API answers, `X-Powered-By` removed, `.git` not deployed | 3.2.1, 3.3.x, 3.4.1–3.4.6, 4.1.1, 13.2.3, 13.4.x, 14.3.2 | ✅ |
| **A03** Software Supply Chain Failures | Lock files and `npm ci`, risk-based remediation time frames, `npm audit` gate and CycloneDX SBOM in CI, audit findings fixed | 15.1.1, 15.1.2, 15.2.1 | ✅ |
| **A04** Cryptographic Failures | HTTPS only with HSTS, bcrypt over an HMAC pre-hash, AES-256-GCM for seeds, documented key management and inventory, 128-bit+ randomness | 11.x, 12.x, 14.2.1, 14.3.x | ✅ (TLS settings to confirm) |
| **A05** Injection | Zod validation, no client-supplied operators or prototype keys, escaped regex, React output encoding, safe file names, no `eval`/shell | 1.2.x, 1.3.x, 2.2.1, 5.4.2, 15.3.5–15.3.7 | ✅ |
| **A06** Insecure Design | Documented validation, business limits and data classification; transactions; costly work in capped background jobs | 2.1.x, 2.2.x, 2.3.x, 5.1.1, 14.1.x, 15.1.3, 15.2.2 | ✅ |
| **A07** Authentication Failures | Password rules with common, context-word and breach checks; TOTP MFA (required for admins); rate limits without lockout; 30-minute idle and 12-hour sessions; re-authentication for sensitive changes; PKCE and nonce for Google | 6.x, 7.x, 9.2.x, 10.x | ✅ |
| **A08** Software or Data Integrity Failures | JWT signature, algorithm allowlist, audience and type checks; keys only from configuration; authenticated encryption | 9.1.x, 9.2.x, 11.3.3 | ✅ |
| **A09** Security Logging & Alerting Failures | Structured security log of every authentication, authorization, admin and control event, with request ids, sent to Cloud Logging; no secrets in logs | 16.1.1, 16.2.x, 16.3.x, 16.4.x | ✅ (lock the log bucket at deployment; alerting planned) |
| **A10** Mishandling of Exceptional Conditions | Generic 5xx messages with details only in the log, graceful degradation when e-GP, Gemini, e-mail or Pwned Passwords fail, fail-closed checks, rollback | 16.5.1–16.5.3, 2.3.3 | ✅ |

## 4. Level 2 requirements

Every one of the 183 Level 2 requirements of ASVS 5.0, with its status.

| | Level 2 requirements |
| --- | ---: |
| ✅ Met | **135** |
| ⚠️ Partly met (reason given) | 3 |
| ⏳ Implemented, needs a tool run to confirm | 1 |
| ❌ Not met | 1 |
| ➖ Not applicable to this application | 43 |
| **Total** | **183** |

**Level 2 coverage: 135 of the 140 applicable requirements met (96%).** What is left is listed in section 4.18.

### V1 Encoding and Sanitization

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 1.1.1 | Decode input once, before validation | ✅ | Express decodes URLs and JSON once, before any validator runs; the code never decodes again | Code review |
| 1.1.2 | Encode output last, or by the interpreter | ✅ | React escapes at render; `res.json()`; e-mail HTML built with `escapeHtml()` at the last step (`email/theme.ts`) | Code review |
| 1.2.6 | LDAP injection | ➖ | No LDAP | — |
| 1.2.7 | XPath injection | ➖ | No XPath | — |
| 1.2.8 | LaTeX injection | ➖ | No LaTeX | — |
| 1.2.9 | Escape regex metacharacters | ✅ | `escapeRegExp()` for TOR search, help search and the admin user lookup | `help.test.ts` |
| 1.3.3 | Sanitize data for dangerous contexts | ✅ | Download names through `contentDisposition()`; log values JSON-encoded and clipped; IDs percent-encoded into e-GP URLs | `contentDisposition.test.ts`, `securityLog.test.ts` |
| 1.3.4 | User SVG sanitized | ✅ | SVG is refused outright: avatars must be JPEG/PNG/WebP/GIF by their bytes | `avatarUpload.test.ts` |
| 1.3.5 | Markdown/CSS/template content sanitized | ✅ | No user Markdown or templates; help articles use a plain-text format rendered by React with `safeHref()` | Code review |
| 1.3.6 | SSRF protection by allowlist | ✅ | `utils/outbound.ts`: https only, allowed hosts only, redirects checked hop by hop ([communications.md](communications.md)) | `outbound.test.ts` |
| 1.3.7 | No templates built from input | ✅ | E-mail templates are fixed strings with escaped values | Code review |
| 1.3.8 | JNDI injection | ➖ | No JNDI (not Java) | — |
| 1.3.9 | Memcache injection | ➖ | No memcache | — |
| 1.3.10 | Format strings sanitized | ✅ | No `printf`-style formatting of user input; template literals only | Code search |
| 1.3.11 | SMTP/IMAP injection | ✅ | E-mail goes through SendGrid's JSON API; recipient is a stored, validated address; subjects are fixed | Code review |
| 1.4.1 | Memory-safe string handling | ➖ | TypeScript on Node.js: a memory-safe runtime; no native code of ours | — |
| 1.4.2 | Integer overflow prevented | ✅ | Zod `int()`, `min`/`max`, `Number.isFinite`, plain-decimal parsing for profile numbers | `vendorProfile.test.ts` |
| 1.4.3 | Freed memory and dangling pointers | ➖ | Garbage-collected runtime | — |
| 1.5.2 | Safe deserialization | ✅ | Only `JSON.parse` into plain objects, then schema checks; no class-restoring serializers | Code review |

### V2 Validation and Business Logic

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 2.1.2 | Combined-data consistency documented | ✅ | [business-logic.md §1](business-logic.md) | — |
| 2.1.3 | Business limits documented | ✅ | [business-logic.md §2–3](business-logic.md) | — |
| 2.2.3 | Related fields consistent | ✅ | Budget and date ranges, saved filters re-validated, real calendar days | `businessLimits.test.ts`, `dayNotes.test.ts`, `torRoutes.test.ts` |
| 2.3.2 | Business limits enforced | ✅ | 50 saved searches, 1,000 bookmarks / hidden TORs / notes, chat 30 per 5 min, AI calls per run | `businessLimits.test.ts`, `vendorHiddenTors.test.ts` |
| 2.3.3 | Transactions all-or-nothing | ✅ | Account deletion in one MongoDB transaction (`utils/transaction.ts`) | `accountDeleteTransaction.test.ts` (real replica set, rollback) |
| 2.3.4 | Locking against double use | ✅ | Job leases, unique indexes, atomic single use of codes and tokens | `mfa.test.ts`, enrichment tests |
| 2.4.1 | Anti-automation on costly functions | ✅ | Rate limits on sign-in, sign-up, reset, MFA, reports, views, chat; capped AI calls per run | `rateLimit.test.ts`, `businessLimits.test.ts` |

### V3 Web Frontend Security

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 3.3.2 | SameSite per cookie purpose | ✅ | `SameSite=Lax` on the session, MFA-pending and OAuth flow cookies (all built from `cookieOptions()`) | `token.test.ts` |
| 3.3.3 | `__Host-` cookie prefix | ✅ | `__Host-token`, `__Host-mfa_pending`, `__Host-oauth_state` in production | `token.test.ts` |
| 3.3.4 | HttpOnly session cookie | ✅ | `httpOnly: true`; the token is only ever sent in `Set-Cookie` | `token.test.ts` |
| 3.4.3 | CSP with object-src/base-uri 'none' and nonces | ✅ | Frontend `src/proxy.ts`: per-request nonce, `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`; API `default-src 'none'` | Production build; response headers |
| 3.4.4 | nosniff on every response | ✅ | `securityHeaders.ts`, `next.config.ts` | `securityHeaders.test.ts` |
| 3.4.5 | Referrer policy | ✅ | `no-referrer` (API), `strict-origin-when-cross-origin` (frontend) | `securityHeaders.test.ts` |
| 3.4.6 | CSP frame-ancestors | ✅ | `frame-ancestors 'none'` on the API, the pages and the static files | `securityHeaders.test.ts` |
| 3.5.4 | Separate apps on separate hostnames | ✅ | Frontend and API are separate Cloud Run services with their own hostnames | Deployment |
| 3.5.5 | postMessage origin and shape checked | ✅ | Extension: `isCaptureMessage()` checks source, origin and shape; the frontend uses no `postMessage` | `extension/test/parse.test.js` |
| 3.7.1 | Only supported client technology | ✅ | React 19, Next.js 16; no plugins | — |
| 3.7.2 | Off-site redirects only via allowlist | ✅ | `safeNextPath()`; the API redirects only to `CLIENT_ORIGIN` or Google | Code review |

### V4 API and Web Service

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 4.1.2 | Only user-facing endpoints redirect HTTP→HTTPS | ⚠️ | Cloud Run redirects plain HTTP to HTTPS on every path, API included, and the application can't change that. HSTS (1 year) limits exposure to a browser's first request | Platform behaviour |
| 4.1.3 | Proxy-set headers can't be overridden | ✅ | `TRUST_PROXY` hop count (never `true`); `proxy-addr` updated to 2.0.8; trace header accepted only if well-formed | `sessions.test.ts` (`parseTrustProxy`), `securityLog.test.ts` |
| 4.2.1 | No HTTP request smuggling | ✅ | Node.js's HTTP parser rejects conflicting `Content-Length`/`Transfer-Encoding`; Google's front end normalises requests | Platform behaviour |
| 4.3.1 | GraphQL query limits | ➖ | No GraphQL | — |
| 4.3.2 | GraphQL introspection | ➖ | No GraphQL | — |
| 4.4.2 | WebSocket Origin check | ➖ | No WebSockets (chat polls over HTTPS) | — |
| 4.4.3 | WebSocket session tokens | ➖ | No WebSockets | — |
| 4.4.4 | WebSocket token from HTTPS session | ➖ | No WebSockets | — |

### V5 File Handling

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 5.1.1 | Upload types, sizes, handling documented | ✅ | [file-handling.md](file-handling.md) | — |
| 5.2.3 | Archive size and file count checked before unpacking | ✅ | 500 files, 200 MB unpacked, 50 MB per entry (`torFromBundle.ts`) | `torFromBundle.test.ts` (zip bomb) |
| 5.4.1 | Server chooses the download name | ✅ | `Content-Disposition` set by the server for PDFs and avatars | `torDocument.test.ts` |
| 5.4.2 | Served file names encoded (RFC 6266) | ✅ | `utils/contentDisposition.ts`: ASCII fallback + `filename*` | `contentDisposition.test.ts` |
| 5.4.3 | Antivirus scan of untrusted files | ❌ | e-GP PDFs are not scanned; plan: ClamAV in the ingestion job, or Cloud Storage malware scanning ([file-handling.md §3](file-handling.md)) | — |

### V6 Authentication

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 6.1.2 | Context-specific words documented | ✅ | [authentication-defenses.md §5.2](authentication-defenses.md), `config/contextWords.ts` | — |
| 6.1.3 | All authentication pathways documented | ✅ | [authentication-defenses.md §8](authentication-defenses.md) | — |
| 6.2.9 | Passwords of 64+ characters allowed | ✅ | Up to 128 characters; HMAC-SHA256 pre-hash before bcrypt | `passwordPolicy.test.ts`, `passwordPolicyRoutes.test.ts` (64 Thai characters) |
| 6.2.10 | No forced periodic rotation | ✅ | No expiry on passwords | — |
| 6.2.11 | Context words refused | ✅ | `passwordPolicy.ts` (padding and digit swaps handled; own e-mail/name refused) | `passwordPolicy.test.ts`, `passwordPolicyRoutes.test.ts` |
| 6.2.12 | Breached passwords refused | ✅ | Pwned Passwords k-anonymity check (`utils/breachedPasswords.ts`) | `passwordPolicy.test.ts` |
| 6.3.3 | Multi-factor authentication | ✅ | TOTP + recovery codes; **required for admins**; optional for vendors under the documented relaxation of [authentication-defenses.md §9.3](authentication-defenses.md) | `mfa.test.ts` |
| 6.3.4 | No undocumented pathways | ✅ | Pathways in §8; the old pre-session cookie format is no longer accepted | `sessions.test.ts` |
| 6.4.3 | Password reset doesn't bypass MFA | ✅ | A reset never signs in; the next sign-in asks for the code | `mfa.test.ts` |
| 6.4.4 | Lost factor: identity proofing | ✅ | Recovery codes; else the procedure of [authentication-defenses.md §9.4](authentication-defenses.md) and `npm run reset-mfa` | Procedure |
| 6.5.1 | Codes usable once | ✅ | Last TOTP step stored; recovery codes and pending sign-ins used up atomically | `mfa.test.ts` |
| 6.5.2 | Low-entropy lookup secrets hashed with salt | ✅ | Recovery codes (50 bits) bcrypt-hashed, cost 10 | `mfa.test.ts` |
| 6.5.3 | Seeds and codes from a CSPRNG | ✅ | `randomBytes` for TOTP seeds and recovery codes | Code review |
| 6.5.4 | ≥ 20 bits of entropy | ✅ | 6-digit TOTP, 50-bit recovery codes | — |
| 6.5.5 | TOTP lifetime ≤ 30 s | ✅ | Only the current 30-second step is accepted | `totp.test.ts` |
| 6.6.1 | SMS/phone OTP | ➖ | No phone or SMS authentication | — |
| 6.6.2 | Out-of-band codes bound to the request | ➖ | No out-of-band authenticators (the MFA-pending step is bound to its sign-in anyway) | — |
| 6.6.3 | Out-of-band brute force | ➖ | No out-of-band authenticators | — |
| 6.8.1 | No identity spoofing across IdPs | ✅ | Google users matched by `sub`; e-mail linking only when Google verified the e-mail | `googleOAuth.test.ts` |
| 6.8.2 | Assertion signatures checked | ✅ | `verifyIdToken()` | `google.test.ts` |
| 6.8.3 | SAML replay | ➖ | No SAML | — |
| 6.8.4 | IdP authentication strength | ✅ | No `acr`/`amr` from Google: treated as single-factor; our TOTP required where needed ([§8.3](authentication-defenses.md)) | — |

### V7 Session Management

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 7.1.1 | Timeouts documented with NIST justification | ✅ | [session-management.md §2](session-management.md) | — |
| 7.1.2 | Concurrent sessions documented | ✅ | [session-management.md §3](session-management.md) | — |
| 7.1.3 | Federated sessions documented | ✅ | [session-management.md §6](session-management.md) | — |
| 7.3.1 | Inactivity timeout | ✅ | 30 minutes; background polling doesn't count | `sessions.test.ts` |
| 7.3.2 | Absolute session lifetime | ✅ | 12 hours, never extended | `sessions.test.ts`, `token.test.ts` |
| 7.4.3 | Offer to end other sessions after a factor change | ✅ | Automatic on password change/reset; offered after MFA set-up | `sessions.test.ts` |
| 7.4.4 | Visible logout on every authenticated page | ✅ | Header menu, settings menu, admin top bar | Manual check |
| 7.4.5 | Admins can end one user's or all sessions | ✅ | *Admin → ความปลอดภัย*, `/api/admin/users/:id/sessions/revoke`, `/api/admin/sessions/revoke-all` | `adminSessions.test.ts` |
| 7.5.1 | Re-authentication before changing auth attributes | ✅ | `requireRecentAuth()` on e-mail, password, MFA, Google link/unlink | `reauth.test.ts`, `mfa.test.ts` |
| 7.5.2 | View and end sessions after re-authenticating | ✅ | Session list; ending another device needs re-authentication | `reauth.test.ts` |
| 7.6.1 | RP/IdP session lifetimes as documented | ✅ | Our session is independent of Google's ([session-management.md §6](session-management.md)) | — |
| 7.6.2 | No session without user action | ✅ | Sessions only from the login form or the Google button, with state/PKCE/nonce | `googleOAuth.test.ts` |

### V8 Authorization

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 8.1.2 | Field-level rules documented | ✅ | [authorization.md §4.3](authorization.md) | — |
| 8.2.3 | Field-level access enforced (BOPLA) | ✅ | Strict schemas for writes; `select: false`, projections and `toJSON` for reads | `torProcurementExposure.test.ts`, `mfa.test.ts` |
| 8.4.1 | Cross-tenant controls | ➖ | Not multi-tenant; each vendor's data is isolated by the ownership rules of 8.2.2 | — |

### V9 Self-contained Tokens

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 9.2.2 | Token type checked | ✅ | `use: "session"` required; MFA-pending tokens use their own audience | `sessions.test.ts` |
| 9.2.3 | Token audience checked | ✅ | `aud: tor-checker-session`, `iss: tor-checker-api` | `token.test.ts`, `sessions.test.ts` |
| 9.2.4 | Audience restriction when one key serves several audiences | ✅ | Session and MFA-pending tokens share the key but have different `aud` | `sessions.test.ts` |

### V10 OAuth and OIDC

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 10.1.1 | Tokens only where needed | ✅ | Google's tokens stay in the backend and are discarded after sign-in | Code review |
| 10.1.2 | State/PKCE/nonce bound to the browser session | ✅ | HttpOnly `__Host-oauth_state` cookie holds them for 10 minutes | `googleOAuth.test.ts` |
| 10.2.1 | CSRF protection of the code flow | ✅ | PKCE S256 and `state` | `google.test.ts`, `googleOAuth.test.ts` |
| 10.2.2 | Mix-up defence | ➖ | One authorization server only (Google) | — |
| 10.3.1 | Resource server: audience | ➖ | Not an OAuth resource server (the API uses its own session tokens) | — |
| 10.3.2 | Resource server: delegated claims | ➖ | Not a resource server | — |
| 10.3.3 | Resource server: user identity claims | ➖ | Not a resource server | — |
| 10.3.4 | Resource server: authentication strength | ➖ | Not a resource server | — |
| 10.4.6 | AS requires PKCE | ➖ | Not an authorization server | — |
| 10.4.7 | AS dynamic client registration | ➖ | Not an authorization server | — |
| 10.4.8 | AS refresh token expiry | ➖ | Not an authorization server; no refresh tokens kept | — |
| 10.4.9 | AS token revocation UI | ➖ | Not an authorization server | — |
| 10.4.10 | AS authenticates confidential clients | ➖ | Not an authorization server | — |
| 10.4.11 | AS assigns only required scopes | ➖ | Not an authorization server | — |
| 10.5.1 | ID token replay prevented (nonce) | ✅ | Nonce sent and checked | `google.test.ts` |
| 10.5.2 | User identified by `sub` | ✅ | `googleOAuthId` = `sub` | `googleOAuth.test.ts` |
| 10.5.3 | Issuer metadata not spoofable | ✅ | `google-auth-library` uses Google's fixed issuer and key URLs | Library behaviour |
| 10.5.4 | ID token audience | ✅ | `audience: GOOGLE_CLIENT_ID` | `google.test.ts` |
| 10.5.5 | Back-channel logout | ➖ | Not used | — |
| 10.6.1 | OP response modes | ➖ | Not an OpenID Provider | — |
| 10.6.2 | OP forced logout | ➖ | Not an OpenID Provider | — |
| 10.7.1 | AS consent per request | ➖ | Not an authorization server (Google shows the consent) | — |
| 10.7.2 | AS consent information | ➖ | Not an authorization server | — |
| 10.7.3 | AS consent review | ➖ | Not an authorization server | — |

### V11 Cryptography

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 11.1.1 | Key management policy | ✅ | [cryptography.md §1](cryptography.md) | — |
| 11.1.2 | Cryptographic inventory | ✅ | [cryptography.md §2](cryptography.md) | — |
| 11.2.1 | Industry-validated implementations | ✅ | Node.js `crypto` (OpenSSL), `bcrypt`, `jsonwebtoken`, Google libraries | — |
| 11.2.2 | Crypto agility | ✅ | Versioned hashes (`v2$`) and sealed values (`v1:`); re-hash at sign-in ([cryptography.md §3](cryptography.md)) | `passwordPolicyRoutes.test.ts` |
| 11.2.3 | ≥ 128-bit security | ✅ | AES-256, HMAC-SHA256 with 256-bit keys, 160-bit TOTP seeds | — |
| 11.3.3 | Encrypted data authenticated | ✅ | AES-256-GCM with associated data | `totp.test.ts` (tampering detected) |
| 11.4.2 | Slow password hashing | ✅ | bcrypt cost 12 (over an HMAC-SHA256 pre-hash) | `passwordPolicyRoutes.test.ts` |
| 11.4.3 | Collision-resistant hashes for integrity | ✅ | SHA-256 for file integrity, token hashes and PKCE | — |
| 11.4.4 | Key derivation from passwords | ➖ | No keys are derived from passwords | — |
| 11.5.1 | CSPRNG with ≥ 128 bits | ✅ | `randomBytes`/`getRandomValues`; tokens 256 bits, CSP nonce and ids 128 bits | Code review |
| 11.6.1 | Approved algorithms for keys and signatures | ✅ | HS256 with a 256-bit random key; RS256 ID tokens verified by Google's library | `token.test.ts` |

### V12 Secure Communication

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 12.1.2 | Recommended cipher suites | ⏳ | Set by Google's front end for Cloud Run | Run SSL Labs on both production hosts |
| 12.1.3 | mTLS client certificates | ➖ | No mTLS | — |
| 12.3.1 | TLS for every connection | ✅ | All outbound calls https (enforced by the allowlist); Atlas over TLS | `outbound.test.ts` |
| 12.3.2 | TLS certificates validated | ✅ | Default validation everywhere; `rejectUnauthorized: false` appears nowhere | Code search |
| 12.3.3 | TLS between internal HTTP services | ✅ | Frontend → API over the API's HTTPS URL | Deployment |
| 12.3.4 | Trusted certificates internally | ✅ | Google-managed certificates | Deployment |

### V13 Configuration

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 13.1.1 | Communication needs documented | ✅ | [communications.md](communications.md) | — |
| 13.2.1 | Backend services authenticated without static credentials | ⚠️ | Google services use short-lived service-account tokens; MongoDB Atlas and SendGrid still use long-lived secrets (in Secret Manager, least privilege) | — |
| 13.2.2 | Least privilege between components | ✅ | Separate service accounts for the API and the jobs; frontend has no database access | Deployment |
| 13.2.3 | No default credentials | ✅ | No default admin; the server refuses weak or missing `JWT_SECRET`, and a missing `MFA_ENCRYPTION_KEY` in production | Code review |
| 13.2.4 | Outbound allowlist | ✅ | `utils/outbound.ts`, [communications.md §3](communications.md) | `outbound.test.ts` |
| 13.2.5 | Server allowlist for requests and loads | ✅ | Same allowlist at the application layer (Cloud Run has no egress firewall without a VPC) | `outbound.test.ts` |
| 13.3.1 | Secrets management | ✅ | Secret Manager in production; nothing in code or images | — |
| 13.3.2 | Least privilege on secrets | ✅ | Per-secret `secretAccessor` bindings for the runtime service accounts only | Deployment ([gcp.md](../deployment/gcp.md)) |
| 13.4.2 | Debug modes off in production | ✅ | `NODE_ENV=production`; Next.js production build; no debug routes | — |
| 13.4.3 | No directory listings | ✅ | Express serves no static folders; Next.js serves only its build output | — |
| 13.4.4 | TRACE not supported | ✅ | Methods outside an allowlist answer `405` | `securityHeaders.test.ts` |
| 13.4.5 | No exposed docs or monitoring endpoints | ✅ | No API docs, metrics or admin consoles exposed; `/api/health` returns only `ok` | — |

### V14 Data Protection

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 14.1.1 | Sensitive data classified | ✅ | [data-protection.md §2](data-protection.md) | — |
| 14.1.2 | Protection requirements per level | ✅ | [data-protection.md §3](data-protection.md) | — |
| 14.2.2 | Not cached in server components | ✅ | `Cache-Control: no-store` on the API, `private, no-store` on pages; no server-side caches | `securityHeaders.test.ts` |
| 14.2.3 | No data to untrusted parties | ✅ | No trackers or analytics; CSP would block them | Code search |
| 14.2.4 | Protection implemented as documented | ✅ | [data-protection.md §4](data-protection.md) | Tests listed there |
| 14.3.2 | Anti-caching headers | ✅ | `Cache-Control: no-store` | `securityHeaders.test.ts` |
| 14.3.3 | No sensitive data in browser storage | ✅ | Only HttpOnly cookies | DevTools check |

### V15 Secure Coding and Architecture

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 15.1.2 | SBOM from trusted repositories | ✅ | CycloneDX SBOM per app in CI (`npm sbom`); npm registry with lock-file integrity | CI artifacts `sbom-backend`, `sbom-frontend` |
| 15.1.3 | Costly functions documented | ✅ | [business-logic.md §4](business-logic.md) | — |
| 15.2.2 | Availability defenses implemented | ✅ | Separate jobs, queues with leases, per-run caps, timeouts, background runs | Ingestion and enrichment tests |
| 15.2.3 | No extraneous functionality in production | ✅ | Images built without dev dependencies or tests (`npm prune --omit=dev`, Next.js standalone, `NODE_ENV=production`); no sample or debug routes | `backend/Dockerfile`, `frontend/Dockerfile` |
| 15.3.2 | External redirects not followed | ✅ | `redirect: "manual"`, followed only within the allowlist | `outbound.test.ts` |
| 15.3.3 | Mass assignment prevented | ✅ | `.strict()` schemas; named fields only; saved filters limited to search fields | `businessLimits.test.ts` |
| 15.3.4 | Real client IP through proxies | ✅ | `TRUST_PROXY` hop count; `proxy-addr` 2.0.8 | `sessions.test.ts` (`parseTrustProxy`) |
| 15.3.5 | Strict types and comparisons | ✅ | TypeScript strict + Zod types; `==` only as the `== null` idiom | Code search, `inputHandling.test.ts` |
| 15.3.6 | Prototype pollution prevented | ✅ | No merging of user objects; `Map` for day notes; `__proto__` refused in saved filters | `businessLimits.test.ts` |
| 15.3.7 | HTTP parameter pollution | ✅ | Express 5 "simple" query parser; single-valued fields refuse arrays | `inputHandling.test.ts` |

### V16 Security Logging and Error Handling

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 16.1.1 | Log inventory | ✅ | [logging.md §1](logging.md) | — |
| 16.2.1 | When, where, who, what in every entry | ✅ | `utils/securityLog.ts` + request id | `securityLog.test.ts`, `securityEvents.test.ts` |
| 16.2.2 | UTC timestamps, synced clocks | ✅ | ISO 8601 UTC; Google-synced clocks | `securityLog.test.ts` |
| 16.2.3 | Logs only to documented sinks | ✅ | stdout → Cloud Logging, and `systemlogs` | — |
| 16.2.4 | Common, machine-readable format | ✅ | JSON lines with Cloud Logging `severity` | `securityLog.test.ts` |
| 16.2.5 | Sensitive data in logs per protection level | ✅ | No secrets; e-mails masked; no bodies | `securityEvents.test.ts` |
| 16.3.1 | All authentication operations logged | ✅ | `auth.*`, `session.*` events, success and failure | `securityEvents.test.ts` |
| 16.3.2 | Failed authorization logged | ✅ | `authz.denied` | `securityEvents.test.ts` |
| 16.3.3 | Security events and bypass attempts logged | ✅ | `csrf.blocked`, `ratelimit.exceeded`, `input.rejected`, `admin.action`, `outbound.blocked` | `securityEvents.test.ts` |
| 16.3.4 | Unexpected errors and control failures logged | ✅ | `error.unexpected`, `email.send`, `dependency.unavailable`, pipeline `systemlogs` | `errorHandler.test.ts` |
| 16.4.1 | Log injection prevented | ✅ | One `JSON.stringify` per entry | `securityLog.test.ts` |
| 16.4.2 | Logs protected from access and modification | ⚠️ | Cloud Logging entries can't be edited and reads need IAM; the log bucket still has to be locked at deployment to prevent early deletion ([logging.md §7](logging.md)) | Deployment step |
| 16.4.3 | Logs sent to a separate system | ✅ | Cloud Logging, outside the container | — |
| 16.5.1 | Generic error messages | ✅ | `errorHandler.ts` | `errorHandler.test.ts` |
| 16.5.2 | Graceful degradation when dependencies fail | ✅ | Timeouts, retries, per-TOR isolation, fail-open breach check, queued retries | Ingestion tests, `passwordPolicy.test.ts` |
| 16.5.3 | Fail securely | ✅ | Validation stops writes; transactions roll back; undecryptable seed = wrong code | `accountDeleteTransaction.test.ts`, `mfa.test.ts` |

### V17 WebRTC

| ID | Requirement | Status | Implementation (evidence) | Verified by |
| --- | --- | :-: | --- | --- |
| 17.1.1 | WebRTC | ➖ | No WebRTC, TURN or media server | — |
| 17.2.1 | WebRTC | ➖ | No WebRTC, TURN or media server | — |
| 17.2.2 | WebRTC | ➖ | No WebRTC, TURN or media server | — |
| 17.2.3 | WebRTC | ➖ | No WebRTC, TURN or media server | — |
| 17.2.4 | WebRTC | ➖ | No WebRTC, TURN or media server | — |
| 17.3.1 | WebRTC | ➖ | No WebRTC, TURN or media server | — |
| 17.3.2 | WebRTC | ➖ | No WebRTC, TURN or media server | — |

### 4.18 What is not fully met

| ID | Status | What is missing | Next step |
| --- | :-: | --- | --- |
| 4.1.2 | ⚠️ | Only user-facing endpoints redirect HTTP→HTTPS: Cloud Run redirects plain HTTP to HTTPS on every path, API included, and the application can't change that. HSTS (1 year) limits exposure to a browser's first request | Accept it (platform behaviour, mitigated by HSTS), or put the API behind a load balancer that refuses plain HTTP. |
| 5.4.3 | ❌ | Antivirus scan of untrusted files: e-GP PDFs are not scanned; plan: ClamAV in the ingestion job, or Cloud Storage malware scanning ([file-handling.md §3](file-handling.md)) | Scan e-GP PDFs with ClamAV in the ingestion job, or enable Cloud Storage malware scanning. |
| 12.1.2 | ⏳ | Recommended cipher suites: Set by Google's front end for Cloud Run | Run SSL Labs on both `*.run.app` hosts and record the grade. |
| 13.2.1 | ⚠️ | Backend services authenticated without static credentials: Google services use short-lived service-account tokens; MongoDB Atlas and SendGrid still use long-lived secrets (in Secret Manager, least privilege) | Atlas workload-identity federation (needs a paid tier); keep SendGrid's key restricted and rotated. |
| 16.4.2 | ⚠️ | Logs protected from access and modification: Cloud Logging entries can't be edited and reads need IAM; the log bucket still has to be locked at deployment to prevent early deletion ([logging.md §7](logging.md)) | Lock the Cloud Logging bucket when deploying (`gcloud logging buckets update _Default --locked`). |

## 5. Level 3 requirements also met

| ID | Requirement | Implementation (evidence) |
| --- | --- | --- |
| 3.3.5 | Cookie name + value under 4,096 bytes | The largest, the session JWT, is about 350 bytes |
| 3.4.3 (L3 part) | Per-response CSP with nonces | Fresh 128-bit nonce for every page (`frontend/src/proxy.ts`) |
| 3.5.6 | No JSONP | None anywhere |
| 3.5.7 | No authorized data in script responses | Account data only in JSON from the API |
| 3.6.1 | No client assets from external CDNs | Fonts self-hosted by `next/font`; no third-party scripts |
| 4.1.4 | Only supported HTTP methods accepted | `405` for anything outside the allowlist (`securityHeaders.ts`) |
| 5.3.3 | Archive paths from users ignored (zip slip) | Only one chosen PDF entry is read, into memory; no paths are written |
| 6.5.6 | Every authentication factor can be revoked | MFA off or new recovery codes, Google unlink, session revocation, operator MFA reset |
| 6.5.8 | TOTP checked against a trusted clock | The server's own clock, never a client time |
| 7.5.3 | Further authentication before highly sensitive actions | Re-authentication before "sign everyone out" and MFA changes |
| 8.3.2 | Authorization changes apply immediately | Role and session read from the database on every request |
| 8.3.3 | Access based on the user's own permissions | Every query runs as `req.user`; no service-level elevation |
| 10.2.3 | OAuth client asks only for needed scopes | `openid email profile` |
| 11.2.4 | Constant-time comparisons | `timingSafeEqual` for reset tokens and TOTP codes; bcrypt compares |
| 11.2.5 | Crypto fails securely | A seed that won't decrypt counts as a wrong code |
| 11.3.4 | IVs never reused | A fresh random 96-bit IV for every sealed value |
| 13.1.4 | Critical secrets and rotation schedule documented | [cryptography.md §1](cryptography.md) |
| 13.4.6 | No detailed version information exposed | `X-Powered-By` removed from backend and Next.js |
| 14.2.6 | Only the minimum sensitive data returned | Projections; the admin user lookup returns no IPs or devices |
| 15.1.4 | Risky components highlighted | `pdf-parse` in [dependency-management.md](dependency-management.md) |
| 15.2.4 | Components from the expected repository | npm registry only, lock-file integrity hashes |
| 16.5.4 | Last-resort error handler | Express's central `errorHandler` catches every error from every route |
| 2.3.5 (part) | — | Not met: no multi-user approval for high-value actions |
| 6.3.8 | — | Not met: registration answers `409` for a used e-mail |

Of these, 22 are met; the last two rows are listed so they aren't mistaken for oversights.

## 6. How this checklist was produced

1. Every Level 1 and Level 2 requirement was read from the official ASVS 5.0.0 release (`OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json`).
2. Each one was checked against the code, and marked ✅ only when the code was found and, where possible, an automated test exercises it. Where the evidence is a document, a deployment setting or a manual check, the "Verified by" column says so.
3. The backend test suite (`cd backend && npm test`, over 1,250 tests) runs on every pull request in GitHub Actions, together with `npm audit` and the SBOM.
4. SAST (CodeQL/Semgrep) and DAST (OWASP ZAP) results will be attached to the project report as further evidence.
