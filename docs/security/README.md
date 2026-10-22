# Security Documentation

TOR Checker follows the [OWASP Application Security Verification Standard (ASVS) 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en), targeting all of Level 1 and parts of Level 2.

## Documents

| Document | ASVS requirement | What it defines |
| --- | --- | --- |
| [Input validation rules](input-validation.md) | 2.1.1 (L1) | The rule every input field must pass, endpoint by endpoint |
| [Sign-in defenses](authentication-defenses.md) | 6.1.1 (L1), 6.3.1 (L1) | Rate limits against brute force and credential stuffing, and how malicious account lockout is prevented |
| [Authorization rules](authorization.md) | 8.1.1 (L1) | Roles, which role may call each endpoint, and whose data it may touch |
| [Third-party component policy](dependency-management.md) | 15.1.1 (L1), 15.2.1 (L1) | Dependency inventory, remediation time frames by severity, and the update process |

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
