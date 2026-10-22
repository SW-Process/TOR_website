# Security Logging and Error Handling

**ASVS 5.0 requirements documented here:**
- **16.1.1 (L2):** the inventory of what each layer logs, in which format, where it goes, who can read it, and for how long (sections 1–3);
- the security events of **16.3.1–16.3.4** that the code writes (section 4);
- how **16.2.x**, **16.4.x** and **16.5.x** are met (sections 5–7).

## 1. Log inventory (ASVS 16.1.1)

| Layer | What is logged | Format | Written to | Stored in | Who can read it | Kept for |
| --- | --- | --- | --- | --- | --- | --- |
| **Security events** (API) | Sign-in, sign-out, registration, password, MFA, session, re-authentication and account events; denied access; CSRF blocks; rate-limit hits; rejected input; admin changes; unexpected errors; blocked outbound calls; unavailable dependencies (section 4) | One JSON object per line, `logType: "security"` (section 5) | stdout (`utils/securityLog.ts`) | **Cloud Logging**, log bucket `_Default` of the project | Project owners and principals with `roles/logging.viewer` (section 7) | 30 days (Cloud Logging default) |
| Request log (platform) | Every HTTP request: time, method, URL, status, latency, client IP, user agent | Cloud Run request log | Google's front end | Cloud Logging (`run.googleapis.com/requests`) | As above | 30 days |
| Pipeline log (jobs and API) | Ingestion, AI enrichment and lifecycle progress, per-TOR failures, e-GP and Gemini errors (incl. TLS and network failures, ASVS 16.3.4) | Documents `{ source, component, severity, message, context, ingestionRunId, timestamp }` | `systemlogs` collection (`models/SystemLog.ts`) and stdout | MongoDB Atlas, and Cloud Logging | Admins in the admin panel (*System Logs*), read-only; database operators | Until deleted (no TTL yet, see section 8) |
| Ingestion runs | Per-run counters and outcome | `ingestionruns` collection | API and jobs | MongoDB Atlas | Admins (*สถานะสแครปเปอร์*) | Until deleted |
| Application stdout (other) | Server start-up, fatal start-up errors (e.g. missing `JWT_SECRET`) | Plain text | stdout | Cloud Logging | As above | 30 days |
| Frontend (Next.js) | Server rendering errors | Plain text | stdout | Cloud Logging | As above | 30 days |
| Browser | Nothing is logged or sent from the browser: no analytics, trackers or error reporters | | | | | |

The application sends logs **only** to the places listed above (ASVS 16.2.3): stdout (→ Cloud Logging) and the `systemlogs` collection. No log is written to a file in the container, sent to a third-party service, or shown to users.

## 2. Where security events come from

| Event source | File |
| --- | --- |
| The logger, field rules, masking | `backend/src/utils/securityLog.ts` |
| Request id per request | `backend/src/middleware/requestId.ts` |
| Sign-in, account and Google events | `backend/src/controllers/authController.ts` |
| MFA events | `backend/src/controllers/mfaController.ts`, `backend/src/services/mfa.ts` |
| Sessions | `backend/src/services/sessions.ts`, `backend/src/middleware/auth.ts` |
| Re-authentication | `backend/src/services/reauth.ts` |
| Denied access, admin MFA gate | `backend/src/middleware/auth.ts` |
| CSRF blocks | `backend/src/middleware/originCheck.ts` |
| Rate-limit hits | `backend/src/middleware/rateLimit.ts` |
| Rejected input, unexpected errors | `backend/src/middleware/errorHandler.ts` |
| Admin changes (audit trail) | `backend/src/middleware/auditLog.ts` on the admin and ingestion routers |
| Admin session controls | `backend/src/controllers/adminSessionController.ts` |
| Outbound blocks, dependency failures | `backend/src/utils/outbound.ts`, `backend/src/utils/breachedPasswords.ts` |
| Operator MFA reset | `backend/src/scripts/resetMfa.ts` |

## 3. Reading the logs

In the Google Cloud console, *Logging → Logs Explorer*, with the API service selected:

```text
jsonPayload.logType="security"
jsonPayload.event="auth.login" AND jsonPayload.outcome="failure"
jsonPayload.userId="<user id>"
jsonPayload.requestId="<X-Request-Id from a user's report>"
severity>=WARNING AND jsonPayload.logType="security"
```

Every API response carries `X-Request-Id`, so a user's error report can be matched to its log lines.

## 4. Security events (ASVS 16.3.1–16.3.4)

`outcome` is `success`, `failure` (the user got something wrong) or `blocked` (a control refused the request).

### 4.1 Authentication (16.3.1)

| Event | When | Main fields |
| --- | --- | --- |
| `auth.login` | Every password or Google sign-in, success or failure | `method` (`password`/`google`), `reason` on failure (`bad_password`, `unknown_account`, `google_state`, …), `mfaPending` when a code is still needed; an unknown e-mail is masked |
| `auth.mfa_verify` | The code step, success or failure | `factor` (`totp`/`recovery`), `method`, `reason` (`bad_code`, `expired`) |
| `auth.mfa_lockout` | 5 wrong codes ended a pending sign-in | |
| `auth.recovery_code_used` | A recovery code was used | |
| `session.start` | A session was created | `method`, `mfa` |
| `auth.logout`, `session.revoke`, `session.revoke_others` | Sign-out of this, one or every other device | |
| `session.expired` | Inactivity timeout | `reason: "idle"` |
| `session.evicted` | The 10-session cap ended old sessions | `count` |
| `session.revoke_user`, `session.revoke_all` | An admin ended sessions | `targetUserId`, `ended` |
| `auth.register` | Sign-up, success or failure | `method`, `reason` (`email_taken`, `password_policy`) |
| `auth.reauth`, `auth.reauth_required` | Re-authentication passed, failed or was demanded | `reason` |
| `auth.password_change`, `auth.password_set`, `auth.password_rehash` | Password changed, set for the first time, or re-hashed with the current scheme | |
| `auth.password_reset_request`, `auth.password_reset` | Reset asked for and done | `reason` (`unknown_account`, `cooldown`, `invalid_or_expired_token`) |
| `auth.mfa_setup_start`, `auth.mfa_enable`, `auth.mfa_disable`, `auth.recovery_codes_regenerate` | MFA settings changes | |
| `auth.mfa_reset_by_operator` | `npm run reset-mfa` | `reason` (the support ticket) |
| `auth.google_link`, `auth.google_unlink` | Google linked or unlinked | `via` |
| `account.email_change`, `account.delete` | | |

### 4.2 Authorization (16.3.2)

| Event | When | Main fields |
| --- | --- | --- |
| `authz.denied` | Every refused request: no session, an invalid or expired session, the wrong role, or an admin session without MFA | `reason` (`no_session`, `invalid_or_expired_session`, `role`, `admin_mfa_required`), `required`, `role` |

Requests for another user's data are answered `404` by the ownership filters (see [authorization.md](authorization.md)) and appear in the Cloud Run request log.

### 4.3 Attempts to bypass controls (16.3.3)

| Event | When |
| --- | --- |
| `csrf.blocked` | A state-changing request from another site (`origin` or `secFetchSite`) |
| `ratelimit.exceeded` | A limiter's first refusal in its window (`limiter`, `max`, `windowMs`), once per key per window so a flood doesn't flood the log |
| `input.rejected` | Our validation refused a request (`reason`: `validation`, `schema`, `upload`) |
| `admin.action` | Every state-changing admin request: `route`, `status`, `fields` (names only, not values) |
| `outbound.blocked` | The server was about to call a host outside the allowlist, or follow a redirect to one |

### 4.4 Errors and failing controls (16.3.4)

| Event | When |
| --- | --- |
| `error.unexpected` | Any 5xx: error name, message and the top of the stack (server-side only; the client gets `"Internal server error"`) |
| `email.send` | A password-reset e-mail couldn't be sent |
| `dependency.unavailable` | The breached-password service didn't answer (the check failed open) |
| `systemlogs` entries | e-GP, Gemini and storage failures in the pipeline, including TLS and network errors |

## 5. Entry format (ASVS 16.2.1, 16.2.2, 16.2.4)

```json
{
  "severity": "WARNING",
  "time": "2026-10-22T06:15:03.512Z",
  "logType": "security",
  "event": "auth.login",
  "outcome": "failure",
  "userId": "6716f0c2a8b4e3d1f0a9c7b2",
  "requestId": "3f1c0d6e9a8b47c5b2e1f0a9d8c7b6a5",
  "method": "POST",
  "path": "/api/auth/login",
  "ip": "203.0.113.24",
  "userAgent": "Mozilla/5.0 (Macintosh; …)",
  "sessionId": null,
  "reason": "bad_password"
}
```

| Question | Field |
| --- | --- |
| When | `time`: ISO 8601 in **UTC** (16.2.2). Cloud Run's clock is synchronised by Google (NTP), and Cloud Logging adds its own receive time. |
| Where | `method`, `path` (no query string), `ip` (the real client IP via `TRUST_PROXY`, ASVS 15.3.4), `userAgent` (200 characters at most) |
| Who | `userId`, `sessionId` |
| What | `event`, `outcome`, `severity`, plus the event's own fields |
| Which request | `requestId`: the Cloud Run trace id when present (only if it is well-formed), else 128 random bits; also returned as `X-Request-Id` |

`severity` uses Cloud Logging's names (`INFO`, `NOTICE`, `WARNING`, `ERROR`), so the platform reads, filters and alerts on it without any parsing rule (16.2.4).

## 6. What never goes in a log (ASVS 16.2.5, 16.4.1)

| Data | Rule |
| --- | --- |
| Passwords, TOTP codes, recovery codes, reset tokens or links, session cookies, JWTs, API keys | Never logged. Tests check that a failed and a successful sign-in leave no password in the log. |
| E-mail addresses | Logged only when no account matched, and then masked (`kob***@gmail.com`); otherwise the user id is used. |
| Request bodies | Never logged whole. The admin audit lists field **names** only. |
| Query strings | Dropped from `path` (they can hold search text). |
| Long values | Cut at 500 characters. |
| Log injection | Each entry is one `JSON.stringify` call: a newline or quote in user input stays inside its string and can't start a forged entry (16.4.1). The request id is taken from a header only if it is 32 hex characters. |

Logging never breaks a request: the logger catches its own errors.

## 7. Protecting the logs (ASVS 16.4.2, 16.4.3)

- **Separate system.** Security events leave the container as soon as they are written, to Cloud Logging, which the application has no permission to change or delete (16.4.3). An attacker who takes over the API container can't rewrite what has already been logged.
- **Who can read.** Cloud Logging access follows IAM: only the project owners and principals given `roles/logging.viewer` (the team members). The runtime service accounts can only write logs (`roles/logging.logWriter`). Routine audit: `gcloud projects get-iam-policy <project>`.
- **Cannot be modified.** Cloud Logging entries can't be edited. A log bucket can be locked against early deletion (`gcloud logging buckets update _Default --location=global --locked`), which we recommend before production.
- **Pipeline logs in MongoDB.** Admins can only read them through the admin API. No endpoint edits or deletes them.

## 8. Errors (ASVS 16.5)

| Requirement | How |
| --- | --- |
| 16.5.1 Generic message on unexpected errors | `middleware/errorHandler.ts`: any 5xx answers `{"message":"Internal server error"}`. The details go to `error.unexpected` only. |
| 16.5.2 Keep working when a dependency fails | e-GP calls have timeouts, retries with backoff and per-TOR isolation (one failing TOR doesn't stop a run); Gemini calls are capped per run, and a failed job is retried later from the queue; a failed reset e-mail doesn't change the response; the breached-password check fails open with a 3-second timeout; a missing stored PDF answers `404`/`502`, never a hung request. |
| 16.5.3 Fail closed | Validation errors stop the request before any write; a failure inside a multi-step change is rolled back (account deletion runs in a transaction); a session or token check that throws counts as signed out; an MFA check that can't decrypt the seed counts as a wrong code. |

## 9. Gaps

| Gap | Plan |
| --- | --- |
| `systemlogs` has no retention limit. | Add a TTL index (e.g. 180 days) together with the admin log page's date filter. |
| No alerting yet. | A log-based alert on `jsonPayload.event="ratelimit.exceeded"` and on `severity>=ERROR` with `logType="security"`, e-mailing the team. |
| The log bucket is not locked. | Lock it before production (section 7). |
