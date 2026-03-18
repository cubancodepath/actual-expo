# AQL & Reactivity — Parity with Actual Budget Web

## Ported ✅

| Feature | Actual Web | Expo App |
|---------|-----------|----------|
| AQL Query Builder | `q()` fluent API | `q()` fluent API |
| AQL Compiler | QueryState → SQL | QueryState → SQL (directo a SQLite) |
| LiveQuery | Auto-refresh via `sync-event` | Auto-refresh via `syncEvents.ts` |
| PagedQuery | Paginación + LiveQuery | Paginación + LiveQuery |
| sync-event bus | `listen('sync-event', fn)` | `listen(fn)` + `emit()` |
| Event types | `"applied"` (local) + `"success"` (remote) | `"applied"` + `"success"` |
| optimisticUpdate | En LiveQuery/PagedQuery | En LiveQuery/PagedQuery + `mutate.ts` |
| Batch CRDT messages | `batchMessages()` | `batchMessages()` |
| React hooks | `useQuery()` | `useLiveQuery()` + `usePagedLiveQuery()` |
| Store auto-refresh | N/A (no Zustand) | `storeRegistry` subscribe a syncEvents |
| Declarative mutations | N/A | `mutate.update/remove` (extra, no existe en web) |
| Tests | — | 56 tests (builder, compiler, liveQuery, syncEvents) |

## Missing ❌

| Feature | Esfuerzo | Impacto | Notas |
|---------|----------|---------|-------|
| **Screens consumiendo AQL** | Grande | Alto | Ningún screen usa `useLiveQuery` aún — siguen con raw SQL + stores manuales |
| **Mapping tables en compiler** | Medio | Alto | `payee_mapping` / `category_mapping` COALESCE JOINs no se generan bien |
| **Views SQL** | Medio | Alto | `v_transactions_internal`, `v_payees` no existen — queries van directo a tablas |
| **Split transactions** | Medio | Medio | `tableOptions: { splits: "inline" }` executor especial no implementado |
| **Category groups executor** | Bajo | Bajo | `{ categories: "all" }` → groups con categories anidadas |
| **Named parameters** | Bajo | Bajo | `:paramName` con type inference — usamos valores directos |
| **UNICODE_LIKE / NORMALISE** | Bajo | Medio | Búsqueda sin normalizar acentos |
| **$regexp, $transform** | Bajo | Bajo | Operators avanzados, uso raro |

## Key Files

```
src/queries/
├── query.ts          # Query builder (q() fluent API)
├── schema.ts         # Table definitions, field types, refs
├── compiler.ts       # QueryState → SQL + params + dependencies
├── execute.ts        # Run SQL against expo-sqlite
├── liveQuery.ts      # Auto-refreshing query
├── pagedQuery.ts     # LiveQuery + pagination
├── index.ts          # Re-exports
└── __tests__/        # 56 tests

src/sync/
├── syncEvents.ts     # Event bus (listen/emit)
├── batch.ts          # Emits "applied" after local mutations
└── fullSync.ts       # Emits "success" after remote sync

src/stores/
├── storeRegistry.ts  # Subscribes to syncEvents
└── mutate.ts         # Declarative optimistic mutations

src/presentation/hooks/
└── useQuery.ts       # useLiveQuery, usePagedLiveQuery
```

## Next Step

Migrar un screen para consumir `useLiveQuery` — ej. reemplazar `categoriesStore` con `useLiveQuery(q("categories"))` para probar el sistema end-to-end y validar que todo funciona en producción.
