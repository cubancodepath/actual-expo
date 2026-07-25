# Rules engine — backlog (lo que falta)

Estado tras el port fiel del motor (2026-07). El **motor de rules está completo y verde** en `src/core`;
lo pendiente es **conexión a la UI** y unos pocos enganches de ciclo de vida / paridad fina. Ningún ítem
aquí bloquea el motor: son pasos de integración.

## Ya hecho (referencia — no re-hacer)

- `src/core/shared/rules.ts` (TYPE_INFO, fieldInfo, FIELD_TYPES, isValidOp, getValidOps, deserializeField,
  getFieldError, sortNumbers, parse, unparse, makeValue, getApproxNumberThreshold).
- `rules/rule.ts` split-aware (`execActions`/`execSplitActions`/`getSplitRemainder`).
- Store stateful en `transactions/transaction-rules.ts`: `resetState`, `loadRules`, `getRules`,
  `unloadRules`, `onApplySync`, indexers, `getRuleIdFromScheduleId`, `getAllRuleIdsFromSchedules`.
- `runRules(trans, accounts?)` (async, stateful, schedule-linkage, prefetch, finalize) + `applyRankedRules`.
- Superficie: `getRulesForPayee`, `updatePayeeRenameRule` (+`getIsSetterRules`/`getOneOfSetterRules`),
  `conditionSpecialCases`, `conditionsToAQL`, `updateCategoryRules`, `applyActions`.
- `transactions/index.ts`: `batchUpdateTransactions`.
- `rules/index.ts`: `createRule` (con `stage`), `updateRule`, `deleteRule`, `deleteAllRules`,
  `validateRule`, `makeRule`, `ruleModel`, `serializeConditionsOrActions`, `parseConditionsOrActions`.

## Pendiente

### 1. Conexión a la UI (el bloque grande)

El motor no está cableado a ninguna pantalla. Falta:

- **Gestión de reglas**: pantalla de lista + crear/editar/borrar (usa `getRules`, `createRule`,
  `updateRule`, `deleteRule`, `validateRule`, `getValidOps`/`getFieldError`/`parse`/`unparse`/`makeValue`).
- **Apply-to-selected**: acción "aplicar reglas a transacciones seleccionadas" → `applyActions`
  (equivalente al handler upstream `rule-apply-actions`).
- **Payee rename**: UI de renombrado de payee → `updatePayeeRenameRule`.
- **Run rules manual**: disparador "correr reglas" (equivalente a `rules-run`).
- **conditions → AQL**: consumidores de `conditionsToAQL` (filtros guardados, búsqueda,
  schedule↔transaction matching). Recordar que `$regexp` (matches/hasTags/hasAnyTag) lanza
  `RegexpUnsupportedError` en expo-sqlite → fallback por-widget.

### 2. Ciclo de vida del store (engine, no UI)

Hoy `getRules`/`runRules` hacen **lazy-load** y `unloadRules()` solo se llama desde el harness de tests
(`testDb.ts`). Falta el enganche en producción:

- `loadRules()` al abrir budget — en `src/stores/operations/budgetfiles.ts::loadBudget`, tras
  `initSpreadsheet` (capa engine).
- `unloadRules()` al cerrar budget — donde se hace el teardown (junto a `clearUndo`/`resetState` del
  resto de módulos).
  El lazy-load funciona sin esto, pero el wiring explícito evita el primer `getRules` lento y libera el
  listener de sync en el cierre.

### 3. `orphaned-payees` (necesita UI)

`batchUpdateTransactions` omite la detección de payees huérfanos del upstream (emite un evento IPC
`orphaned-payees` para un diálogo de limpieza que el port no tiene). Añadir `detectOrphanPayees` +
`getOrphanedPayees` + el evento cuando exista esa pantalla.

### 4. Paridad fina opcional

- **`getRules` async → sync**: el upstream lo tiene sync (in-memory). El port lo dejó async con
  lazy-load (decisión pragmática: evita tocar ~5 callers + bootstrap). Si se quiere paridad estricta:
  cablear `loadRules` en bootstrap (ítem 2), hacer `getRules` sync, y quitar `await` en
  `forecast-schedules`/`schedules/index`/`preview`/`transactions/index` + tests.
- **Split-por-`applyActions`**: crear splits vía apply funciona por upsert CRDT (columnas ya cubiertas
  en `updateTransaction`), pero no hay test dedicado de creación de split vía `applyActions`. Añadir uno
  si ese flujo se usa desde la UI.

### 5. Handlers/aliases upstream no expuestos (nice-to-have)

- `applyRuleActions` / `addRulePayeeRename` / `rule-add-payee-rename`: son nombres de **handler IPC**;
  el port expone las funciones (`applyActions`, `updatePayeeRenameRule`) directamente. Solo añadir
  aliases si algún consumidor los importa por el nombre de handler.

## Divergencias intencionales (NO son deuda)

- **`onApplySync` por invalidación** (`allRules=null`) en cambios de `rules`/`*mapping*`, en vez del patch
  incremental del upstream — nuestro bus de sync solo lleva `tables`, no filas. Correcto y sin race.
- **Sin `runTransfers` separado** en `batchUpdateTransactions`: el port corre los hooks de transfer dentro
  de add/update/deleteTransaction, así que se obtienen por delegación.
- **`createRule` no envuelto… sí lo está**: en el port `createRule` sí escribe por CRDT + `undoable`;
  upstream no marca `rule-create` como undoable — divergencia menor a favor del port, sin impacto.
- Fechas-string (`monthUtils`), Hermes-safe (`hyperformula` local), rescale dólares→cents en formulas.
