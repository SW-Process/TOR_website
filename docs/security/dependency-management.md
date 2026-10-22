# Third-party Components: Update and Remediation Policy

**ASVS 5.0 requirement:** 15.1.1 (Level 1): *"Verify that application documentation defines risk based remediation time frames for 3rd party component versions with vulnerabilities and for updating libraries in general, to minimize the risk from these components."*

This policy is what ASVS 15.2.1 (Level 1) checks against: *"the application only contains components which have not breached the documented update and remediation time frames."*

## 1. Scope

| Component type | Where | Managed with |
| --- | --- | --- |
| Backend npm packages | `backend/package.json`, `backend/package-lock.json` | npm |
| Frontend npm packages | `frontend/package.json`, `frontend/package-lock.json` | npm |
| Node.js runtime | `node:22-bookworm-slim` (backend image), `node:22-alpine` (frontend image), Node 22 in CI | Dockerfiles, `.github/workflows/ci.yml` |
| Database | MongoDB Atlas in production; `mongo:7` image for local development only | Atlas / `docker-compose.yml` |
| CI actions | `actions/checkout@v4`, `actions/setup-node@v4` | GitHub Actions |
| Chrome extension | `extension/`; no npm dependencies | — |
| External services (not installed code) | Google OAuth, Vertex AI (Gemini), Cloud Storage, SendGrid, e-GP | Vendor-managed; we only update their client libraries |

The lock files are committed, and CI installs with `npm ci`, so builds use exactly the reviewed versions.

## 2. Inventory of runtime dependencies

Versions as resolved in the lock files on 2026-10-22.

### Backend

| Package | Version | Purpose | Risk notes |
| --- | --- | --- | --- |
| `express` | 5.2.1 | HTTP server | Handles every request. **High exposure.** |
| `jsonwebtoken` | 9.0.3 | Session tokens | Security-critical. **High exposure.** |
| `bcrypt` | 6.0.0 | Password hashing | Security-critical; native module. |
| `cookie-parser` | 1.4.7 | Reads the session cookie | Handles every request. |
| `cors` | 2.8.6 | CORS headers | |
| `multer` | 2.3.0 | Avatar uploads | Parses untrusted multipart data. **High exposure.** |
| `zod` | 3.25.76 | Input validation | |
| `mongoose` / `mongodb` | 9.9.2 / 7.5.0 | Database access | |
| `google-auth-library` | 11.0.2 | Google sign-in (verifies ID tokens) | Security-critical. |
| `pdf-parse` | 1.1.4 | Reads text layers of downloaded TOR PDFs | Parses untrusted files and bundles an old PDF.js build (v1.10.100). **"Risky component"**: watch closely, plan to replace (section 6). |
| `fflate` | 0.8.3 | Unzips e-GP document bundles | Parses untrusted archives. |
| `@google/genai` | 0.14.1 | Gemini on Vertex AI | Pre-1.0 release line; behind a newer major. Used only by batch jobs, not by user requests. |
| `@google-cloud/storage` | 7.22.0 | PDF and avatar storage | |
| `@sendgrid/mail` | 8.1.6 | Outbound email | |
| `dotenv` | 17.4.2 | Loads `.env` in development | |

### Frontend

| Package | Version | Purpose | Risk notes |
| --- | --- | --- | --- |
| `next` | 16.3.0 | Framework and server | Renders every page; handles routing and server components. **High exposure.** |
| `react`, `react-dom` | 19.2.8 | UI | |
| `lucide-react` | 1.30.0 | Icons | Low exposure. |

Development-only packages (TypeScript, Jest, ESLint, Tailwind, `mongodb-memory-server`, …) are not in the production images (`npm prune --omit=dev` in the backend image, Next.js standalone output in the frontend image). Their vulnerabilities are handled with the "development only" row in section 3.

## 3. Remediation time frames for vulnerable components

When a vulnerability is reported in a component we use, the time to fix (upgrade, patch, or remove it) depends on its severity and on whether our code actually reaches the vulnerable part.

**Reachable** means attacker-controlled input can get to the vulnerable code in our deployment, for example:
- a request parser, `express`, `multer`, `cookie-parser`;
- authentication, `jsonwebtoken`, `bcrypt`, `google-auth-library`;
- page rendering, `next`, `react`;
- parsing of downloaded e-GP files, `pdf-parse`, `fflate`.

| Severity (CVSS / npm audit level) | Reachable in production | Not reachable in production | Development only |
| --- | --- | --- | --- |
| **Critical** (9.0–10.0), or known to be exploited | **2 days** | 7 days | 30 days |
| **High** (7.0–8.9) | **7 days** | 30 days | 30 days |
| **Moderate** (4.0–6.9) | **30 days** | 90 days | Next routine update |
| **Low** (0.1–3.9) | 90 days | Next routine update | Next routine update |

Rules:
- The clock starts when the advisory is published (or when we first see it in `npm audit` or a Dependabot alert, if later).
- "Fix" means the fixed version is merged to `main` and deployed. If no fixed version exists, apply a workaround within the same time frame (block the input, switch off the feature, or replace the package) and record it in section 5.
- If we can't tell whether a vulnerability is reachable, treat it as **reachable**.
- During the project's demo and presentation week, Critical and High fixes still follow this table; other updates can wait until after.

## 4. Routine updates (no known vulnerability)

| What | How often | Rule |
| --- | --- | --- |
| Patch and minor versions of all npm packages | Every **month** | `npm outdated` in `backend/` and `frontend/`, update, run CI (typecheck, tests, build). |
| Major versions | Within **3 months** of release | Or record why we stay (section 5). Read the changelog for breaking changes. |
| Next.js and React security releases | Within **7 days** | Treated as reachable, even without an advisory number. |
| Node.js runtime | Stay on a version that receives security fixes | Node 22 is an LTS line supported until April 2027; move to the next LTS before then. Rebuild the images monthly to pick up base image patches. |
| Docker base images | Every **month** | Rebuild with `--pull`. |
| GitHub Actions | Every **6 months** | Move to the current major (`@v4` → `@v5`, …). |
| Unmaintained packages | When noticed | A package with no release for 2 years, or marked deprecated, is flagged as a "risky component" and gets a replacement plan. |

## 5. Process

### 5.1 Finding vulnerabilities

| Source | When |
| --- | --- |
| `npm audit --omit=dev` in `backend/` and `frontend/` | Before every release, and at least **weekly** while the project is active |
| GitHub Dependabot alerts (repository → Settings → Code security) | Continuously, once enabled for the repository |
| CodeQL / Semgrep (SAST) | On every pull request, once added to CI |
| Release notes of the high-exposure packages in section 2 | At the monthly update |

Commands:

```sh
cd backend  && npm audit --omit=dev
cd frontend && npm audit --omit=dev
# full report for the project document
npm audit --omit=dev --json > npm-audit-backend.json
```

### 5.2 Handling one finding

1. **Triage** within 2 working days: severity, affected versions, is it reachable (section 3)?
2. **Open a GitHub issue** labelled `security` with the package, advisory id (GHSA/CVE), severity, reachability and due date from the table.
3. **Fix** on a branch named `fix/deps-<package>`: `npm install <package>@<fixed version>`, or `npm audit fix` when it doesn't jump a major version.
4. **Verify**: CI passes (backend typecheck, tests, build; frontend build), and `npm audit` no longer lists the finding.
5. **Merge and deploy**, then close the issue with the deployed version.

### 5.3 Exceptions

When a fix can't be applied in time (no fixed version, or it would break the app), record it here with a workaround and an expiry date. An exception must be reviewed by another team member.

| Advisory | Package | Severity | Why not fixed | Workaround | Review by |
| --- | --- | --- | --- | --- | --- |
| *(none yet)* | | | | | |

## 6. Current status

| Date | Command | Result | Action |
| --- | --- | --- | --- |
| *(to fill)* | `npm audit --omit=dev` (backend) | | |
| *(to fill)* | `npm audit --omit=dev` (frontend) | | |

Known items from the inventory:

| Item | Category | Plan |
| --- | --- | --- |
| `pdf-parse` 1.1.4 parses untrusted PDFs with an old bundled PDF.js | Risky component | It runs only while ingesting TORs (the scheduled jobs and admin-started capture runs), on PDFs downloaded from the government e-GP systems, never on files users upload. Check for advisories at every monthly update; evaluate `pdf-parse` 2.x or `pdfjs-dist` as a replacement. |
| `@google/genai` 0.14.1 is behind its current major | Routine major update | Upgrade within the 3-month window, testing the enrichment job with real TORs. |

## 7. Responsibilities

| Task | Who |
| --- | --- |
| Weekly `npm audit` and triage | The team member on duty that week (rotates through the team) |
| Fix pull requests | Whoever triaged the finding, unless reassigned |
| Review of fixes and exceptions | Any other team member (pull requests need one approval) |
