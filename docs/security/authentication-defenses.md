# Defending Sign-in Against Brute Force and Credential Stuffing

**ASVS 5.0 requirement:** 6.1.1 (Level 1): *"Verify that application documentation defines how controls such as rate limiting, anti-automation, and adaptive response, are used to defend against attacks such as credential stuffing and password brute force. The documentation must make clear how these controls are configured and prevent malicious account lockout."*

This document is also the reference for ASVS 6.3.1 (the controls are implemented as documented here).

## 1. Threats

| Threat | What the attacker does | Where |
| --- | --- | --- |
| Password brute force | Tries many passwords against one account. | `POST /api/auth/login` |
| Password spraying | Tries a few common passwords against many accounts. | `POST /api/auth/login` |
| Credential stuffing | Replays email/password pairs leaked from other sites. | `POST /api/auth/login` |
| Re-authentication guessing | With a stolen session, guesses the current password to change the password or email, or to delete the account. | `PUT /api/auth/password`, `PUT /api/auth/email`, `DELETE /api/auth/me` |
| Reset abuse | Floods a victim's inbox with reset emails, or guesses reset tokens. | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Mass sign-up | Creates many accounts automatically. | `POST /api/auth/register` |
| **Malicious lockout** | Fails logins on purpose so the real owner gets locked out. | Any control that locks an account |

## 2. Controls at a glance

| Control | What it stops | Where in the code |
| --- | --- | --- |
| Rate limiting per IP and per IP + email | Brute force, spraying, stuffing, reset abuse, mass sign-up | `backend/src/middleware/rateLimit.ts`, `rateLimits.ts`, `routes/authRoutes.ts` |
| **No account lockout** | Malicious lockout | Limits never key on the account alone (section 4) |
| Common password list | Spraying and stuffing with popular passwords | `backend/src/utils/passwordPolicy.ts`, `config/commonPasswords.ts` |
| Slow password hashing | Offline cracking if the database leaks | bcrypt, cost factor 12 (`models/User.ts`) |
| Generic login error | Finding out which emails have accounts | `"Invalid email or password"` for both cases |
| Reset email cooldown | Inbox flooding | One email per account per 60 seconds (`authController.ts`) |
| Strong, hashed reset tokens | Guessing reset links | 256-bit random token, only its SHA-256 stored, 1-hour lifetime, single use, constant-time compare |
| Sign out everywhere on reset or password change | Keeping access after the owner reacts | `tokenVersion` bump and session rows deleted |
| Google sign-in | Password attacks on users who choose it | No password exists; Google applies its own protections |

## 3. Rate limits

### 3.1 Configured limits

Defined in `backend/src/middleware/rateLimits.ts`.

| Route | Limit | Counted by |
| --- | --- | --- |
| `POST /api/auth/login` | **10 requests per 15 minutes** | client IP + submitted email |
| `POST /api/auth/login` | **50 requests per 15 minutes** | client IP |
| `POST /api/auth/register` | 10 requests per hour | client IP |
| `POST /api/auth/forgot-password` | 5 requests per hour | client IP + submitted email |
| `POST /api/auth/forgot-password` | 20 requests per hour | client IP |
| `POST /api/auth/reset-password` | 10 requests per 15 minutes | client IP |
| `PUT /api/auth/password`, `PUT /api/auth/email`, `DELETE /api/auth/me` | 10 requests per 15 minutes | client IP |
| `POST /api/tors/:id/report` | 10 requests per hour | client IP |
| `POST /api/tors/:id/view` | 60 requests per minute | client IP |

Why two limits on login:
- The **IP + email** limit (10) stops brute force on one account: 10 guesses per 15 minutes is about 960 guesses a day, which is useless against any password that passes our policy.
- The **IP** limit (50) stops one machine from spraying or stuffing across many accounts: it can try at most 50 email/password pairs per 15 minutes.

### 3.2 How the limiter behaves

- **Fixed window, in memory.** Each limiter keeps a counter per key that resets when its window ends. Finished windows are swept out, so memory stays bounded.
- **Every attempt counts**, successful or not, and the count starts before the password is checked. This means the limiter itself never reveals whether a guess was right.
- **When the limit is exceeded**, the API answers `429 Too Many Requests` with:
  - `Retry-After`: seconds until the window resets;
  - `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`;
  - body `{ "message": "Too many attempts. Please wait a few minutes and try again." }`.
  The frontend shows *"ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่"*.
- **Order on login:** the IP limit is checked first, then the IP + email limit, then the password.

### 3.3 Configuration

| Setting | Effect |
| --- | --- |
| `RATE_LIMIT_ENABLED` | `true` or `false` forces the limits on or off. Unset means on everywhere except under Jest (`NODE_ENV=test`), where test suites log in hundreds of times. Only switch it off for a load test, never in production. |
| `TRUST_PROXY` | **Required in production.** Tells Express how many proxies sit in front of the app, so `req.ip` is the real client IP from `X-Forwarded-For`. See 3.4. |
| Limit values | Changed in `rateLimits.ts` (code review required). |

### 3.4 Client IP behind Cloud Run (important)

The limits count by `req.ip`. On Cloud Run the TCP connection comes from Google's front end, not from the user. If `TRUST_PROXY` is not set:
- every user appears to share a handful of Google IPs;
- the IP limits become **site-wide**, so 50 login attempts from all users together in 15 minutes would block everyone.

Set `TRUST_PROXY` to the number of proxies in front of the backend:

| Deployment | `TRUST_PROXY` |
| --- | --- |
| Local `docker compose` or `npm run dev` | blank (no proxy) |
| Cloud Run on its default `*.run.app` URL | `1` |
| Cloud Run behind an external HTTPS load balancer | `2` |

Never use `true`: it trusts any `X-Forwarded-For` value a client sends, so an attacker could pick a new fake IP for every request and bypass the limits.

**How to check after deploying:** sign in, then open *Account settings → Devices (อุปกรณ์ที่เข้าสู่ระบบ)*. The IP shown for the current device must be your own public IP, not a Google address.

## 4. Preventing malicious account lockout

The app **never locks an account**, and no limit is keyed on the account (email) alone:

- An attacker who fails logins for `victim@example.com` only fills the counter for **their own IP + that email**.
- The real owner signs in from a different IP, with a fresh counter, and is not affected.
- Even the IP + email counter is temporary (15 minutes) and clears itself; there is nothing for an admin to unlock.

Trade-off: an attacker with many IPs (a botnet) gets 10 guesses per IP per 15 minutes per account. This is accepted for Level 1, because:
- the password policy refuses the 3,000 most common passwords, which is what such attacks try first;
- each guess still costs the attacker a bcrypt comparison round trip on our side;
- a per-account lockout would hand that same attacker an easy way to lock out any user.

Known edge case: users who share one public IP (a university network or office NAT) share the 50-per-15-minutes IP limit for login. That is enough for normal use; if it ever isn't, raise the IP limit rather than switching to per-account locking.

## 5. Other credential protections

| Area | Behaviour |
| --- | --- |
| Password policy | At least 8 characters, at most 72 bytes, not among the 3,000 most common passwords (from the NCSC "100k most used passwords" list, keeping entries of 8+ characters). No composition rules. Applied on register, reset, change and admin creation. |
| Password storage | bcrypt with cost factor 12 and a per-password salt. Passwords over 72 bytes are refused, so bcrypt never silently truncates one. |
| Login errors | Wrong email and wrong password both answer `401 "Invalid email or password"`. |
| Forgot password | Always answers `200 "If that email has an account, a reset link is on its way"`, whether or not the email exists. At most one email per account per 60 seconds. |
| Reset token | 32 random bytes from `crypto.randomBytes`, sent in the link's `#fragment` (never reaches a server log), stored only as SHA-256, valid for 1 hour, cleared after use. |
| After a reset or password change | All other sessions are signed out (`tokenVersion` and session rows). |
| Admin accounts | Created only with `npm run create-admin` (no default admin, no admin sign-up), using the same password policy. |

## 6. Verification

Automated tests (`npm test` in `backend/`):

| Test file | What it proves |
| --- | --- |
| `src/middleware/__tests__/rateLimit.test.ts` | Up to `max` requests pass, then `429` with `Retry-After`; keys are counted separately; a new window starts after the old one ends; the switch works. |
| `src/__tests__/loginRateLimit.test.ts` | The 11th wrong password for one email within 15 minutes gets `429`; the same IP can still try another account. |
| `src/utils/__tests__/passwordPolicy.test.ts` | Common, short and over-long passwords are refused; any composition is allowed. |
| `src/__tests__/passwordPolicyRoutes.test.ts` | The policy is applied on register and password change; a password longer than 72 bytes can't log in to a 72-byte one. |
| `src/__tests__/passwordReset.test.ts` | Reset links are single use, expire, and sign out every session. |

Manual check: enter a wrong password 11 times for the same email; the 11th attempt shows *"ลองหลายครั้งเกินไป"*.

## 7. Limits and future work

| Gap | ASVS | Plan |
| --- | --- | --- |
| Counters live in each server instance's memory. With several Cloud Run instances, an attacker gets the limit once per instance, and counters reset on restart. | 6.3.1 | Acceptable at our scale (backend runs with few instances). Move counters to MongoDB or Redis if we scale out. |
| No multi-factor authentication. | 6.3.3 (L2) | Planned as an advanced feature (email OTP). |
| Failed logins are not yet written to the security log. | 16.3.1 (L2) | Planned with security event logging. |
| Users aren't notified of suspicious sign-ins. | 6.3.5 (L3) | Not planned. |
| Registration reveals whether an email is already used (`409`). | 6.3.8 (L3) | Not planned for Level 1. |
