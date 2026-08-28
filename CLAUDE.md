# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BKK Software TOR Aggregator & Fairness Checker — aggregates software-procurement TOR (Terms of Reference) announcements from Bangkok Metropolitan Administration agencies, generates AI summaries, and surfaces AI-generated *fairness signals*. Three user roles: Public (search/read), Vendor (profile + matching + bookmarks + notifications), Admin (data quality + fairness review).

`docs/SRS.md` is the requirements source of truth. Code comments reference its `FR-XX` / `UC-XX` / `NFR-XX` identifiers — follow them back to the SRS when a schema field or behavior is unclear.

**Defamation constraint:** fairness flags are worded as neutral review signals, never accusations of wrongdoing. This governs both UI copy and admin-facing explanation text (see `fairnessFlagSchema` in `backend/src/models/Tor.js`).

## Repo layout

Monorepo with three independently-run parts:

| Part | Stack | Run |
|---|---|---|
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind v4, TypeScript | `npm run dev` (port 3000) |
| `backend/` | Express 5, Mongoose 9, **CommonJS** | `npm run dev` (nodemon, port 8000) |
| `munyin.py` | standalone Python e-GP ingestion client | `python munyin.py ...` |

### Commands

```sh
# Frontend (cd frontend)
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint (flat config, eslint.config.mjs)

# Backend (cd backend)
npm run dev        # nodemon src/server.js
npm start          # node src/server.js

# Full local stack via Docker (from repo root) — runs frontend + mongo ONLY, not backend
docker compose up --build      # http://localhost:3000
docker compose down -v         # also wipes local mongo volume
```

No test framework is configured in either `package.json` yet, and there are no CI workflows despite `.github/` existing. Do not assume `npm test` works.

## Architecture notes that span files

### Two separate MongoDB access layers
The frontend does **not** only call the Express backend. It has its own Mongoose connection (`frontend/src/lib/mongodb.ts`, cached for serverless/HMR) and its own models (`frontend/src/models/`), used from Next.js route handlers under `frontend/src/app/api/`. The Express backend has a *different* set of Mongoose models in `backend/src/models/`. When changing a schema, check whether both sides need updating. The backend models are the fuller, documented set.

### Backend data model (`backend/src/models/`, index in `models/index.js`)
8 collections: `users`, `vendorprofiles` (1:1 with vendor user), `tors` (central entity), `bookmarks` (vendor↔TOR join + application status), `notifications`, `errorreports` (public-submitted TOR corrections), `ingestionruns`, `systemlogs`.

`Tor` embeds `aiSummary` and `fairnessFlags` (fetched with the TOR, never queried alone). PDF binaries live in GCS, not Mongo — `sourceDocumentUrl` is a reference. `similarTORs` is a precomputed array of ObjectIds. There is a text index on `title`/`description`/`agency`.

### Frontend runs on mock data
Pages currently render from `frontend/src/lib/mockData.ts` and `frontend/src/lib/adminMockData.ts`. Domain types and enum values are **in Thai** (e.g. status `"เปิดรับ"`, categories). Route groups: `(site)/` for public+vendor pages, `admin/` for the admin panel. All frontend work is implementation from existing mockups — not UI design.

Next 16 note: `searchParams` in page components is a `Promise` and must be `await`ed.

### `munyin.py` — e-GP ingestion (not yet wired into the backend)
Polite public-API client for `egp2.bangkok.go.th` (no auth). `python munyin.py discover --search ซอฟต์แวร์ --max-projects 200 --download` writes `data/manifest.jsonl` + `data/pdfs/<projectNumber>/`; `python munyin.py stats` summarizes it. Resumable (skips project ids already in the manifest). Most structured fields come pre-structured from the API; ~93% of the PDFs are scans with no text layer, so OCR is the main extraction path. Requires `pip install requests` (and `pypdf` for `--download` text-layer detection).

### Planned AI pipeline (cost-control funnel)
Cheap→expensive stages so not every TOR hits the LLM: scrape → parse/keyword-classify → embeddings + budget/timeline stats + brand-name regex (filters out most normal TORs) → Gemini review queue only for flagged candidates → results store. Each stage is its own queue/worker; jobs idempotent keyed by TOR id + content hash; dead-letter queue for unparseable PDFs.

### TOR ingestion (`backend/src/scraper/` + `backend/src/ingestion/`)
`munyin.py` was a throwaway prototype; the real ingestion path is in the TS backend.
`POST /api/ingestion/runs` (admin) creates an `IngestionRun` and kicks off
`runIngestion` in-process — it pages the e-GP API (`scraper/egpClient.ts`), upserts
`Tor` docs keyed by `projectCode` with change detection via `sourceContentHash`, and
downloads each TOR PDF through the `BlobStorage` adapter (`storage/`, `STORAGE_DRIVER`
= `local` now, `gcs` later). `pdfInspect` tags each file `digital` / `scanned` /
`unreadable` / `missing`; OCR and AI stages consume that later. Binaries never go in
Mongo. Progress and errors land in `IngestionRun` + `SystemLog` (source `ingestion`).

## Environment

- `backend/.env` — needs `MONGODB_URI` (and `PORT`). `backend/.env.example` is minimal and slightly malformed; the real key is `MONGODB_URI`.
- `frontend/.env.local` — needs `MONGODB_URI` (the code throws on startup without it).
- Inside Docker the frontend uses `mongodb://mongo:27017/tor_website`.
- Always update `.env.example` when adding a new variable.

## Working agreements (from CONTRIBUTING.md)

- Branch off `main` as `<type>/<what-you-are-doing>` (`feat/`, `fix/`, `test/`, `chore/`, `docs/`, `style/`, `refactor/`, `perf/`, `ci/`). Never push directly to `main`.
- Conventional Commits: `<type>(<scope>): <what, not how>`, imperative, no trailing period. One commit = one thing.
- Open a PR into `main`; needs at least 1 review; don't merge your own.
