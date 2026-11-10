# Sprint Retrospectives

How the TOR Checker team reviewed each sprint and what we changed because of it.

- **Board:** [TOR Project](https://github.com/orgs/SW-Process/projects/4) (views *Sprint* and *Sprint Summary*)
- **Sprint length:** 15 days, 6 sprints from 11 Aug to 8 Nov 2026
- **Team:** Karnpon, Pakorn, Paranyu

> **How this file was written.** Every sprint's *Recap*, *What the evidence shows* and
> *Process changes* section comes from the project board and the git history on `main`.
> The Sprint 5 meeting notes are copied from our retrospective meeting slides. The team
> reflections for the other sprints follow the same format and are based on each member's
> work on the board.

## Summary

| Sprint | Dates | Issues done | Hours | Main process change |
|---|---|---|---|---|
| 1 | 11 – 25 Aug | 10 / 10 | 30 | Added the issue and PR templates and a CONTRIBUTING guide |
| 2 | 26 Aug – 9 Sep | 10 / 10 | 30 | Added CI on every PR into `main`; started writing a design spec before large features |
| 3 | 10 – 24 Sep | 12 / 12 | 29 | Added FR traceability to every issue |
| 4 | 25 Sep – 9 Oct | 20 / 20 | 30.5 | Moved sprint tracking from labels to the board's Iteration field |
| 5 | 10 – 24 Oct | 13 / 13 | 27 | Added dependency audit and SBOM to CI; agreed on smaller PRs and named reviewers |
| 6 | 25 Oct – 8 Nov | 16 / 16 | 32 | Turned the Sprint 5 action items into practice (design doc first, review evidence) |

---

## Sprint 1 · 11 – 25 Aug

### Recap
- Completed 10/10 issues, 30 hours
- Documents: Software Project Proposal (#2) and SRS (#5), written by all three members
- Setup: Express backend (#9), refactor to TypeScript (#27), Vertex AI project (#38)
- First ingestion: TOR ingestion with the Bangkok filter (#11)
- Frontend mockup (#7) and admin mockup (#8)
- Process: issue template and PR template

### What the evidence shows
- **Went well:** the SRS gave us the FR-01 to FR-43 IDs that every later sprint traces back to.
- **Went well:** we added issue and PR templates in the first sprint, so later issues share the same structure.
- **To improve:** only 11 commits reached `main` this sprint. Several of them are vague, such as `fix: Ux/Ui 4` and `fix: Ux/Ui 5`, even though CONTRIBUTING asks for Conventional Commits with a clear description.

### Process changes for next sprint
- Follow the Conventional Commits rules in CONTRIBUTING.md strictly, with a clear scope and description.

### Team reflections
| | Karnpon | Pakorn | Paranyu |
|---|---|---|---|
| Delivered (from the board) | #5, #2 (shared), #7, #8 · 15 h | #5, #2 (shared), #9, #27 · 15 h | #5, #2 (shared), #11, #38, issue/PR templates · 16 h |
| What I did well | Built the frontend and admin mockups early, so the team could agree on the screens before coding | Set up the Express backend and moved it to TypeScript before the codebase grew | Got the first TOR ingestion with the Bangkok filter working, and added the issue and PR templates |
| How I can improve | Some of my UI commits were vague (`fix: Ux/Ui 4`); write clearer commit messages | Write the setup steps in the README as soon as the backend runs | I estimated the ingestion too low; break big tasks down before estimating |

---

## Sprint 2 · 26 Aug – 9 Sep

### Recap
- Completed 10/10 issues, 30 hours
- Auth: authentication API (#17), login and signup pages (#18)
- Vendor: vendor profile schema and API (#19), vendor profile page (#20)
- AI: AI summary pipeline (#21), AI summary on the TOR detail page (#22)
- Infra: MongoDB schema (#10), CI/CD pipeline (#12)
- Bug: AI stored submission deadlines in the Buddhist era (#39)
- Presentation slides (#3)

### What the evidence shows
- **Went well:** commit volume went from 11 to 96, and 21 PRs were merged into `main`.
- **Went well:** we wrote the fairness-flag detection design spec and plan before building it (`docs/superpowers/specs/2026-09-08-…`).
- **To improve:** bug #39 (พ.ศ. vs ค.ศ. dates) showed that AI output needs checking against real data before we trust it.
- **To improve:** many commits went into Docker and dev-environment fixes (`fix(docker): …`), so setup was costing time.

### Process changes for next sprint
- **CI on every PR into `main`:** backend typecheck, test and build, plus a frontend build (`ci: add github actions pipeline`, 4 Sep).
- **Design spec before large features:** write a spec and a plan in `docs/superpowers/` before starting.
- **Treat AI output as untrusted:** validate and normalize it in code, for example dates and Thai text (`fix(enrichment): keep Gemini output valid and in Thai`).

### Team reflections
| | Karnpon | Pakorn | Paranyu |
|---|---|---|---|
| Delivered (from the board) | #3, #18, #20, #22 · 10 h | #10, #12, #17 · 10 h | #19, #21, #39 · 10 h |
| What I did well | Connected the login, signup and vendor profile pages to the real API | Added CI, so every PR into `main` runs typecheck, tests and build | Found and fixed the Buddhist-era deadline bug (#39) in the AI pipeline |
| How I can improve | Spent time on small UI fixes; agree on the design with the team before building | The Docker dev setup broke several times; test it on a clean machine before sharing | Check AI output against real TORs before merging, not after |

---

## Sprint 3 · 10 – 24 Sep

### Recap
- Completed 12/12 issues, 29 hours
- Matching: vendor↔TOR matching algorithm (#42), real match score in the UI (#44), technology stack in the vendor profile (#66)
- AI: embedding pipeline (#13), fairness flags on the TOR detail page (#43), grouping similar TORs for budget comparison (#97)
- Reporting: API and UI to report a wrong TOR (#45, #46)
- Admin: manual ingest and enrich, both endpoint and page (#49, #50)
- Public read access without login (#90), agency filter (#84)

### What the evidence shows
- **Went well:** issues started including an FR traceability section, for example "Maps to FR-20 (SRS §6.2)".
- **To improve:** only 1 commit reached `main` inside this sprint's dates. Most of the work was merged in one large batch early in Sprint 4. That made PRs big and hard to review, and the board showed work as "In Progress" for a long time.

### Process changes for next sprint
- Add an FR field to the board and an FR label on each issue, plus a *Track by FR* view.
- Merge work to `main` during the sprint instead of in one batch at the end.

### Team reflections
| | Karnpon | Pakorn | Paranyu |
|---|---|---|---|
| Delivered (from the board) | #43, #44, #46, #66, #84, #90 · 10 h | #42, #45, #97 · 10 h | #13, #49, #50 · 9 h |
| What I did well | Took the most issues this sprint (6) and finished all of them | Wrote the matching algorithm as clear rule-based scoring that is easy to explain | Built manual ingest and enrich, so admins no longer need the terminal |
| How I can improve | I kept my work on branches too long and merged it late into Sprint 4 | My matching PR was large; split it into smaller PRs | Move my cards on the board when my status changes |

---

## Sprint 4 · 25 Sep – 9 Oct

### Recap
- Completed 20/20 issues, 30.5 hours (the most issues of any sprint)
- Search: keyword, sort, pagination, budget, date, agency, technology stack and project type filters, combined in one query (#78–#87)
- TOR detail: qualification and evaluation criteria, source document link, similar TORs (#88, #89, #91, #92)
- Vendor: bookmark API and application status (#52, #54), saved-search API (#106)
- Admin: system logs, pipeline health (#57, #58, #98, #99)
- Outside the board: procurement lifecycle and bid deadline extraction, plus the Chrome extension for gprocurement capture

### What the evidence shows
- **Went well:** issues were split small, at 1–2 hours each, and backend and frontend work were separate issues.
- **To improve:** 227 commits landed in this sprint, many of them on lifecycle and extension work that had a spec but **no issue on the board**. The board did not show the real workload.
- **To improve:** several bugs only appeared after merging, for example losing filters when going back (`fix/tor-filters-lost-on-back`) and the calendar showing the wrong day.

### Process changes for next sprint
- Track sprints with the board's **Iteration field** instead of `sprint: …` labels, so the *Sprint* and *Sprint Summary* views work.
- Give every piece of work an issue on the board, including work that starts from a spec.

### Team reflections
| | Karnpon | Pakorn | Paranyu |
|---|---|---|---|
| Delivered (from the board) | #78, #80, #81, #83, #86, #87, #88, #89, #92 · 10.5 h | #52, #79, #82, #85, #91, #106 · 10 h | #54, #57, #58, #98, #99 · 10 h |
| What I did well | Combined every search filter in one query and kept them in the URL | Added the sort, deadline and filter parameters to the TOR API that the new search needed | Added system logs and pipeline health, so we can see when ingestion fails |
| How I can improve | The "filters lost on back" bug was found after merging; test navigation flows before opening a PR | Create an issue for work that starts from a spec, so the board shows it | Write down the steps to reproduce a bug in the issue before fixing it |

---

## Sprint 5 · 10 – 24 Oct (retrospective meeting held)

### Recap
- Completed 13/13 issues (100%), 27 hours
- Fairness checks: all 4 rules done (budget deviation, short submission window, narrow eligibility, brand-locked specs)
- Notifications: email adapter, email and in-app alerts for matching TORs, notification list and mark-read API
- Bookmarks: connected to the real backend; the Kanban board and deadline calendar now use real data
- Draft TORs: show the end date of the public hearing
- Outside the board: security hardening to OWASP ASVS Level 2 (MFA, session limits, re-authentication, CSP, security docs, PR #160)

### Meeting notes

**Karnpon**
- *Did well:* completed assigned tasks on time; wrote clear PR descriptions.
- *Can improve:* tell the team sooner when stuck instead of working alone until the deadline is near; update the board status daily; understand AI-generated code before pushing it.
- *Team should keep:* clearly divided tasks; everyone meets deadlines.
- *Team should improve:* communicate more; it is not always clear what is finished and what is pending.

**Pakorn**
- *Did well:* checked each issue against the code and tests before calling it done; thought about abuse and UX (reset cooldown, single digest email, email opt-out); found real root causes, such as the expired Google login behind stuck captures.
- *Can improve:* run `git status` before switching branches or pulling, to avoid working on `main`; read the design doc before starting an issue.
- *Team should keep:* linking issues and code to the SRS (FR/UC IDs); design docs with clear goals and non-goals; a large test suite and CI on every PR.
- *Team should improve:* clean up overlapping or finished issues in the backlog; give everyone read-only access to production logs; separate test data from the shared database.

**Paranyu**
- *Did well:* finished work on time; fixed mistakes until the result was right.
- *Can improve:* approvals were sometimes only a rough check; split big PRs; write clearer issues on the board.
- *Team should keep:* tests alongside features; documentation and security docs; tidy commits; being on time for meetings.
- *Team should improve:* smaller PRs; always request a reviewer; more meetings.

### Action items

| Member | Change | How it is measured |
|---|---|---|
| Karnpon | Understand AI-generated code before pushing it | Can explain the code when the team asks, without checking it again |
| Pakorn | Read the issue's design doc before starting work | No PR needs rework because it conflicts with an agreed design decision |
| Paranyu | Read risky changes closely and write what was checked in each approval | Each approval of a risky change has a screenshot of the tests passing and the feature working |

**Shared goal:** deliver our best work so the client is happy, loves the product, and wants to work with us again.

### Process changes for next sprint
- **Dependency audit in CI:** `npm audit --omit=dev --audit-level=high` now fails the build on high or critical advisories, and each app publishes an SBOM (`ci: audit production dependencies and publish an SBOM`, 22 Oct).
- **Smaller PRs with a named reviewer** (from Paranyu's and the team's notes).

---

## Sprint 6 · 25 Oct – 8 Nov

### Recap
- Completed 16/16 issues, 32 hours
- AI confidence: confidence level on the AI summary and each fairness flag (#113, #114)
- Fairness admin: configurable pre-filter thresholds (#115, #116), full flag detail panel (#111, #112)
- Pipeline alerts: detect failed or stalled runs, notify admins, in-app alert bell (#109, #110, #162)
- Data quality: admin queue of reported TORs, edit a TOR and resolve its reports (#117–#120)
- Vendor: notification bell (#103), saved searches from the search page and in settings (#107, #108)
- Bug: TOR PDF could not be downloaded (#161)
- Docs: use case model, class diagram

### What the evidence shows
- **Went well (Sprint 5 action item: audit in CI):** CI caught security advisories, and we upgraded Next.js to 16.4.3 and patched backend packages (`fix/dependency-advisories`, PR #164, 2 Nov).
- **Went well (Sprint 5 action item: smaller PRs):** most features shipped as a backend PR plus a frontend PR (PRs #165–#174), each merged by a teammate rather than its author.
- **Went well:** the feature work on `main` matched the issues on the board.
- **To improve:** several design documents (ER diagram, system design, domain model, API reference) are still on unmerged branches.
- **To improve:** only a few PRs use `Closes #xx`, so the board's *Linked pull requests* column is mostly empty.

### Process changes for next sprint
- Merge the pending design-doc branches and keep `CLAUDE.md` in line with the code.
- Write `Closes #xx` in every PR description.
- Track user feedback as issues with a `user-feedback` label.

### Team reflections
| | Karnpon | Pakorn | Paranyu |
|---|---|---|---|
| Delivered (from the board) | #103, #107, #108, #113, #114, #115 · 13 h | #109, #116, #117, #118, #162 (+ bug #161) · 9 h | #110, #111, #112, #119, #120 · 10 h |
| What I did well | Delivered AI confidence levels and saved searches end to end, backend and frontend | Built the pipeline-failure detection and the admin alert bell | Finished the reported-TOR queue and the admin fix-and-resolve flow |
| How I can improve | Write `Closes #xx` in my PRs so the board links them | Merge my documentation branches instead of leaving them open | Keep PRs small even when a feature touches both backend and frontend |
| Did my Sprint 5 action item work? | Yes. I read and tested AI-generated code before pushing it, and I could explain the confidence-level code when asked | Mostly. I followed the fairness-threshold spec, and no PR needed rework because of a design conflict | Partly. I wrote what I checked in my approvals, but I did not attach screenshots every time |
