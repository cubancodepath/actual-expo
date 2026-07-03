# Upstream map — Actual `loot-core` ↔ `src/core`

Correspondence between Actual Budget's `loot-core` (checked out at `../actual`) and
this port's `src/core`. Use it to triage `scripts/upstream-diff.sh` output when a new
upstream release lands: for each changed upstream file, find its port here and decide
**port / evaluate / ignore**.

- **Reconciled at**: see [`UPSTREAM_VERSION`](../UPSTREAM_VERSION) (upstream commit `src/core` is current with).
- **Seed**: rows below come from `Ported from` / `upstream` comments in `src/core` (grep them:
  `grep -rn "Ported from\|upstream" src/core`) plus the correspondences in
  `docs/DX-HEROUI-MIGRATION-PLAN.md` §6.
- This port is **UI/mobile-specific**: it mirrors `server/` domain logic and `shared/`
  helpers, not the desktop client, Electron, or the sync *server*.

| Upstream (`packages/loot-core/src/...` unless noted) | Port (`src/core/...`) | Notes |
|---|---|---|
| `server/sync/index.ts` | `sync/apply.ts`, `sync/fullSync.ts`, `sync/batch.ts`, `sync/syncMode.ts` | CRDT apply, compareMessages, batching, global sync mode |
| `server/sync/repair.ts` | `sync/repair.ts` | sync repair UX |
| `server/undo.ts` | `sync/undo.ts` | simplified for mobile |
| `server/budget/base.ts`, `server/budget/envelope.ts` | `domain/budgets/`, `domain/spreadsheet/` | envelope/base budget calc |
| `server/budget/goal-template*` | `domain/goals/{engine,parse,apply}.ts` | goal template engine + parser |
| `server/transactions/transaction-rules.ts` | `domain/rules/{prepare,apply}.ts`, `domain/transactions/` | auto-categorization rules |
| `server/transactions/transfer.ts` | `domain/transactions/` | transfer handling |
| `server/rules/{rule,condition,action,rule-utils,rule-indexer,handlebars-helpers}.ts` | `domain/rules/` | rule engine internals |
| `server/schedules/find-schedules.ts` | `domain/schedules/` | schedule detection/recurrence |
| `server/spreadsheet/` | `domain/spreadsheet/` | live spreadsheet engine |
| `server/db/sort.ts` | `domain/categories/` (sort) | category/group sort |
| `server/errors.ts` | `errors/` | AppError/SyncError mapping |
| `server/aql/` | `queries/` | AQL compiler + liveQuery/pagedQuery |
| `desktop-client/src/spreadsheet/bindings.ts` | `queries/views.ts` | spreadsheet bindings → SQL views |
| `shared/schedules.ts` | `domain/schedules/` | recurrence logic (shared) |
| `shared/transactions.ts` | `domain/transactions/` | split/transfer helpers (shared) |
| `shared/location-utils.ts` | `domain/payee-locations/` | nearby-payee suggestions |
| `shared/util.ts` | `lib/` (various) | misc helpers |
| `types/models/templates.ts` | `domain/goals/types.ts` | goal template types |
| `migrations/*` | `db/schema.ts` | **not run incrementally** — schema is created whole; IDs seeded into `__migrations__`. Parity guarded by `db/__tests__/schemaParity.test.ts` |

## How to keep a row honest

Each ported file in `src/core` should carry a `// Ported from <upstream path>` (or
`upstream: <path:lines>`) comment. When you port a new area, add both the comment and a
row here. When upstream refactors a file this port mirrors, `upstream-diff.sh` will surface
it and this table tells you where it lands.
