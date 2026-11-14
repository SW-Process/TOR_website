# Contributing Guide

Rules for working together on this project

## Project Structure

```
TOR_website/
├── frontend/    # Next.js
├── backend/     # Node.js + Express + MongoDB Atlas
├── extension/   # Chrome extension for capturing projects from the national e-GP
└── docs/        # SRS, design, process, security and deployment docs
```

## Issues

Every piece of work starts as an issue on the project board, from the organization's issue templates.

- Before an issue goes into a sprint it must meet the [Definition of Ready](docs/scrum-workflow.md#definition-of-ready): a problem, a design reference, acceptance criteria, traceability to an FR, an estimate of 4 hours or less, a priority, its dependencies and one owner.
- It is finished only when it meets the [Definition of Done](docs/scrum-workflow.md#definition-of-done).

## Branching

Name branches using `<type>/<what-you-are-doing>`, e.g.

```
feat/login-page
fix/navbar-overlap
test/health-check-api
chore/setup-backend
```

- Never push directly to `main`
- Always branch off `main` before starting work
- When done, open a Pull Request into `main` and get at least 1 review before merging

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description of what, not how>
```

`<scope>` is optional, used to indicate what part is affected, e.g. `frontend`, `backend`, `auth`

### Allowed Types

| Type | Use when |
|---|---|
| `feat` | Adding a new feature |
| `fix` | Fixing a bug |
| `test` | Adding/updating tests |
| `docs` | Updating documentation (README, comments) |
| `style` | Code formatting changes, no logic impact |
| `refactor` | Restructuring code, no new feature or bug fix |
| `chore` | Misc tasks, e.g. setup, dependency updates |
| `perf` | Performance improvements |
| `ci` | CI/pipeline changes |

### Examples

```
feat(backend): add health check api
fix(frontend): correct navbar overlap on mobile
test(backend): add unit test for user controller
chore: setup backend project structure
docs: update readme with setup instructions
```

Rules:
- 1 commit = 1 thing. Don't bundle multiple unrelated changes into one commit
- Write in short, clear, imperative sentences. No trailing period
- Add more detail below the summary line (after a blank line) if needed

## Pull Requests

- Title the PR to reflect what it does (can reuse commit type format, e.g. `feat: add login page`)
- Use the organization's PR template: describe what was done and how it was tested
- Write `Closes #<issue>` in the description, so the board links the PR to its issue
- CI must pass: backend typecheck, tests and build; frontend build; `npm audit`
- Don't merge your own PR — wait for review. The `main` ruleset requires one approval
- Update the docs your change affects: [`docs/design/api.md`](docs/design/api.md) for endpoints, the [ER diagram](docs/design/er-diagram.md) for collections and fields

## Environment Variables

- Never commit `.env` or `.env.local` files with real values (already blocked by `.gitignore`)
- When adding a new env variable, always update `.env.example` too

## Before Every Push

- [ ] Project runs without errors
- [ ] No `.env`, `node_modules`, or credential files show up in `git status`
- [ ] Commit messages follow the format above
