# OWASP ASVS 5.0 Compliance Checklist

**Application:** TOR Checker · **Standard:** [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en) · **Target:** all of Level 1, selected Level 2–3 · **Risk mapping:** [OWASP Top 10:2025](https://owasp.org/Top10/)

Every Level 1 requirement is listed below with its status, the code that implements it, and the test that proves it. Paths are relative to the repository root.

## 1. Summary

| | Level 1 requirements |
| --- | ---: |
| ✅ Met | **59** |
| ⏳ Implemented, needs a tool run to confirm (`npm audit`, SSL Labs) | 2 |
| ➖ Not applicable to this application | 9 |
| ❌ Not met | 0 |
| **Total** | **70** |

**Level 1 coverage: 59 of the 61 applicable requirements met (97%); the other 2 only need a tool run to confirm.** In addition, **24 Level 2 and Level 3 requirements** are met (section 4).


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
| 6.2.8 | Password checked exactly as typed (no truncation) | ✅ | Passwords over 72 bytes refused; login never matches a truncated one (`models/User.ts`) | `passwordPolicyRoutes.test.ts` | A07 |
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
| 7.4.2 | Deleting an account ends all its sessions | ✅ | `Session.deleteMany` in `deleteAccount` | Code review | A07 |

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
| 9.2.1 | `exp` / `nbf` checked | ✅ | `expiresIn: 7d`, checked by `jwt.verify()` | Library behaviour (jsonwebtoken rejects expired tokens) | A07 |

### V10 OAuth and OIDC

| ID | Requirement | Status | Reason | Top 10 |
| --- | --- | :-: | --- | :-: |
| 10.4.1 – 10.4.5 | Authorization server requirements (redirect URI allowlist, single-use and short-lived codes, allowed grants, refresh token replay) | ➖ | We are an OAuth **client**; Google is the authorization server. Our client-side controls are listed in section 4 (10.2.1, 10.5.4). | A07 |

### V11 Cryptography

| ID | Requirement | Status | Implementation (evidence) | Verified by | Top 10 |
| --- | --- | :-: | --- | --- | :-: |
| 11.3.1 | No insecure block modes | ➖ | The application doesn't encrypt data itself | — | A04 |
| 11.3.2 | Only approved ciphers | ➖ | Same reason | — | A04 |
| 11.4.1 | Only approved hash functions | ✅ | SHA-256 (reset tokens, content hashes), HMAC-SHA-256 (JWT), bcrypt (passwords); no MD5/SHA-1 | Code search | A04 |

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
| 15.2.1 | No component past its remediation time frame | ⏳ | Policy in place; needs an `npm audit --omit=dev` run recorded in [dependency-management.md §6](dependency-management.md#6-current-status) | `npm audit` | A03 |
| 15.3.1 | Only required fields returned | ✅ | Mongoose projections and `toJSON` transforms (no `passwordHash`, tokens or storage keys) | `sessions.test.ts`, `torProcurementExposure.test.ts` | A01 |

V16 (Security Logging and Error Handling) and V17 (WebRTC) contain no Level 1 requirements.

## 3. Mapping to OWASP Top 10:2025

| Top 10:2025 | How TOR Checker addresses it | Main ASVS requirements | Status |
| --- | --- | --- | :-: |
| **A01** Broken Access Control | Role checks on every protected route, ownership filters on all user data, CSRF guard, only public TORs exposed | 8.1.1, 8.2.1, 8.2.2, 8.3.1, 3.5.1–3.5.3, 5.3.2, 15.3.1 | ✅ |
| **A02** Security Misconfiguration | Security headers (HSTS, nosniff, CSP `frame-ancestors`, Referrer-Policy), strict CORS, no default secrets, `X-Powered-By` removed, `.git` not deployed | 3.2.1, 3.3.1, 3.4.1, 3.4.2, 4.1.1, 13.2.3, 13.4.1 | ✅ |
| **A03** Software Supply Chain Failures | Lock files and `npm ci`, dependency inventory, risk-based remediation time frames | 15.1.1, 15.2.1 | ⏳ needs `npm audit` record |
| **A04** Cryptographic Failures | HTTPS only with HSTS, bcrypt (cost 12), SHA-256, 256-bit JWT secret, no secrets in URLs or browser storage | 11.4.1, 11.4.2, 12.x, 14.2.1, 14.3.1 | ✅ (TLS versions to confirm) |
| **A05** Injection | Zod validation, Mongoose with no client-supplied operators, escaped regex, React output encoding, no `eval`/shell | 1.2.1–1.2.5, 1.3.2, 2.2.1 | ✅ |
| **A06** Insecure Design | Documented validation rules, upload content checks, server-side validation, business flow order | 2.1.1, 2.2.2, 2.3.1, 5.2.x | ✅ |
| **A07** Authentication Failures | Password policy with common-password list, rate limits without lockout, secure sessions with revocation, Google OIDC sign-in | 6.x, 7.x, 9.2.1 | ✅ |
| **A08** Software or Data Integrity Failures | JWT signature and algorithm allowlist, keys only from configuration | 9.1.1–9.1.3 | ✅ |
| **A09** Security Logging & Alerting Failures | Admin alerts for failed ingestion runs exist; security event logging (sign-ins, access denials) not yet | 16.3.1, 16.3.2 (L2) | ⚠️ planned |
| **A10** Mishandling of Exceptional Conditions | Central error handler returns a generic message on every 5xx and logs the details server-side | 16.5.1 (L2) | ✅ |

## 4. Level 2 and Level 3 requirements also met

| ID | Level | Requirement | Implementation (evidence) |
| --- | :-: | --- | --- |
| 2.4.1 | 2 | Anti-automation on costly functions | Rate limits on register, reset, reports and view counts; capped AI calls per run |
| 3.3.2 | 2 | `SameSite` set per cookie purpose | `SameSite=Lax` on the session and OAuth state cookies |
| 3.3.3 | 2 | `__Host-` prefix | `__Host-token`, `__Host-oauth_state` in production |
| 3.3.4 | 2 | Session cookie `HttpOnly` | `httpOnly: true` in `cookieOptions()` |
| 3.4.4 | 2 | `X-Content-Type-Options: nosniff` everywhere | `securityHeaders.ts`, `next.config.ts` |
| 3.4.5 | 2 | Referrer policy | `no-referrer` (API), `strict-origin-when-cross-origin` (frontend) |
| 3.4.6 | 2 | CSP `frame-ancestors` against clickjacking | `frame-ancestors 'none'` on backend and frontend |
| 3.7.2 | 2 | Redirects to other domains only via allowlist | `safeNextPath()` on the login page (no open redirect) |
| 5.4.1 | 2 | Server chooses the download file name | `Content-Disposition` set by the server for TOR PDFs and avatars |
| 6.8.2 | 2 | Identity assertions' signatures always checked | Google ID token verified with `verifyIdToken()` |
| 7.4.3 | 2 | Option to end other sessions after a password change | Done automatically on change and reset |
| 7.5.2 | 2 | Users can view and end their active sessions | *Account settings → Devices* (`GET/DELETE /api/auth/sessions`) |
| 8.2.3 | 2 | Field-level access (no over-exposed properties) | Strict update schemas and response projections |
| 10.2.1 | 2 | OAuth client protected against CSRF | Random `state` checked against a cookie |
| 10.5.4 | 2 | ID token audience checked | `audience: GOOGLE_CLIENT_ID` in `verifyIdToken()` |
| 11.4.2 | 2 | Passwords stored with a slow KDF | bcrypt, cost 12 |
| 13.2.2 | 2 | Least privilege between components | Frontend has no database access; separate Cloud Run service accounts for API and jobs |
| 13.2.3 | 2 | No default credentials | Backend refuses to start without a ≥ 32-character `JWT_SECRET` |
| 13.3.1 | 2 | Secrets kept out of code | `.env` files git-ignored; production secrets in Google Secret Manager |
| 14.3.3 | 2 | No sensitive data in browser storage | Only the HttpOnly session cookie |
| 15.3.3 | 2 | Mass assignment prevented | `.strict()` Zod schemas reject unexpected fields |
| 16.5.1 | 2 | Generic error message on unexpected errors | `backend/src/middleware/errorHandler.ts` |
| 8.3.2 | 3 | Authorization changes apply immediately | Role and session read from the database on every request |
| 13.4.6 | 3 | No detailed version information exposed | `X-Powered-By` removed from backend and Next.js |

## 5. How this checklist was produced

1. Every Level 1 requirement was read from the official ASVS 5.0 chapter files.
2. Each one was checked against the code, and an item was only marked ✅ when the code was found and, where possible, an automated test exercises it.
3. The backend test suite (`cd backend && npm test`) runs on every pull request in GitHub Actions.
4. SAST (CodeQL/Semgrep) and DAST (OWASP ZAP) results will be attached to the project report as further evidence.
