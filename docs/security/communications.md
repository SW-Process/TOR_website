# Communications and Outbound Connections

**ASVS 5.0 requirements documented here:**
- **13.1.1 (L2):** every communication the application needs, including the external services it relies on and whether a user can make it connect somewhere (sections 1–2);
- **13.2.4 / 13.2.5 (L2):** the allowlist of external systems it may contact, and where it is enforced (section 3).

It also records how ASVS 12.3.x (TLS everywhere) and 13.2.x (service authentication) are met.

## 1. Inbound

| From | To | Protocol | Authentication |
| --- | --- | --- | --- |
| Browsers | Frontend (Next.js on Cloud Run) | HTTPS (TLS by Google's front end, HSTS 1 year) | None for public pages; the API decides |
| Browsers | API (Express on Cloud Run) | HTTPS, CORS for `CLIENT_ORIGIN` only | Session cookie (`__Host-token`) |
| Admin Chrome extension | API `POST /api/ingestion/capture` only | HTTPS | The admin's session cookie |
| Cloud Scheduler | Cloud Run jobs (discovery, enrichment, lifecycle, stalled-runs) | Google API, OAuth | Scheduler's service account with `run.invoker` |
| Frontend server (rendering) | API (`INTERNAL_API_BASE_URL`) | HTTPS between Cloud Run services | Public read endpoints only |

Plain HTTP is never served: Cloud Run accepts only HTTPS on its `*.run.app` URLs (it redirects HTTP to HTTPS for the browser) and every response carries HSTS, so browsers don't try HTTP again (ASVS 4.1.2, see section 5).

## 2. Outbound (ASVS 13.1.1)

| Destination | Host | Who calls it | Why | Protocol | Authentication |
| --- | --- | --- | --- | --- | --- |
| BMA e-GP API and files | `egp2.bangkok.go.th` (`EGP_API_BASE`, `EGP_FILE_BASE`) | Discovery and lifecycle jobs | TOR listings, announcements and PDFs | HTTPS | None (public API) |
| National e-GP | `process5.gprocurement.go.th` (`GPROC_BASE_URL`) | Lifecycle job, capture, enrichment chain | Procurement stage, invitation PDFs, hearing dates | HTTPS | None (public API) |
| Gemini on Vertex AI | `*-aiplatform.googleapis.com` | Enrichment and lifecycle jobs | Summaries, classification, fairness signals, bid deadlines | HTTPS (Google client library) | Service-account token from the metadata server |
| Cloud Storage | `storage.googleapis.com` | API and jobs | TOR PDFs, avatars | HTTPS (client library) | Service-account token |
| Secret Manager | `secretmanager.googleapis.com` | Cloud Run at start-up | Secrets | HTTPS | Service-account token |
| Cloud Logging | via stdout | Cloud Run | Logs | Platform | Platform |
| MongoDB Atlas | `*.mongodb.net` | API and jobs | All application data | MongoDB wire protocol over TLS | Database user and password (SCRAM-SHA-256) |
| Google OAuth | `oauth2.googleapis.com`, `www.googleapis.com` | API | Code-for-token exchange, Google's signing keys | HTTPS (client library) | OAuth client id and secret, plus PKCE |
| SendGrid | `api.sendgrid.com` | API, enrichment job | Password-reset and match-digest e-mails | HTTPS (client library) | API key |
| Pwned Passwords | `api.pwnedpasswords.com` | API | Breached-password check (k-anonymity: 5 hash characters) | HTTPS | None |

**Can a user make the server connect somewhere?** No. No request field is ever used as a URL or host:
- e-GP addresses are built from the configured bases and identifiers returned by e-GP itself, with path parts percent-encoded;
- the admin capture route takes project numbers, not URLs;
- avatars and PDFs are fetched from our own storage by keys we build.
The allowlist below makes sure this stays true even if an upstream response is hostile.

## 3. The outbound allowlist (ASVS 13.2.4, 13.2.5, 1.3.6, 15.3.2)

Enforced in code for the outbound HTTP calls the application makes itself (`backend/src/utils/outbound.ts`):

| Rule | Detail |
| --- | --- |
| Hosts | Each client may call **only its own configured hosts**: the e-GP client the hosts of `EGP_API_BASE` and `EGP_FILE_BASE`; the national e-GP client the host of `GPROC_BASE_URL`; the breached-password check `api.pwnedpasswords.com`. Only an operator can change these (they are environment variables). |
| Scheme | `https:` only. Plain `http:` only to `localhost` outside production (local mocks). |
| Credentials in URLs | Refused (`https://user:pass@…`). |
| Redirects | Never followed automatically (`redirect: "manual"`). A redirect is followed by hand, at most 3 times, and only if its target passes the same checks. A redirect to anywhere else, e.g. the cloud metadata server `169.254.169.254`, is refused and logged as `outbound.blocked`. |
| Methods on redirect | 307 and 308 keep the method and body; others become a plain GET. |
| Timeouts and size | e-GP calls time out (`EGP_TIMEOUT_MS`, `GPROC_TIMEOUT_MS`), retry with backoff, and downloads stop at `EGP_MAX_FILE_BYTES` (50 MB). The breached-password call times out after 3 seconds. |

Calls made through Google's and SendGrid's client libraries go to the fixed endpoints those libraries are built for, which take no host from our data.

**Network layer.** Cloud Run has no egress filter without a paid VPC connector, so the application-level allowlist above is the enforcement point. If a VPC connector with Cloud NAT is added later, add a firewall egress rule allowing only the hosts in section 2.

## 4. Service authentication and least privilege (ASVS 13.2.1–13.2.3, 13.3.2)

| Connection | How it authenticates | Privilege |
| --- | --- | --- |
| Google services (Storage, Vertex AI, Secret Manager, Logging) | **Short-lived tokens** from the Cloud Run metadata server for the service's own service account. No keys are downloaded. | The API (`tor-api-sa`) and the jobs (`tor-jobs-sa`) run as separate service accounts, each granted only what it uses: the jobs `aiplatform.user`, `storage.objectAdmin` on the one bucket and their own secrets; the API read and write access to the bucket's objects (`storage.objectUser`, for avatars) and its own secrets ([gcp.md](../deployment/gcp.md)). |
| MongoDB Atlas | A database user and password (in `MONGODB_URI`, from Secret Manager), over TLS | Give the application's database user **`readWrite` on the application database only**, never `atlasAdmin`. Atlas network access is `0.0.0.0/0` because Cloud Run has no fixed egress IP without a paid VPC connector (see [gcp.md](../deployment/gcp.md#mongodb-atlas-m0)); the password and TLS are the protection. |
| SendGrid | API key from Secret Manager | Create the key with the **Mail Send** permission only. |
| Google OAuth | Client secret from Secret Manager, plus PKCE per sign-in | |
| Default credentials | None: there is no default admin (admins are made with `npm run create-admin`) and the server refuses to start with a missing or short `JWT_SECRET`, or without `MFA_ENCRYPTION_KEY` in production (13.2.3). | |

**Gap (13.2.1):** the MongoDB Atlas and SendGrid credentials are long-lived secrets, not short-term tokens. Mitigations: kept in Secret Manager with per-secret IAM, least privilege, TLS, rotation per [cryptography.md](cryptography.md#1-key-management-policy-asvs-1111). Atlas workload-identity federation would remove the database password; it is not available on the free M0 tier we use.

## 5. TLS (ASVS 12.x)

| Requirement | How |
| --- | --- |
| 12.1.1 / 12.1.2 Versions and ciphers | Set by Google's front end for Cloud Run: TLS 1.2 and 1.3, modern cipher suites with forward secrecy. Confirm with an SSL Labs scan of both `*.run.app` hosts. |
| 12.2.x Public certificates | Google-managed certificates on Cloud Run. |
| 12.3.1 Encrypted everywhere | Every outbound connection in section 2 is TLS; MongoDB uses `mongodb+srv` with TLS required. |
| 12.3.2 Certificates checked | Node.js, the MongoDB driver and the Google libraries validate certificates by default, and nothing turns that off (`rejectUnauthorized: false` appears nowhere). |
| 12.3.3 / 12.3.4 Between our own services | Frontend → API calls use the API's HTTPS URL with its Google-managed certificate. |
| 4.1.2 HTTP → HTTPS redirect | Cloud Run itself redirects plain-HTTP requests to HTTPS on every path, API included; the application can't change that. HSTS (1 year) means a browser never sends the plain-HTTP request after its first visit, so any leak is limited to that very first request. |
