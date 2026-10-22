# Authentication: Sign-in Defenses, Pathways and Two-step Verification

**ASVS 5.0 requirements documented here:**
- **6.1.1 (L1):** how rate limiting and anti-automation defend against credential stuffing and brute force, and how malicious lockout is prevented (sections 1–4);
- **6.1.2 (L2):** the list of context-specific words refused in passwords (section 5.2);
- **6.1.3 (L2):** every authentication pathway, with its controls and strength (section 8);
- **6.4.4 (L2):** what happens when a second factor is lost (section 9.4);
- **6.8.4 (L2):** the fallback when the identity provider doesn't say how strongly it authenticated (section 8.3).

It is also the reference that ASVS 6.3.1, 6.2.11, 6.3.3 and 6.3.4 are implemented against.

## 1. Threats

| Threat | What the attacker does | Where |
| --- | --- | --- |
| Password brute force | Tries many passwords against one account. | `POST /api/auth/login` |
| Password spraying | Tries a few common passwords against many accounts. | `POST /api/auth/login` |
| Credential stuffing | Replays email/password pairs leaked from other sites. | `POST /api/auth/login` |
| Re-authentication guessing | With a stolen session, guesses the current password to change the password or email, or to delete the account. | `PUT /api/auth/password`, `PUT /api/auth/email`, `DELETE /api/auth/me`, `POST /api/auth/reauth` |
| Code guessing | With a stolen password, guesses the 6-digit authenticator code. | `POST /api/auth/mfa/verify` |
| Reset abuse | Floods a victim's inbox with reset emails, or guesses reset tokens. | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| Mass sign-up | Creates many accounts automatically. | `POST /api/auth/register` |
| **Malicious lockout** | Fails logins on purpose so the real owner gets locked out. | Any control that locks an account |

## 2. Controls at a glance

| Control | What it stops | Where in the code |
| --- | --- | --- |
| Rate limiting per IP and per IP + email | Brute force, spraying, stuffing, reset abuse, mass sign-up | `backend/src/middleware/rateLimit.ts`, `rateLimits.ts`, `routes/authRoutes.ts` |
| **No account lockout** | Malicious lockout | Limits never key on the account alone (section 4) |
| Common password list | Spraying and stuffing with popular passwords | `backend/src/utils/passwordPolicy.ts`, `config/commonPasswords.ts` |
| Context-word list and breached-password check | Guessable site-specific passwords; passwords leaked elsewhere | `config/contextWords.ts`, `utils/breachedPasswords.ts` |
| Two-step verification (TOTP) | A stolen or guessed password alone | `services/mfa.ts`, `controllers/mfaController.ts`; required for admins |
| Slow password hashing | Offline cracking if the database leaks | bcrypt, cost factor 12, over an HMAC-SHA256 pre-hash (`models/User.ts`) |
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
| `PUT /api/auth/password`, `PUT /api/auth/email`, `DELETE /api/auth/me`, `POST /api/auth/reauth`, `/api/auth/mfa/*` set-up, `POST /api/auth/logout-others`, `DELETE /api/auth/sessions/:id`, `DELETE /api/auth/google` | 10 requests per 15 minutes | client IP |
| `POST /api/auth/mfa/verify` | **10 requests per 15 minutes** | the pending sign-in's account |
| `POST /api/auth/mfa/verify` | 30 requests per 15 minutes | client IP |
| `POST /api/chat/messages` | 30 requests per 5 minutes | signed-in account |
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

## 5. Password rules

Applied wherever a password is chosen (register, reset, change, `npm run create-admin`), never on sign-in. No composition rules (ASVS 6.2.5) and no forced rotation (6.2.10).

### 5.1 The checks, in order

| Check | Rule | ASVS |
| --- | --- | --- |
| Length | 8 to **128** characters, any script (Thai included) | 6.2.1, 6.2.9 |
| Common passwords | Not among the 3,000 most common passwords of 8+ characters (NCSC "100k most used passwords" list) | 6.2.4 |
| Context words | Not built only from the words in 5.2, and not containing the user's own e-mail name or display name (4+ letters) | 6.2.11 |
| Breached passwords | Not in Have I Been Pwned's Pwned Passwords (5.3) | 6.2.12 |

### 5.2 Context-specific words (ASVS 6.1.2)

Kept in `backend/src/config/contextWords.ts`:

| Group | Words |
| --- | --- |
| The product | tor, torchecker, checker, aggregator, fairness |
| City and agency | bangkok, bkk, krungthep, bma, kasetsart, ku, กรุงเทพ, กรุงเทพมหานคร, กทม |
| Procurement systems and words | egp, gprocurement, procurement, process, bidding, ebidding, จัดซื้อจัดจ้าง, จัดซื้อ, ประกวดราคา |
| Roles and account words | vendor, admin, administrator, user, login, welcome, secret, password, pass, รหัสผ่าน, รหัส |

How the check works:
- The password is lowercased and reduced to its letters (Thai vowels and tone marks count as letters). Digits and symbols are padding, so `TorChecker2026!` reduces to `torchecker`.
- It is also checked with common digit swaps undone (`0→o`, `1→i`, `3→e`, `4/@→a`, `5/$→s`, `7→t`), so `t0rch3ck3r` reduces to `torchecker`.
- It is refused if the result is **nothing but** these words run together, e.g. `bangkok-procurement` or `Password-Bangkok`.
- A password that merely contains such a word among others is fine: `my tor checker is on a blue bicycle` passes.
- It is also refused if it contains the user's e-mail name or display name of 4+ letters, e.g. `kobkab-2026-x` for `kobkab@gmail.com`.

### 5.3 Breached-password check (ASVS 6.2.12)

`backend/src/utils/breachedPasswords.ts` asks the Pwned Passwords range API with k-anonymity:
1. The password's SHA-1 is computed on our server.
2. Only its first 5 hex characters are sent: `GET https://api.pwnedpasswords.com/range/ABCDE`, with `Add-Padding: true`, so every answer has the same size.
3. The service returns every hash suffix with that prefix, and the match is made on our server.

Neither the password nor its full hash nor anything about the user leaves the server. The call goes through the outbound allowlist and times out after 3 seconds. If the service is unreachable, the password is accepted ("fail open"), the failure is logged as `dependency.unavailable`, and the other three checks still apply: an outage elsewhere shouldn't stop anyone signing up. `BREACHED_PASSWORD_CHECK=false` turns the check off (only the test suite does).

### 5.4 Storage

| Item | Behaviour |
| --- | --- |
| Hash | bcrypt, cost 12, own salt, over the base64 HMAC-SHA256 of the password. bcrypt reads only 72 bytes; the 44-byte pre-hash lets every allowed password count in full. The fixed HMAC key keeps our pre-hashes distinct from plain SHA-256 dumps ("hash shucking"). |
| Format | Stored as `v2$<bcrypt hash>`. A bare `$2b$…` hash is from before pre-hashing: it is still checked (refusing candidates over 72 bytes, so nothing is truncated), and replaced with a `v2` hash at the next successful sign-in. |

## 6. Other credential protections

| Area | Behaviour |
| --- | --- |
| Login errors | Wrong email and wrong password both answer `401 "Invalid email or password"`. |
| Forgot password | Always answers `200 "If that email has an account, a reset link is on its way"`, whether or not the email exists. At most one email per account per 60 seconds. |
| Reset token | 32 random bytes from `crypto.randomBytes`, sent in the link's `#fragment` (never reaches a server log), stored only as SHA-256, valid for 1 hour, cleared after use. |
| Reset and MFA | A reset only sets the password: it never signs the user in, so the next sign-in still asks for the authenticator code (6.4.3). |
| After a reset or password change | All other sessions are signed out (`tokenVersion` and session rows). |
| Admin accounts | Created only with `npm run create-admin` (no default admin, no admin sign-up), using the same password policy. They must set up two-step verification before the admin panel opens (section 9.3). |
| Account e-mail and authentication factors | Changing the e-mail, the password or MFA settings, linking or unlinking Google, and signing devices out need a fresh re-authentication; see [session-management.md](session-management.md#5-re-authentication). |

## 7. Verification

Automated tests (`npm test` in `backend/`):

| Test file | What it proves |
| --- | --- |
| `src/middleware/__tests__/rateLimit.test.ts` | Up to `max` requests pass, then `429` with `Retry-After`; keys are counted separately; a new window starts after the old one ends; the switch works. |
| `src/__tests__/loginRateLimit.test.ts` | The 11th wrong password for one email within 15 minutes gets `429`; the same IP can still try another account. |
| `src/utils/__tests__/passwordPolicy.test.ts` | Length (64-character Thai passwords pass, 129 characters don't), common passwords, context words with padding and digit swaps, the user's own name, and the breach check (only 5 hash characters sent, padding ignored, fail open). |
| `src/__tests__/passwordPolicyRoutes.test.ts` | The rules on the routes; a 64-character Thai password signs in, and one differing after 72 bytes doesn't; a legacy hash is upgraded at sign-in. |
| `src/__tests__/passwordReset.test.ts` | Reset links are single use, expire, and sign out every session. |
| `src/utils/__tests__/totp.test.ts` | The RFC 6238 test vectors; only the current 30-second step is accepted; AES-GCM sealing detects tampering. |
| `src/__tests__/mfa.test.ts` | Set-up, the code step at sign-in, single-use codes and recovery codes, the 5-minute and 5-wrong-codes limits on the pending step, resets don't bypass MFA, and admins need it. |

Manual checks:
- Enter a wrong password 11 times for the same email; the 11th attempt shows *"ลองหลายครั้งเกินไป"*.
- Set up two-step verification with Google Authenticator, sign out, sign in: the code page appears after the password.

## 8. Authentication pathways (ASVS 6.1.3, 6.3.4)

Every way into an account. There are no others: no API keys, no "magic links", no SMS, no admin impersonation, and no pre-session cookie format is accepted any more (session tokens must carry a session id, issuer and audience).

### 8.1 Pathways

| # | Pathway | Factors | Controls | Strength |
| :-: | --- | --- | --- | --- |
| 1 | E-mail + password (`POST /api/auth/login`) | Password | Rate limits (3.1), password rules (5), generic errors | Single factor |
| 2 | E-mail + password + code (`/login`, then `POST /api/auth/mfa/verify`) | Password **and** TOTP or recovery code | All of 1, plus the pending-step limits (9.2) | **Multi-factor** |
| 3 | Google (`GET /api/auth/google` → `/callback`) | Google account | State, PKCE and nonce checks, verified e-mail only, ID token signature and audience checked | Single factor as far as we know (8.3) |
| 4 | Google + code | Google account **and** TOTP or recovery code | All of 3, plus the pending-step limits | **Multi-factor** |
| 5 | Password reset (`forgot-password` → `reset-password`) | Access to the e-mail inbox | Single-use 256-bit token, 1 hour, cooldown, rate limits | Recovery only: it sets a password and **never signs in** |
| 6 | Operator reset of a lost second factor (`npm run reset-mfa`) | Identity check by staff (9.4) | Needs database access; logged; ends every session | Recovery only |

Rules that apply to every pathway:
- A session is only created by pathways 1–4, each by an explicit user action (7.6.2).
- If the account has MFA on, pathways 1 and 3 stop after the first factor and continue only through 2 or 4. Nothing skips the code.
- Admins can sign in with pathway 1 or 3, but the admin API refuses their session until it has been through 2 or 4 (section 9.3).

### 8.2 Account linking between pathways (ASVS 6.8.1)

- A Google sign-in is matched by Google's `sub` claim (`googleOAuthId`), never by e-mail alone.
- A Google account whose e-mail matches an existing password account is linked only when Google says the e-mail is verified (`email_verified`).
- Linking Google from the settings page needs a fresh re-authentication, and one Google account can back only one user.

### 8.3 Strength reported by the identity provider (ASVS 6.8.4)

Google's ID tokens for consumer accounts don't reliably carry `acr`/`amr`, so we can't tell whether the user passed Google's own 2-step verification. **Fallback: a Google sign-in counts as single-factor.** Where we need more (the admin panel, an account with our MFA on), our own TOTP step is required after Google as well.

## 9. Two-step verification (ASVS 6.3.3, 6.5)

### 9.1 Set-up

1. *Account settings → ยืนยันตัวตนสองขั้นตอน → เปิดใช้งาน* (needs a fresh re-authentication).
2. The server makes a 160-bit seed from the CSPRNG (6.5.3), seals it with AES-256-GCM (`MFA_ENCRYPTION_KEY`) and shows it once, as a QR code and as text.
3. The user types a code from the app. Only then is MFA switched on, and that code counts as used.
4. Ten recovery codes are shown once (`XXXXX-XXXXX`, 50 bits each from the CSPRNG). They are stored as bcrypt hashes with their own salt (6.5.2), each usable once (6.5.1).
5. The page offers to sign out every other device (7.4.3). This device's session counts as MFA-verified.

### 9.2 Sign-in with a code

| Rule | Value | ASVS |
| --- | --- | --- |
| Code | 6 digits, HMAC-SHA1, 30-second steps (RFC 6238, works with any authenticator app) | 6.5.4 |
| Lifetime | Only the **current** 30-second step is accepted, no earlier or later window | 6.5.5 |
| Single use | The last accepted step is stored; a code for that step or an earlier one is refused, atomically | 6.5.1 |
| Pending step | After the password (or Google), a `mfa_pending` cookie: HttpOnly, `__Host-` in production, a signed token with its own audience, **5 minutes**, bound to that one attempt by a stored id, usable once | 6.6.2 |
| Guessing | 5 wrong codes end the pending step (the password must be entered again); 10 tries per account and 30 per IP per 15 minutes | 6.3.1 |
| Recovery code | Accepted in place of the app's code; using one is logged | 6.5.1 |

### 9.3 Admins

Admins must use two-step verification (`ADMIN_MFA_REQUIRED`, on by default):
- The admin and ingestion APIs answer `403 mfa_required` unless the session passed the code step (or set up MFA in that session).
- The admin panel then explains what to do: set up MFA, or sign in again with a code.
- Admins can't switch MFA off.

Vendors can turn it on and are encouraged to. **Rationale for not forcing it on vendors (ASVS 6.3.3 allows a documented relaxation):** vendor accounts hold only the vendor's own business profile, bookmarks and notes, and no other user's data; the mitigating controls are the password rules of section 5 (breached and guessable passwords refused), the rate limits, the 30-minute idle and 12-hour absolute session limits, and re-authentication before any change to the account's factors.

### 9.4 A lost second factor (ASVS 6.4.4)

- **Lost phone, codes kept:** sign in with a recovery code, then set MFA up again on the new phone (or replace the codes).
- **Lost both:** the user contacts support through the help center. Before anything is reset, staff check identity at least as strongly as at set-up, which needed the password plus control of the account:
  1. the request must come from the account's own e-mail address, and the user answers a confirmation mail sent to that address;
  2. the user also confirms details only the account holder knows (company name and the most recent bookmarked TOR on the profile);
  3. for an admin account, a second admin confirms by phone or in person.
- An operator with database access then runs `npm run reset-mfa -- <email> "<ticket number>"`. It turns MFA off, signs out every device, and writes `auth.mfa_reset_by_operator` to the security log with the ticket number. The web app has no way to do this.

## 10. Limits and future work

| Gap | ASVS | Plan |
| --- | --- | --- |
| Counters live in each server instance's memory. With several Cloud Run instances, an attacker gets the limit once per instance, and counters reset on restart. | 6.3.1 | Acceptable at our scale (backend runs with few instances). Move counters to MongoDB or Redis if we scale out. |
| MFA is optional for vendors. | 6.3.3 | Documented relaxation (9.3). |
| No phishing-resistant hardware factor (FIDO2 / passkeys). | 6.3.3 (L3) | Not planned. |
| Users aren't notified of suspicious sign-ins. | 6.3.5 (L3) | Not planned. |
| Registration reveals whether an email is already used (`409`). | 6.3.8 (L3) | Not planned. |
