# Security Documentation

TOR Checker is secured against the [OWASP Application Security Verification Standard (ASVS) 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en) and mapped to the [OWASP Top 10:2025](https://owasp.org/Top10/).

| ASVS Level 1 | Level 2–3 extras | Automated security tests |
| :-: | :-: | :-: |
| **59 / 61** applicable met, 2 awaiting a tool run | **24** requirements met | Run on every pull request in GitHub Actions |

## Documents

| Document | ASVS | What it covers |
| --- | --- | --- |
| [**ASVS compliance checklist**](asvs-checklist.md) | all of Level 1 | Every Level 1 requirement with status, code evidence, test evidence and OWASP Top 10:2025 category; Level 2–3 extras |
| [Input validation rules](input-validation.md) | 2.1.1 | The rule every input field must pass, endpoint by endpoint |
| [Sign-in defenses](authentication-defenses.md) | 6.1.1, 6.3.1 | Rate limits against brute force and credential stuffing, and how malicious lockout is prevented |
| [Authorization rules](authorization.md) | 8.1.1 | Roles, which role may call each endpoint, and whose data it may touch |
| [Third-party component policy](dependency-management.md) | 15.1.1, 15.2.1 | Dependency inventory, remediation time frames by severity, update process |

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

1. **Security headers**: HSTS, nosniff, CSP `frame-ancestors`
2. **CORS**: only `CLIENT_ORIGIN` may read responses
3. **CSRF guard**: `Origin` / `Sec-Fetch-Site` must be ours
4. **Rate limit**: sign-in, password reset, reports
5. **Authentication**: HS256 JWT and a live session row
6. **Role check**: vendor or admin
7. **Input validation**: Zod schemas, strict, escaped regex
8. **Ownership filter**: every query on user data uses `req.user.id`

Each layer stops a different attack, so a mistake in one layer is caught by another. Any layer can stop the request with a `4xx` answer; an unexpected failure anywhere becomes a generic `500 "Internal server error"` from the central error handler, with the details logged only on the server.

## Where the controls live in the code

| Control | File |
| --- | --- |
| Authentication, sessions, role checks | `backend/src/middleware/auth.ts`, `backend/src/utils/token.ts`, `backend/src/services/sessions.ts` |
| Password policy | `backend/src/utils/passwordPolicy.ts`, `backend/src/config/commonPasswords.ts` |
| Rate limits | `backend/src/middleware/rateLimit.ts`, `backend/src/middleware/rateLimits.ts` |
| Security headers | `backend/src/middleware/securityHeaders.ts`, `frontend/next.config.ts` |
| CSRF guard | `backend/src/middleware/originCheck.ts` |
| Error handling | `backend/src/middleware/errorHandler.ts` |
| Upload checks | `backend/src/utils/imageType.ts` |

## Keeping these documents current

Update the matching document in the same pull request whenever a change:
- adds or changes an endpoint, a request field or a validation rule;
- changes who may call an endpoint;
- changes a rate limit or a password rule;
- adds, removes or majorly upgrades a runtime dependency.
