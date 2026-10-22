# Security Documentation

TOR Checker is secured against the [OWASP Application Security Verification Standard (ASVS) 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en) and mapped to the [OWASP Top 10:2025](https://owasp.org/Top10/).

| ASVS Level 1 | ASVS Level 2 | Level 3 extras | Automated checks |
| :-: | :-: | :-: | :-: |
| **62 / 63** applicable met, 1 awaiting an SSL Labs scan | **135 / 140** applicable met | **22** met | 1,250+ backend tests, `npm audit` and an SBOM on every pull request |

## Documents

| Document | ASVS | What it covers |
| --- | --- | --- |
| [**ASVS compliance checklist**](asvs-checklist.md) | Level 1 and 2 | Every Level 1 and Level 2 requirement with status, code evidence and test evidence; OWASP Top 10:2025 mapping; Level 3 extras; what is left |
| [Input validation rules](input-validation.md) | 2.1.1 | The rule every input field must pass, endpoint by endpoint |
| [Business logic and resource limits](business-logic.md) | 2.1.2, 2.1.3, 15.1.3 | Cross-field rules, per-user and global limits, costly functions, atomicity |
| [File handling](file-handling.md) | 5.1.1 | Accepted files, sizes, zip limits, safe serving, malicious files |
| [Authentication](authentication-defenses.md) | 6.1.1–6.1.3, 6.4.4, 6.8.4 | Rate limits, password rules (context words, breach check), sign-in pathways, two-step verification, lost factors |
| [Session management](session-management.md) | 7.1.1–7.1.3 | Timeouts, concurrent sessions, ending sessions, re-authentication, Google sign-in |
| [Authorization rules](authorization.md) | 8.1.1, 8.1.2 | Roles, who may call each endpoint, whose data and which fields it may touch |
| [Cryptography](cryptography.md) | 11.1.1, 11.1.2, 11.2.2 | Key management policy, inventory of keys, algorithms and random values, crypto agility |
| [Communications](communications.md) | 13.1.1, 13.2.4 | Every inbound and outbound connection, the outbound allowlist, service authentication, TLS |
| [Data protection](data-protection.md) | 14.1.1, 14.1.2 | Data classification and the protection each level gets |
| [Third-party component policy](dependency-management.md) | 15.1.1, 15.1.2, 15.2.1 | Dependency inventory and SBOM, remediation time frames, audit results |
| [Security logging](logging.md) | 16.1.1 | Log inventory, every security event, format, what is never logged, protection |

## Trust boundaries

Everything the user's browser sends is untrusted until the API has checked it. Data from the government e-GP systems and from the AI model is also treated as untrusted input.

| Zone | Components | How we treat it |
| --- | --- | --- |
| Internet | Visitors' and vendors' browsers, admins' browsers and the Chrome extension | **Untrusted.** Every request is checked by the API (layers below). |
| Google Cloud (ours) | Next.js frontend and Express API on Cloud Run, ingestion and AI jobs on Cloud Run Jobs, Cloud Storage, Secret Manager | Trusted, with each service limited to what it needs. |
| Database | MongoDB Atlas | Reached only by the API and the jobs, never by the frontend or browsers. |
| Google sign-in | Google OAuth / OpenID Connect | Trusted for identity, but every ID token's signature and audience is verified. |
| Data sources | e-GP portals, Vertex AI (Gemini) | **Untrusted content.** Mapped field by field into our schema; TORs are public only after enrichment. |
| Email | SendGrid | Outbound only. |


Key properties:
- **Only the API talks to the database.** The frontend has no database credentials.
- **Secrets never live in the code or the images**: `.env` files are git-ignored locally, Secret Manager holds them in production.
- **The API and the jobs run as different service accounts**, each with only the permissions it needs.

## Defense in depth: what a request passes through, in order

1. **Request id**: every request gets one, for the logs and the `X-Request-Id` header
2. **Security headers**: HSTS, nosniff, CSP, `Cache-Control: no-store`; unused methods (TRACE) refused
3. **CORS**: only `CLIENT_ORIGIN` may read responses
4. **CSRF guard**: `Origin` / `Sec-Fetch-Site` must be ours
5. **Rate limit**: sign-in, MFA codes, password reset, reports, chat
6. **Authentication**: HS256 JWT with issuer, audience and purpose, a live session row, 30-minute idle and 12-hour limits
7. **Role check**: vendor or admin; admins also need an MFA-verified session
8. **Re-authentication**: for changes to the account's own e-mail, password, MFA, Google link and sessions
9. **Input validation**: Zod schemas, strict, escaped regex, business limits
10. **Ownership filter**: every query on user data uses `req.user.id`

Each layer stops a different attack, so a mistake in one layer is caught by another. Any layer can stop the request with a `4xx` answer, and the refusal is written to the security log; an unexpected failure anywhere becomes a generic `500 "Internal server error"` from the central error handler, with the details logged only on the server. On the way out, the server may only call allowlisted hosts.

## Where the controls live in the code

| Control | File |
| --- | --- |
| Authentication, sessions, role checks, admin MFA gate | `backend/src/middleware/auth.ts`, `backend/src/utils/token.ts`, `backend/src/services/sessions.ts` |
| Two-step verification | `backend/src/services/mfa.ts`, `backend/src/controllers/mfaController.ts`, `backend/src/utils/totp.ts`, `backend/src/utils/secretBox.ts` |
| Re-authentication | `backend/src/services/reauth.ts`, `frontend/src/components/ReauthDialog.tsx` |
| Password policy | `backend/src/utils/passwordPolicy.ts`, `backend/src/config/commonPasswords.ts`, `backend/src/config/contextWords.ts`, `backend/src/utils/breachedPasswords.ts` |
| Rate limits | `backend/src/middleware/rateLimit.ts`, `backend/src/middleware/rateLimits.ts` |
| Security headers, CSP | `backend/src/middleware/securityHeaders.ts`, `frontend/next.config.ts`, `frontend/src/proxy.ts` |
| CSRF guard | `backend/src/middleware/originCheck.ts` |
| Security log, admin audit | `backend/src/utils/securityLog.ts`, `backend/src/middleware/requestId.ts`, `backend/src/middleware/auditLog.ts` |
| Error handling | `backend/src/middleware/errorHandler.ts` |
| Outbound allowlist | `backend/src/utils/outbound.ts` |
| Upload and download checks | `backend/src/utils/imageType.ts`, `backend/src/utils/contentDisposition.ts`, `backend/src/ingestion/capture/torFromBundle.ts` |
| Transactions | `backend/src/utils/transaction.ts` |

## Keeping these documents current

Update the matching document in the same pull request whenever a change:
- adds or changes an endpoint, a request field or a validation rule;
- changes who may call an endpoint;
- changes a rate limit, a password rule, a session limit or the MFA flow;
- adds a security event, an outbound destination, a secret or a kind of stored data;
- adds, removes or majorly upgrades a runtime dependency.
