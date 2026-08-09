# Contributing Guide

Rules for working together on this project

## Project Structure

```
TOR_website/
├── frontend/   # Next.js
└── backend/    # Node.js + Express + MongoDB Atlas
```

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
- Describe what was done and how it was tested
- Don't merge your own PR — wait for review

## Environment Variables

- Never commit `.env` or `.env.local` files with real values (already blocked by `.gitignore`)
- When adding a new env variable, always update `.env.example` too

## Before Every Push

- [ ] Project runs without errors
- [ ] No `.env`, `node_modules`, or credential files show up in `git status`
- [ ] Commit messages follow the format above
