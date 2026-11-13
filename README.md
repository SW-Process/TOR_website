# TOR Checker

**ค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้าง (TOR) ด้านซอฟต์แวร์ของกรุงเทพมหานคร**

A project for the *Collaborative Software Process and Project Management* course.

TOR Checker aggregates software-procurement TOR (Terms of Reference)
announcements from Bangkok Metropolitan Administration agencies via the public
e-GP system, writes AI summaries of each document, and surfaces AI-generated
*fairness signals* — neutral review prompts (e.g. a brand name in the spec or an
unusually short submission window), never accusations of wrongdoing.

## Features

| Role | What they can do |
|---|---|
| **Public** | Search and filter TORs by keyword, agency, category, budget, dates, technology and project type; read AI summaries and fairness signals; download the original document; report incorrect data |
| **Vendor** | Everything above, plus a company profile, TOR matching with a score, bookmarks with application tracking, a deadline calendar with day notes, saved searches, in-app notifications and an email digest of new matches, chat with the admin team, and two-step verification |
| **Admin** | Data-quality review and correction, the queue of reported TORs, fairness-flag details and pre-filter thresholds, ingestion, enrichment and lifecycle runs, capture from the national e-GP with a Chrome extension, pipeline alerts, system logs, help content, and user chat |

## Tech stack

| Part | Stack |
|---|---|
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript |
| `backend/` | Express 5, Mongoose 9, TypeScript, Jest |
| Database | MongoDB |
| AI | Gemini on Vertex AI (`@google/genai`) |
| Ingestion | BMA e-GP API and national e-GP (process5), PDF inspection, enrichment queue, Chrome extension (`extension/`) |
| Deploy | Docker, Google Cloud Run + Cloud Scheduler, Cloud Storage (not deployed publicly yet) |

## Project structure

```
TOR_website/
├── frontend/   # Next.js app — public, vendor, and admin pages
├── backend/    # Express API, TOR ingestion, AI enrichment jobs
├── extension/  # Chrome extension for capturing projects from the national e-GP
└── docs/       # Requirements, design, process, security and deployment docs
```

## Run with Docker

From the project root:

```sh
docker compose up --build
```

Then open:

```text
http://localhost:3000        # frontend
http://localhost:8000/api/health   # backend
```

This starts:

- `frontend`: the Next.js development server (hot reload)
- `backend`: the Express API (tsx watch, hot reload)
- `mongo`: a local MongoDB database

Inside Docker the services talk to each other by name:

```text
MONGODB_URI=mongodb://mongo:27017/tor_website
```

`JWT_SECRET` is required and has no default. Before the first `docker compose up`,
create a `.env` file in the project root (it is gitignored):

```sh
cp .env.example .env
# then set JWT_SECRET, e.g. the output of:
openssl rand -hex 32
```

The backend refuses to start if `JWT_SECRET` is missing or shorter than 32 characters.

### Stored TOR PDFs (GCS)

The backend container reads stored TOR PDFs straight from the `tor-checker-pdfs`
GCS bucket, using your own Google credentials — no shared secret is checked
into the repo. Before your first `docker compose up`:

1. Join the `tor-checker` Google Cloud organization and get read access to
   the `tor-checker-pdfs` bucket.
2. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and run:

   ```sh
   gcloud auth application-default login
   ```

If you skip this, the rest of the stack still works — PDF downloads from a
TOR's detail page will just fail until you log in.

Stop the containers with:

```sh
docker compose down
```

To also delete the local MongoDB data and cached volumes:

```sh
docker compose down -v
```

### Production images

Each app's `Dockerfile` has a `runner` stage that builds a minimal production
image (`node dist/server.js` for the backend, Next.js standalone output for the
frontend):

```sh
docker build --target runner -t tor-backend ./backend
docker build --target runner -t tor-frontend ./frontend
```

## Run without Docker

Each app runs on its own. Copy the env templates first (`backend/.env.example`
to `backend/.env`, `frontend/.env.example` to `frontend/.env.local`). Only the
backend connects to MongoDB.

```sh
# Backend — http://localhost:8000
cd backend
npm install
npm run dev

# Frontend — http://localhost:3000
cd frontend
npm install
npm run dev
```

Backend checks: `npm test`, `npm run typecheck`. Frontend checks: `npm run lint`, `npm run build`.

## Documentation

**Requirements**
- [docs/SRS.md](docs/SRS.md) — software requirements specification: functional and non-functional requirements, data model, UI mockups
- [docs/traceability.md](docs/traceability.md) — every requirement with its use cases, issues, pull requests and status

**Design**
- [docs/design/](docs/design/README.md) — use case model: diagram, actors and use case descriptions
- [docs/design/domain-model.md](docs/design/domain-model.md) — domain model: concepts, attributes and associations
- [docs/design/system-design.md](docs/design/system-design.md) — system design: architecture, components, connections and main flows
- [docs/design/er-diagram.md](docs/design/er-diagram.md) — ER diagram: MongoDB collections, fields, keys and references
- [docs/design/class-diagram.md](docs/design/class-diagram.md) — class diagrams: backend classes, interfaces and modules
- [docs/design/sequence-diagram.md](docs/design/sequence-diagram.md) — sequence diagrams of the main flows
- [docs/design/api.md](docs/design/api.md) — API reference: every backend endpoint, its access, parameters and responses
- [docs/superpowers/](docs/superpowers) — design specs and implementation plans for the larger features

**Process**
- [CONTRIBUTING.md](CONTRIBUTING.md) — issues, branching, commit messages, and pull requests
- [docs/scrum-workflow.md](docs/scrum-workflow.md) — how the team runs Scrum, with the Definition of Ready and Definition of Done
- [docs/process/deliverables.md](docs/process/deliverables.md) — deliverables: where each one is, what each sprint delivered, and requirement coverage
- [docs/development-process.md](docs/development-process.md) — how the project is built, by software development cycle activity, with the gaps we know about
- [docs/process/retrospectives.md](docs/process/retrospectives.md) — sprint retrospectives and action items
- [docs/process/user-feedback.md](docs/process/user-feedback.md) — feedback from users and what we changed

**Operations and security**
- [docs/deployment/gcp.md](docs/deployment/gcp.md) — deploying to Google Cloud
- [docs/security/](docs/security/README.md) — security documentation (OWASP ASVS 5.0): input validation, sign-in defenses, authorization rules, dependency policy
- [extension/README.md](extension/README.md) — loading and using the e-GP capture extension
- [.github/workflows/README.md](.github/workflows/README.md) — what CI checks and what protects `main`

## Team

- Paranyu
- Pakorn
- Karnpon

## License

[MIT](LICENSE) © 2026 Paranyu, Pakorn, Karnpon
