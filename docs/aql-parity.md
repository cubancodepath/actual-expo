# AQL & Reactivity — Parity with Actual Budget Web

## Ported ✅

| Feature           | Actual Web                                                  | Expo App                                                               |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| AQL Query Builder | `q()` fluent API                                            | `q()` fluent API                                                       |
| AQL Compiler      | QueryState → SQL                                            | QueryState → SQL (directo a SQLite)                                    |
| Compiler views    | `v_transactions_internal` (mapping tables, field overrides) | `views.ts` (inline, same SQL output)                                   |
| Compiler splits   | `tableOptions: { splits: "inline/none/all" }`               | Supported in compiler                                                  |
| LiveQuery         | Auto-refresh via `sync-event`                               | Auto-refresh via `syncEvents.ts`                                       |
| PagedQuery        | Paginación + LiveQuery                                      | Paginación + LiveQuery                                                 |
| sync-event bus    | `listen('sync-event', fn)`                                  | `listen(fn)` + `emit()`                                                |
| Event types       | `"applied"` (local) + `"success"` (remote)                  | `"applied"` + `"success"`                                              |
| React Query       | `useInfiniteQuery` for transactions                         | `useTransactions` with `useInfiniteQuery`                              |
| placeholderData   | `placeholderData: []` (no loading flash)                    | `data: []` initial + queryCache pre-load                               |
| Splash pre-load   | N/A (web)                                                   | `SplashScreen.preventAutoHideAsync` + queryCache                       |
| React hooks       | `useQuery`, `useAccounts`                                   | `useLiveQuery`, `useAccounts`, `useCategories`, `usePayees`, `useTags` |
| Schedule previews | `usePreviewTransactions` (client-side compute)              | `usePreviewTransactions` (liveQuery + useMemo)                         |
| Schedule statuses | `useCachedSchedules` (liveQuery)                            | `useSchedules` (2 liveQueries + useMemo)                               |
| Batch actions     | `useTransactionBatchActions` (no optimistic)                | `useTransactionBatchActions` (same pattern)                            |
| Selection mode    | Component state                                             | `useSelectionMode` hook                                                |
| Field naming      | `account`, `payee`, `is_parent`, `transfer_id`              | Same (mapped at DB boundary)                                           |
| Tests             | —                                                           | 401 tests passing                                                      |

## Stores Removed ✅

| Store             | Replaced by                                       | Status  |
| ----------------- | ------------------------------------------------- | ------- |
| `categoriesStore` | `useCategories()` liveQuery                       | Deleted |
| `tagsStore`       | `useTags()` liveQuery                             | Deleted |
| `payeesStore`     | `usePayees()` liveQuery                           | Deleted |
| `accountsStore`   | `useAccounts()` + `useAccountBalance()` liveQuery | Deleted |

## Screens Migrated ✅

| Screen                            | Pattern                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| Spending (`(spending)/index`)     | React Query + AQL + liveQuery previews + liveQuery uncleared count   |
| Account detail (`account/[id]`)   | React Query + AQL + liveQuery balance/uncleared + liveQuery previews |
| Account list (`(accounts)/index`) | `useAccounts` + `useAccountBalance` per row                          |
| All budget modals                 | `useCategories` + direct domain functions                            |
| All pickers                       | `useCategories` / `usePayees` / `useAccounts` liveQuery              |

## Remaining ❌

| Feature                            | Esfuerzo | Impacto | Notas                                                     |
| ---------------------------------- | -------- | ------- | --------------------------------------------------------- |
| **Category groups executor**       | Bajo     | Bajo    | `{ categories: "all" }` → groups con categories anidadas  |
| **Named parameters**               | Bajo     | Bajo    | `:paramName` con type inference — usamos valores directos |
| **UNICODE_LIKE / NORMALISE**       | Bajo     | Medio   | Búsqueda sin normalizar acentos                           |
| **$regexp, $transform**            | Bajo     | Bajo    | Operators avanzados, uso raro                             |
| **Spreadsheet engine**             | Alto     | Medio   | Motor de cálculo reactivo — cubierto por liveQuery        |
| **schedulesStore migration**       | Medio    | Medio   | CRUD screens todavía usan el store                        |
| **transactionsStore cleanup**      | Bajo     | Bajo    | Search screens todavía lo usan                            |
| **budgetStore migration**          | Alto     | Alto    | Cálculos de presupuesto complejos                         |
| **Old useTransactionList cleanup** | Bajo     | Bajo    | Código muerto (spending/account migrados)                 |

## Key Files

```
src/queries/
├── query.ts          # Query builder (q() fluent API)
├── schema.ts         # Table definitions, field types, refs
├── compiler.ts       # QueryState → SQL + views + mappings + splits
├── views.ts          # View definitions (transactions, payees, categories)
├── execute.ts        # Run SQL against expo-sqlite
├── liveQuery.ts      # Auto-refreshing query via syncEvents
├── pagedQuery.ts     # LiveQuery + pagination
├── queryCache.ts     # Pre-loaded data cache (splash screen bootstrap)
├── index.ts          # Re-exports
└── __tests__/        # 56 tests

src/sync/
├── syncEvents.ts     # Event bus (listen/emit)
├── batch.ts          # Emits "applied" after local mutations
└── fullSync.ts       # Emits "success" after remote sync

src/presentation/hooks/
├── useQuery.ts       # useLiveQuery (with cache initialData)
├── useTransactions.ts # React Query infinite query + sync-event
├── useAccounts.ts    # useAccounts + useAccountBalance + useAccountGroupBalance
├── useCategories.ts  # useCategories liveQuery
├── usePayees.ts      # usePayees liveQuery
├── useTags.ts        # useTags liveQuery
├── useSchedules.ts   # 2 liveQueries (schedules + linked transactions)
├── usePreviewTransactions.ts  # Derived from useSchedules (pure compute)
├── useSelectionMode.ts        # Selection state for lists
└── useTransactionBatchActions.ts # Bulk ops (no optimistic)

src/transactions/
└── queries.ts        # React Query infinite query options
```
