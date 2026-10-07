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
| **Public** | Search and filter TORs by keyword, agency, category, budget, and deadline; read AI summaries; report incorrect data |
| **Vendor** | Everything above, plus a company profile, TOR matching, bookmarks with application tracking, a deadline calendar, and notifications |
| **Admin** | Data-quality review, fairness-flag review, error reports, ingestion runs, system logs, and user chat |

## Tech stack

| Part | Stack |
|---|---|
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript |
| `backend/` | Express 5, Mongoose 9, TypeScript, Jest |
| Database | MongoDB |
| AI | Gemini on Vertex AI (`@google/genai`) |
| Ingestion | e-GP public API scraper, PDF inspection, enrichment queue |
| Deploy | Docker, Google Cloud Run + Cloud Scheduler, Cloud Storage |

## Project structure

```
TOR_website/
├── frontend/   # Next.js app — public, vendor, and admin pages
├── backend/    # Express API, TOR ingestion, AI enrichment jobs
└── docs/       # Deployment guide and design notes
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

`JWT_SECRET` defaults to an insecure dev value. To override it, create a `.env`
file in the project root:

```text
JWT_SECRET=your-own-secret
```

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

Each app runs on its own. Copy the env templates first (`backend/.env.example`;
the frontend needs `MONGODB_URI` in `frontend/.env.local`).

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

- [CONTRIBUTING.md](CONTRIBUTING.md) — branching, commit messages, and pull requests
- [docs/deployment/gcp.md](docs/deployment/gcp.md) — deploying to Google Cloud

## Team

- Paranyu
- Pakorn
- Karnpon

## License

[MIT](LICENSE) © 2026 Paranyu, Pakorn, Karnpon
