# CI workflows

## `ci.yml`

Runs on every pull request into `main` and on every push to `main`.

| Job | Steps | Gates against |
|---|---|---|
| `backend` | `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npm audit --omit=dev --audit-level=high` → SBOM | type errors, failing tests, broken build, high or critical advisories in production dependencies |
| `frontend` | `npm ci` → `npm run build` → `npm audit --omit=dev --audit-level=high` → SBOM | type errors (`next build` runs `tsc`), broken build, high or critical advisories |

Each job also writes a CycloneDX SBOM of its production dependencies (`npm sbom`) and uploads it as a build artifact. See [`docs/security/dependency-management.md`](../../docs/security/dependency-management.md).

Backend tests use `mongodb-memory-server`, which downloads a throwaway `mongod`
binary on the runner — no database service is needed.

### Not gated yet

`frontend` **`npm run lint`** passes, but CI does not run it. To gate it, add a `Lint` step to the `frontend` job:

```yaml
      - name: Lint
        run: npm run lint
```

## What protects `main`

The **Protect main branch** ruleset (active since 10 August) applies to `main`:

- no direct pushes: every change goes through a pull request;
- one approving review, and the last push must be approved (`require_last_push_approval`);
- no force-pushes and no deletion of the branch.

CI is **not** a required check yet, so GitHub would allow a merge while CI is failing. To require it:

1. Repo **Settings → Rules → Rulesets → Protect main branch**.
2. Add **Require status checks to pass** and select `backend (typecheck · test · build)` and `frontend (build)`.
3. Optionally enable **Require branches to be up to date before merging**.
