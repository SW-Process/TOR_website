# Deliverables

What the TOR Checker team delivers, where to find each deliverable, and the issues on the [project board](https://github.com/orgs/SW-Process/projects/4) that produced it. The numbers come from the board and the repository as of 11 November 2026.

- **Requirements:** every product deliverable traces back to a functional requirement (FR-1 to FR-43) in the [SRS](../SRS.md).
- **Board:** each issue carries its requirement in the board's *FR* field and an `FR-xx` label. The work was planned in six 15-day sprints, set in the board's *Sprint* field.
- **Status:** every item on the board is *Done*. The gaps we know about are listed in [development-process.md](../development-process.md).

## 1. Project deliverables

| Deliverable | Where it is | Board issue | Sprint |
|---|---|---|---|
| Software project proposal | Google Docs (not in this repository) | [#2](https://github.com/SW-Process/TOR_website/issues/2) | 1 |
| Software requirements specification (SRS) | [`docs/SRS.md`](../SRS.md) | [#5](https://github.com/SW-Process/TOR_website/issues/5) | 1 |
| UI mockups, public and admin | SRS §3.4, images in [`docs/srs-images/`](../srs-images) | [#7](https://github.com/SW-Process/TOR_website/issues/7), [#8](https://github.com/SW-Process/TOR_website/issues/8) | 1 |
| Presentation slides | Canva (not in this repository) | [#3](https://github.com/SW-Process/TOR_website/issues/3) | 2 |
| Working software: web app, API, AI pipeline, Chrome extension | [`frontend/`](../../frontend), [`backend/`](../../backend), [`extension/`](../../extension) | Sections 2 and 3 below | 1–6 |
| Design documents | [`docs/design/`](../design/README.md), see section 4 | No board issue; written in pull requests | 6 |
| Feature design specs and plans | [`docs/superpowers/`](../superpowers) | Linked from the issues they cover | 2–6 |
| Security documentation (OWASP ASVS) | [`docs/security/`](../security/README.md) | No board issue; [PR #160](https://github.com/SW-Process/TOR_website/pull/160) | 5 |
| Deployment guide | [`docs/deployment/gcp.md`](../deployment/gcp.md) | No board issue | 2, updated in 5 |
| Process documents | [Retrospectives](retrospectives.md), [user feedback](user-feedback.md), [development process](../development-process.md), [Scrum workflow](../scrum-workflow.md), [CONTRIBUTING](../../CONTRIBUTING.md) | No board issue | 1–6 |

## 2. What each sprint delivered

Hours are the sum of the board's *Time* field for that sprint. [retrospectives.md](retrospectives.md) has each sprint's review.

| Sprint | Dates | Delivered | Issues | Hours |
|---|---|---|---|---|
| 1 | 11 – 25 Aug | Proposal, SRS, mockups, issue and PR templates, Express + TypeScript backend, Vertex AI project, first TOR ingestion with the Bangkok filter | #2, #5, #7, #8, #9, #11, #27, #38, and the issue and PR templates | 30 |
| 2 | 26 Aug – 9 Sep | Slides, MongoDB schema, CI, sign-in and sign-up, vendor profile, AI summary pipeline and its display, Buddhist-era date fix | #3, #10, #12, #17–#22, #39 | 30 |
| 3 | 10 – 24 Sep | Embeddings, vendor↔TOR matching and match score, fairness flags on the TOR page, error reports, manual ingest and enrich, public read access, agency filter, similar-TOR grouping | #13, #42–#46, #49, #50, #66, #84, #90, #97 | 29 |
| 4 | 25 Sep – 9 Oct | Full search (keyword, sort, pagination, budget, dates, technology stack, combined filters in the URL), TOR detail sections, similar TORs, bookmark and application-status API, system logs, pipeline health, saved-search API | #52, #54, #57, #58, #78–#83, #85–#89, #91, #92, #98, #99, #106 | 30.5 |
| 5 | 10 – 24 Oct | The four fairness checks, in-app and email match notifications, bookmarks, Kanban board and calendar on real data, public-hearing end date for draft TORs | #53, #55, #56, #93–#96, #100–#102, #104, #105, #152 | 27 |
| 6 | 25 Oct – 8 Nov | Vendor notification bell, saved searches in the UI, pipeline failure alerts, admin fairness-flag detail, confidence levels, fairness thresholds, admin error-report queue and TOR correction, PDF download fix | #103, #107–#120, #161, #162 | 32 |

## 3. Requirement coverage

Every functional requirement in the SRS has at least one issue on the board. Some requirements were split into a backend and a frontend issue.

| SRS section | Requirements | Issues |
|---|---|---|
| 4.1 Search & Browse | FR-1 – FR-11 | #13, #39, #78–#92, #152, #161 |
| 4.2 AI Summary & Fairness | FR-12 – FR-20 | #21, #22, #39, #43, #93–#97, #111–#116 |
| 4.3 Vendor Account & Matching | FR-21 – FR-33 | #17–#20, #42, #44, #52–#56, #66, #100–#108 |
| 4.4 Admin Operation | FR-34 – FR-41 | #45, #46, #49, #50, #57, #58, #98, #99, #109, #110, #117–#120, #162 |
| 4.5 Data Ingestion Pipeline | FR-42 – FR-43 | #11, #188 |

To follow one requirement, filter the board's *Track by FR* view, or search the issues by its label (for example `label:FR-40`).

## 4. Design documents

| Document | Shows | On `main` since | Last updated |
|---|---|---|---|
| [Use case model](../design/README.md) | Actors and use cases | 5 Nov | 10 Nov |
| [Domain model](../design/domain-model.md) | Concepts and associations | 9 Nov | 10 Nov |
| [System design](../design/system-design.md) | Components, where they run, main flows | 9 Nov | 9 Nov |
| [ER diagram](../design/er-diagram.md) | The 16 MongoDB collections | 9 Nov | 9 Nov |
| [Class diagrams](../design/class-diagram.md) | Pipeline and request-handling classes | 9 Nov | 10 Nov |
| [Sequence diagrams](../design/sequence-diagram.md) | Pipeline, search, error report, sign-in, whole system | 9 Nov | 9 Nov |
| [API reference](../design/api.md) | Every backend endpoint | 9 Nov | 9 Nov |

The design documents were drawn from the code at the end of the project, not before it. Larger features had a written spec in [`docs/superpowers/specs/`](../superpowers/specs) before coding started.

## Keeping this page current

When a sprint ends, add its row to section 2 from the board's *Sprint* view. When a new requirement or document is added, add it to section 3 or 4 in the same pull request.
