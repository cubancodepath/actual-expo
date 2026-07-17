# Upstream sync checklist

How to keep `src/core` growing in step with Actual Budget's `loot-core`. Run this when a
new stable Actual release lands (or periodically). Companion files:
[`UPSTREAM_VERSION`](../UPSTREAM_VERSION), [`upstream-map.md`](./upstream-map.md),
[`scripts/upstream-diff.sh`](../scripts/upstream-diff.sh),
[`scripts/check-arch.sh`](../scripts/check-arch.sh).

## Steps

1. **Update the upstream checkout.** In `../actual`: `git fetch` and note the target tag
   or commit (`git describe --tags`).

2. **Diff.** From this repo:

   ```bash
   scripts/upstream-diff.sh <new-tag-or-commit>          # --stat summary
   scripts/upstream-diff.sh <new-tag-or-commit> --names  # just changed files
   scripts/upstream-diff.sh <new-tag-or-commit> --patch  # full patch for a deep look
   ```

   The tail lists any **new migrations** since `UPSTREAM_VERSION`.

3. **Triage each change against [`upstream-map.md`](./upstream-map.md).** For every changed
   upstream file, decide:
   - **Port** — it touches domain logic we mirror (`server/budget`, `server/sync`,
     `server/rules`, `server/schedules`, `server/transactions`, `shared/*`, `aql`). Port
     the change into the mapped `src/core` file.
   - **Evaluate** — ambiguous (new feature, refactor). Note it and decide.
   - **Ignore** — desktop-client / Electron / server-only / build tooling. Not applicable
     to this port.

4. **Port with a test.** Each ported change gets a unit test (Vitest). Follow the existing
   patterns in `src/core/**/__tests__` and `src/core/**/*.test.ts`.

5. **Schema migrations.** For each new migration in `packages/loot-core/migrations`:
   - Reflect its DDL in `src/core/db/schema.ts` — table via `CREATE TABLE IF NOT EXISTS`
     in `TABLES`, new column in both the table def **and** `COLUMN_UPGRADES` (idempotent
     ALTER for existing installs), index in `INDEXES`.
   - Add the migration id to `BASE_MIGRATION_IDS` (or `CONDITIONAL_MIGRATIONS` if it needs
     a server feature).
   - Add the id + its schema effect to `RECENT_MIGRATIONS` in
     `src/core/db/__tests__/schemaParity.test.ts`.

6. **Verify.**

   ```bash
   npm test          # incl. schemaParity + schemaUpgrade
   npx tsc --noEmit  # no new errors over the pre-existing @react-navigation baseline
   npm run lint
   ```

7. **Record the new baseline.**
   - Bump [`UPSTREAM_VERSION`](../UPSTREAM_VERSION) to the reconciled commit.
   - Update [`upstream-map.md`](./upstream-map.md) rows (+ `Ported from` comments in code).
   - Update `docs/aql-parity.md` / `docs/PARITY-PLAN.md` if the change touched those areas.

## Notes

- Migrations are **not run incrementally** here — `runSchema` builds the whole current
  schema and seeds `__migrations__` so the server's `checkDatabaseValidity()` passes.
  `schemaParity.test.ts` is the guard that this stays in step with upstream.
- Keep every ported file's `// Ported from <upstream path>` comment current — it is the
  source of truth that seeds `upstream-map.md`.
