# Session Management

**ASVS 5.0 requirements documented here:**
- **7.1.1 (L2):** the inactivity timeout and absolute session lifetime, and why they fit NIST SP 800-63B (section 2);
- **7.1.2 (L2):** how many sessions one account may have, and what happens at the limit (section 3);
- **7.1.3 (L2):** the federated (Google) sign-in and how its session relates to ours (section 6).

It is also the reference that ASVS 7.3.1, 7.3.2, 7.4.x, 7.5.x and 7.6.x are implemented against.

## 1. What a session is

| Part | Where | Notes |
| --- | --- | --- |
| Session row | `sessions` collection (`backend/src/models/Session.ts`) | One per sign-in: user, method (`password`/`google`), whether MFA was checked, device and IP at sign-in, `lastSeenAt`, absolute end `expiresAt`, last re-authentication `reauthAt`. |
| Session token | HttpOnly cookie `__Host-token` (production) | A JWT, HS256, with `sub` (user), `sid` (session row), `tv` (token version), `use: "session"`, `iss: tor-checker-api`, `aud: tor-checker-session`, and `exp` equal to the row's `expiresAt`. A token for any other use, issuer or audience is refused (ASVS 9.2.2, 9.2.3). |
| Token version | `users.tokenVersion` | Bumped to sign out every session of an account at once. |

A request is signed in only while **all** of these hold: the token verifies; its session row exists, belongs to the user, is before `expiresAt` and was used within the inactivity timeout; and the user's `tokenVersion` matches the token. The role always comes from the database, so a role change applies on the next request (ASVS 8.3.2).

## 2. Timeouts (ASVS 7.1.1, 7.3.1, 7.3.2)

| Limit | Value | Setting | What happens |
| --- | --- | --- | --- |
| **Inactivity timeout** | **30 minutes** without a request | `SESSION_IDLE_TIMEOUT_MINUTES` | The next request answers `401 session_invalid` and the session row is deleted, so it can't come back. The frontend clears the user and sends them to `/login`. |
| **Absolute lifetime** | **12 hours** after sign-in | `SESSION_MAX_HOURS` | The token and its cookie expire, and a TTL index removes the row. Re-issuing the cookie (e.g. after a password change) never extends it. |
| Pending MFA step | 5 minutes | fixed | See [authentication-defenses.md §9.2](authentication-defenses.md#92-sign-in-with-a-code). |
| Re-authentication window | 10 minutes | fixed | Section 5. |

**Why these values.** NIST SP 800-63B (rev. 3, §4.2.3) requires AAL2 sessions to re-authenticate at least every 12 hours and after 30 minutes of inactivity. TOR Checker treats every session at AAL2, including password-only vendor sessions, because the same values cost a vendor little (a working day fits inside 12 hours) and an admin session holds the whole site's data. There is no deviation from NIST to justify.

**What counts as activity.** Any request the user makes. Requests the frontend makes on a timer (chat polling, run-status polling) are sent with `X-Background-Request: 1` when there has been no keyboard, mouse or touch input in the last minute, and those don't refresh `lastSeenAt`. Otherwise an unattended open tab would never time out. `lastSeenAt` is written at most once a minute, which is also the timeout's precision.

## 3. Concurrent sessions (ASVS 7.1.2)

- **At most 10 sessions per account** (`MAX_SESSIONS_PER_USER` in `services/sessions.ts`).
- Signing in on an 11th device **ends the least recently used session**. The new sign-in always succeeds, so nobody is locked out by a forgotten device, and an attacker can't block the owner by filling the slots.
- The ended session is logged as `session.evicted`.
- Users see every session under *Account settings → อุปกรณ์ที่เข้าสู่ระบบ*, with device, browser, IP, sign-in method and last use.

## 4. Ending sessions (ASVS 7.4)

| Who | How | Effect |
| --- | --- | --- |
| The user, this device | *ออกจากระบบ* in the header menu, the settings menu or the admin top bar, on every signed-in page (7.4.4) | Row deleted, cookie cleared. |
| The user, another device | *อุปกรณ์ที่เข้าสู่ระบบ → ออกจากระบบ* next to it (7.5.2, needs re-authentication) | That row deleted. |
| The user, every other device | *ออกจากระบบอุปกรณ์อื่นทั้งหมด* (needs re-authentication) | Token version bumped, every other row deleted, this cookie re-issued. |
| Automatically, after a password change or reset | Always (7.4.3) | Every other session ends; a reset ends all of them. |
| Offered after an MFA change | After MFA is switched on, the page offers to sign out the other devices (7.4.3) | As above. |
| An admin, one user | *Admin → ความปลอดภัย → ออกจากระบบทุกอุปกรณ์* (`POST /api/admin/users/:id/sessions/revoke`) (7.4.5) | That user's token version bumped and rows deleted. Logged as `session.revoke_user`. |
| An admin, everyone | *ออกจากระบบทุกคน* (`POST /api/admin/sessions/revoke-all`, needs re-authentication) (7.4.5) | Every row except the admin's own deleted. Logged as `session.revoke_all`. |
| An operator, for a lost second factor | `npm run reset-mfa` | All of that user's sessions end. |

## 5. Re-authentication (ASVS 7.5.1, 7.5.2)

These changes need the user to confirm it's them:

- changing the e-mail or password (the current password is always needed for a password change, ASVS 6.2.3);
- setting up or switching off two-step verification, or replacing the recovery codes;
- linking or unlinking Google;
- signing another device, or every other device, out;
- deleting the account;
- an admin signing everyone out.

A request passes when either:
- it carries **every factor the account has**: the current password if it has one, and a current authenticator code if MFA is on (`currentPassword`, `mfaCode`); or
- the session authenticated fully **within the last 10 minutes**: it signed in that recently, or the user confirmed their factors on `POST /api/auth/reauth`.

Otherwise the API answers `401` with `code: "reauth_required"` and the factors it wants. The frontend's *ยืนยันว่าเป็นคุณ* dialog asks for them, posts them to `/api/auth/reauth`, and repeats the original request. A Google-only account without MFA has nothing to type in, so it re-authenticates by signing in with Google again. This 401 is not a lost session: the session stays valid.

## 6. Federated sign-in with Google (ASVS 7.1.3, 7.6.1)

| Question | Answer |
| --- | --- |
| Which systems create sessions? | Only the TOR Checker API. Google is used to identify the user once, at sign-in; we keep no Google tokens. |
| Does our session depend on Google's? | No. Signing out of Google doesn't end a TOR Checker session, and ending ours doesn't touch Google's. Our session follows our own limits (section 2), whatever Google's are. |
| When must the user go back to Google? | At every new sign-in, when our session times out or is ended, and for re-authentication of a Google-only account (section 5). `prompt=select_account` makes Google show the account chooser each time. |
| Can a session start without the user? | No (7.6.2). Only an explicit sign-in creates one: submitting the login form, or clicking *เข้าสู่ระบบด้วย Google*. The callback creates a session only with a matching state, PKCE verifier and nonce from the same browser. |
| Single logout across systems? | Not supported or needed: there is no other relying party sharing our sessions. |

## 7. Code and tests

| Part | File |
| --- | --- |
| Token claims, lifetimes, cookie options | `backend/src/utils/token.ts` |
| Session check, inactivity timeout, admin MFA gate | `backend/src/middleware/auth.ts` |
| Starting and ending sessions, the 10-session cap | `backend/src/services/sessions.ts` |
| Re-authentication | `backend/src/services/reauth.ts`, `POST/GET /api/auth/reauth` |
| Admin session controls | `backend/src/controllers/adminSessionController.ts`, `frontend/src/components/admin/SecurityControls.tsx` |
| Frontend: expiry and background requests | `frontend/src/lib/api.ts`, `frontend/src/lib/useAuth.ts` |
| Frontend: re-authentication dialog | `frontend/src/components/ReauthDialog.tsx`, `frontend/src/lib/reauth.ts` |

| Test file | What it proves |
| --- | --- |
| `src/__tests__/sessions.test.ts` | 30-minute idle end (and deletion), activity keeps a session alive, background polling doesn't, the 12-hour end, a re-issued cookie never extends a session, the 10-session cap, tokens without the right claims are refused. |
| `src/__tests__/reauth.test.ts` | Fresh sessions pass; older ones get `reauth_required`; `/reauth` opens a 10-minute window; inline factors work; Google-only accounts are sent back to Google; Google linking is guarded. |
| `src/__tests__/adminSessions.test.ts` | An admin signs one user, or everyone else, out; signing everyone out needs re-authentication; vendors can't. |
| `src/utils/__tests__/token.test.ts` | HS256 only; issuer, audience, purpose and session id are present; the token expires with its row. |
