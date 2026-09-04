# CI workflows

## `ci.yml`

Runs on every pull request into `main` and on every push to `main`.

| Job | Steps | Gates against |
|---|---|---|
| `backend` | `npm ci` → `npm run typecheck` → `npm test` → `npm run build` | type errors, failing tests, broken build |
| `frontend` | `npm ci` → `npm run build` | type errors (`next build` runs `tsc`), broken build |

Backend tests use `mongodb-memory-server`, which downloads a throwaway `mongod`
binary on the runner — no database service is needed.

### Not gated yet

`frontend` **`npm run lint`** currently reports 9 pre-existing errors
(`react-hooks/set-state-in-effect` in the localStorage hooks). Once those are
fixed, add back a `Lint` step to the `frontend` job:

```yaml
      - name: Lint
        run: npm run lint
```

and add `frontend (build)` → `frontend (lint · build)` to the required checks.

## Making these checks required

CI only protects `main` if merges are blocked when it fails:

1. Repo **Settings → Branches → Add branch ruleset** (or *Add rule*) for `main`.
2. Enable **Require a pull request before merging** (≥ 1 approval — matches `CONTRIBUTING.md`).
3. Enable **Require status checks to pass** and select `backend (typecheck · test · build)`
   and `frontend (build)`.
4. Enable **Require branches to be up to date before merging**.
5. Optionally **Do not allow bypassing the above settings** so admins are held to it too.
