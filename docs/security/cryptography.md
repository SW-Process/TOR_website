# Cryptography: Inventory and Key Management

**ASVS 5.0 requirements documented here:**
- **11.1.1 (L2):** the key management policy and key lifecycle, following NIST SP 800-57 (section 1);
- **11.1.2 (L2):** the cryptographic inventory: every key, algorithm and certificate, where each may be used and what it protects (section 2);
- **11.2.2 (L2):** how algorithms and keys can be replaced (crypto agility, section 3).

Rules that apply everywhere:
- Only Node.js's built-in `crypto` (OpenSSL), `bcrypt`, `jsonwebtoken` and Google's client libraries are used: industry-validated implementations, no home-made primitives (11.2.1). TOTP (RFC 6238) is built on `crypto.createHmac` and tested against the RFC's vectors.
- Every primitive gives at least 128 bits of security (11.2.3).
- Every non-guessable value comes from the CSPRNG (`crypto.randomBytes`, `crypto.getRandomValues`) with at least 128 bits, never `Math.random` (11.5.1). `randomUUID()` (122 bits) is used only for ids that are not secrets, such as a worker id.

## 1. Key management policy (ASVS 11.1.1)

Applies to the application's own secrets: `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `SENDGRID_API_KEY` and the MongoDB password in `MONGODB_URI`.

| Stage (NIST SP 800-57 Part 1) | Rule |
| --- | --- |
| **Generation** | Made with a CSPRNG at full strength: `openssl rand -hex 32` (256 bits) for `JWT_SECRET` and `MFA_ENCRYPTION_KEY`; the provider's own generator for the Google, SendGrid and Atlas credentials. Never chosen by hand, never reused between environments. |
| **Storage** | Production: Google **Secret Manager**, one secret per key ([gcp.md](../deployment/gcp.md)). Local development: `backend/.env`, which is git-ignored. Never in code, images, CI logs, tickets or chat. |
| **Distribution** | Secret Manager hands each secret to the Cloud Run service or job as an environment variable at start-up. No person copies production keys around. |
| **Access (no oversharing)** | Each secret's IAM grants `secretAccessor` only to the runtime service accounts that need it: the API and, where needed, the jobs, so **at most two entities** hold a shared secret. People with project Owner can manage the secret but don't use it day to day. |
| **Use** | Each key has one purpose only (section 2). The session key never encrypts; the encryption key never signs. |
| **Cryptoperiod and rotation** | `JWT_SECRET`: every 12 months, or at once if exposed. Rotating it signs every user out (sessions last at most 12 hours anyway). `MFA_ENCRYPTION_KEY`: every 24 months, or at once if exposed, with the re-encryption procedure in section 3. Provider credentials: at once if exposed, and when a team member with access leaves. |
| **Compromise** | Treat any secret seen outside Secret Manager or `.env` as compromised: rotate it, then check the security log for misuse (`authz.denied`, unusual `session.start`). |
| **Destruction** | Old Secret Manager versions are disabled at rotation and destroyed after 30 days. Local `.env` copies are deleted when a laptop leaves the project. |
| **Records** | Who rotated what and when is in Secret Manager's version history and the Cloud audit log. |

## 2. Cryptographic inventory (ASVS 11.1.2)

### 2.1 Keys and secrets

| Key | Algorithm | Size | Used for | Must **not** be used for | Where it lives |
| --- | --- | --- | --- | --- | --- |
| `JWT_SECRET` | HMAC-SHA256 (JWT HS256) | ≥ 256 bits (the server refuses fewer than 32 characters) | Signing session tokens (`aud: tor-checker-session`) and MFA-pending tokens (`aud: tor-checker-mfa`); deriving a development-only encryption key when `MFA_ENCRYPTION_KEY` is unset | Encryption; production MFA seeds; anything outside the API | Secret Manager / `.env` |
| `MFA_ENCRYPTION_KEY` | AES-256-GCM | 256 bits | Encrypting TOTP seeds at rest (`mfaSecretEnc`), with the user id as associated data | Signing; any other data | Secret Manager (required in production) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | provider | Authenticating our server to Google's token endpoint | Anything else | Secret Manager |
| `SENDGRID_API_KEY` | API key | provider | Sending password-reset and match e-mails | Anything else | Secret Manager |
| MongoDB Atlas password | SCRAM-SHA-256 | provider | The API's and jobs' database user | Human access | Secret Manager (in `MONGODB_URI`) |
| Google service-account credentials | Google-managed | provider | Cloud Storage, Vertex AI, Secret Manager, Logging | | Never downloaded: Cloud Run's metadata server issues short-lived tokens |
| TOTP seeds | HMAC-SHA1 (RFC 6238) | 160 bits | One user's authenticator codes | Anything else | `users.mfaSecretEnc`, sealed with `MFA_ENCRYPTION_KEY` |

### 2.2 Algorithms

| Purpose | Algorithm and parameters | Code |
| --- | --- | --- |
| Password storage | bcrypt, cost 12, own 128-bit salt, over base64(HMAC-SHA256(password)) with a fixed domain key; stored as `v2$…` (11.4.2) | `models/User.ts` |
| Recovery-code storage | bcrypt, cost 10, own salt (codes have 50 bits, below the 112 that would allow a plain hash, ASVS 6.5.2) | `services/mfa.ts` |
| Reset-token storage | SHA-256 of a 256-bit random token (the token has full entropy, so a plain hash is enough) | `controllers/authController.ts` |
| Session and MFA-pending tokens | JWT HS256; `alg` pinned on verify, `none` and every other algorithm refused (9.1.2); `iss`, `aud`, `use`, `exp` checked | `utils/token.ts`, `services/mfa.ts` |
| Seed encryption | AES-256-GCM, random 96-bit IV per value, 128-bit tag, associated data = user id; format `v1:iv:tag:ciphertext` (11.3.3) | `utils/secretBox.ts` |
| Dev-only key derivation | HKDF-SHA256 from `JWT_SECRET` (refused in production) | `utils/secretBox.ts` |
| One-time codes | HOTP/TOTP, HMAC-SHA1, 6 digits, 30-second step | `utils/totp.ts` |
| Google sign-in | PKCE S256 (SHA-256 of a 256-bit verifier); ID tokens RS256, verified by `google-auth-library` against Google's published keys, issuer and audience | `config/google.ts` |
| File integrity | SHA-256 of stored TOR PDFs and invitation files, for change detection | `ingestion/` |
| Breached-password lookup | SHA-1 of the password, only its first 5 hex characters sent (the k-anonymity protocol of the Pwned Passwords API; not used for any security decision on its own) | `utils/breachedPasswords.ts` |
| Comparisons of secrets | `crypto.timingSafeEqual` (reset tokens, TOTP codes); bcrypt's own constant-time compare | |

### 2.3 Random values

| Value | Source | Entropy |
| --- | --- | --- |
| Password-reset token | `randomBytes(32)` | 256 bits |
| OAuth `state` | `randomBytes(16)` | 128 bits |
| PKCE verifier, OIDC nonce | `randomBytes(32)` | 256 bits each |
| TOTP seed | `randomBytes(20)` | 160 bits |
| Recovery codes | `randomBytes`, 10 base32 characters | 50 bits each (hashed with bcrypt) |
| MFA-pending token id | `randomBytes(16)` | 128 bits (bound to the account and checked server-side) |
| AES-GCM IV | `randomBytes(12)` | 96 bits, never reused with a key in practice |
| Request id | `randomBytes(16)` | 128 bits (not a secret) |
| CSP nonce | `crypto.getRandomValues`, 16 bytes | 128 bits, fresh per page |
| Session id | MongoDB ObjectId | Not a secret: it is only accepted inside a signed token |

### 2.4 Certificates and TLS

| Connection | Who terminates TLS | Certificate |
| --- | --- | --- |
| Browser → frontend and API | Google's front end for Cloud Run | Google-managed, automatically renewed |
| API and jobs → MongoDB Atlas | Atlas (`mongodb+srv://`, TLS required) | Atlas-managed, validated by the driver |
| API and jobs → e-GP portals, Pwned Passwords | The remote server | Public CA, validated by Node.js (no `rejectUnauthorized: false` anywhere) |
| API and jobs → Google APIs, SendGrid | The provider | Public CA, validated by the client libraries |

## 3. Crypto agility (ASVS 11.2.2)

| What may need to change | How it changes |
| --- | --- |
| Password hashing | Hashes carry their scheme (`v2$` vs a bare bcrypt hash). A new scheme gets a new prefix; sign-in checks the old one and re-hashes with the new one (already done for the move to `v2`). |
| Seed encryption | Sealed values start with a version (`v1:`). A new key or algorithm gets `v2:`: `open()` reads both, `seal()` writes the new one, and a one-off script re-seals every `mfaSecretEnc` before the old key is destroyed. |
| Session signing | Changing `JWT_SECRET` or the algorithm signs everyone out once; nothing is stored that depends on it. The pinned `alg` and the `aud`/`iss` claims keep old tokens from being accepted. |
| TOTP | The algorithm, digits and period are in the `otpauth://` URI, so a stronger setting needs only a new set-up per user. |
| TLS | Managed by Google and Atlas; nothing in the application pins a version or cipher. |
| Post-quantum | The symmetric primitives (AES-256, HMAC-SHA256, SHA-256) are already PQC-safe at their sizes. The public-key parts (TLS, Google's RS256 ID tokens) belong to the platforms and will change with them. |
