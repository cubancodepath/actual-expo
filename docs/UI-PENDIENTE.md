# Estado: core hecho, UI pendiente

Registro de features cuyo **núcleo (core) está implementado y testeado**, pero cuya
**UI aún no está cableada**. Sirve para saber qué falta en pantallas para que cada
feature sea usable de verdad por el usuario final.

> Actualizado tras la tanda de paridad de core (rules↔mappings, `#cleanup`,
> tracking budget, utilidades de transacciones). Todo lo de abajo vive en
> `src/core/` con tests; nada requiere cambios de core adicionales — solo UI.

---

## 1. `#cleanup` DSL (redistribución de sobregasto)

- **Core (hecho)**: `src/core/domain/budgets/cleanup/` — parser de notas `#cleanup`,
  grupos, `storeNoteCleanups`, y `cleanupTemplate(month)` (recompila → calcula →
  persiste). Devuelve un `summary` string.
- **UI pendiente**:
  - Acción en el **menú del mes de presupuesto** que llame `cleanupTemplate(month)`
    y muestre el `summary`/warnings (análogo a `useAutoAssign` en
    `AssignMoneyScreen/hooks/`).
  - (Opcional) editar las notas `#cleanup` por categoría desde el detalle de
    categoría — hoy solo se leen de la nota; no hay editor dedicado.
- **Esfuerzo UI**: S (un botón + toast de resultado).

## 2. Tracking / report budget (editar un presupuesto tracking)

- **Core (hecho)**: writers type-aware (`setBudgetAmount`, `setCategoryCarryover`,
  transfers, `setGoalResult`) que escriben `zero_budgets` o `reflect_budgets` según
  `budgetType`; y `getBudgetMonth` ramifica el summary (tracking →
  `total-saved`/`real-saved`, sin `to-budget`). El motor de celdas ya despacha por
  tipo (`spreadsheet/sync.ts::getEngine`).
- **UI pendiente** (Capa 3 — es lo más grande de esta lista):
  - Hook reactivo **`useBudgetType()`** (no existe) para que las pantallas sepan el
    tipo del archivo.
  - **Ocultar/reemplazar** en modo tracking: `ReadyToAssignBar` (chip To-Budget +
    menú hold + pill), el flujo **AssignMoney** (`AssignMoneyScreen`,
    `ProjectedToAssignBar`, `AutoAssignButton`), `HoldScreen`, y los flujos de
    cover-overspent / `TO_BUDGET_ID` (`CategoryPickerScreen`, `CoverOverspentScreen`,
    `CoverSourceScreen`, `useOverspentCategories`, la rama `transferAvailable` de
    `useTransferFlow`).
  - **Nuevo summary bar tracking** que lea `total-saved`/`real-saved`.
  - Re-etiquetar el manejo de income (en tracking el income se **presupuesta**).
- **Esfuerzo UI**: L (mucha superficie de pantallas + branching por tipo).
- **Nota**: los conceptos To-Budget/buffer (hold, transfer-available) NO existen en
  tracking — la UI debe **ocultarlos**, no adaptarlos.

## 3. Merge de transacciones duplicadas

- **Core (hecho)**: `src/core/domain/transactions/merge.ts::mergeTransactions(ids)` —
  valida, elige keep/drop, fusiona campos, maneja splits y transfers, devuelve el id
  conservado.
- **UI pendiente**:
  - En la **lista de transacciones**: selección múltiple (2 filas) → acción "Fusionar"
    que llame `mergeTransactions([a, b])` y refresque.
  - Idealmente detección/sugerencia de duplicados (no imprescindible).
- **Esfuerzo UI**: S–M (multi-select + acción).

## 4. fix-split-transactions (reparar splits corruptos)

- **Core (hecho)**: `src/core/domain/transactions/fixSplits.ts::fixSplitTransactions()`
  — 7 reparaciones + detección de splits descuadrados; devuelve counts.
- **UI pendiente**:
  - Botón en **Ajustes → herramientas/mantenimiento** ("Reparar transacciones
    divididas") que corra la función y muestre los counts / la lista de
    `mismatchedSplits`.
- **Esfuerzo UI**: S (un botón en settings + resumen).

## 5. Export CSV

- **Core (hecho)**: `src/core/domain/transactions/export/csv.ts` —
  `exportTransactionsToCSV` (plano) y `exportSplitAwareToCSV` (con markers de split),
  más `csvStringify` con guard anti-inyección. Producen el string CSV.
- **UI pendiente**:
  - Acción "Exportar CSV" (en cuenta o en la lista filtrada) que arme los lookups
    (nombres de cuenta/payee/categoría), genere el CSV y lo comparta (`expo-sharing` /
    guardar archivo).
- **Esfuerzo UI**: S (recolectar lookups + share sheet).

---

## Sin UI pendiente (ya transparentes)

- **rules ↔ mappings (`migrateIds`)**: corrección de correctness — las rules se
  proyectan a los ids fusionados automáticamente al cargarse. No necesita UI nueva.

## Fuera de alcance (core tampoco hecho)

Estas ni siquiera tienen core aún — no son "UI pendiente", son features completas por
portar (ver `feature-roadmap.md`): import CSV/OFX/QFX + reconcile, forecast,
importadores YNAB4/YNAB5, bank sync, saved filters, custom reports/dashboard,
custom formulas / currency.
