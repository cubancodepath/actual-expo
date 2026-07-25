# Undo/Redo — backlog de paridad con upstream

Auditoría de qué operaciones son `undoable` en upstream (`loot-core/src/server`) vs
nuestro port (`src/core/server`). Fecha: 2026-07 (tras portar redo + cerrar los
gaps arreglables).

**Regla de lectura:** una op solo puede hacerse `undoable` si la **función existe**
en el port. Casi todo lo pendiente aquí está bloqueado por **features no portadas**,
no por el sistema de undo. Redo hereda automáticamente la cobertura de undo, así que
no añade filas a esta tabla.

## Ya cubierto (no tocar)

- `moveCategory`, `moveCategoryGroup`, `updateRule`, `deleteRule` → envueltos.
- Reorder de categorías/grupos (`app/(auth)/budget/reorder.tsx`) → usa `moveCategory`/`moveCategoryGroup` (undoable).
- Cover overspending (`CoverOverspentScreen`/`CoverSourceScreen`) → usa `transferBetweenCategories` (undoable).
- `createRule` → existe sin envolver, pero **upstream tampoco lo envuelve**; envolverlo divergiría → dejar como está.

## Dominios completos ausentes

| Dominio   | Ops upstream con undo                                                                                     | Bloqueo            |
| --------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| dashboard | create, delete, rename, update, update-widget, reset, add-widget, remove-widget, copy-widget, import (10) | Dominio no portado |
| reports   | create, update, delete (3)                                                                                | Dominio no portado |
| filters   | filter-delete (1)                                                                                         | Dominio no portado |

## Funciones ausentes en dominios que sí existen

| Dominio        | Función (nombre upstream)                                                                                                                                          | Estado               | Nota                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------ |
| accounts       | `reopenAccount`                                                                                                                                                    | No existe            | No hay flujo de reabrir cuenta en la UI                                  |
| accounts       | `moveAccount`                                                                                                                                                      | No existe            | Reordenar cuentas no portado                                             |
| accounts       | `importTransactions`                                                                                                                                               | No existe            | Import CSV/banco no portado                                              |
| payees         | `batchChangePayees`                                                                                                                                                | No existe            | Port usa `updatePayee`/`deletePayee` (ya undoable)                       |
| tags           | `deleteAllTags`                                                                                                                                                    | No existe            | Feature no portada                                                       |
| tags           | `hideAllTags`                                                                                                                                                      | No existe            | Feature no portada                                                       |
| tags           | `unhideAllTags`                                                                                                                                                    | No existe            | Feature no portada                                                       |
| budget (cat)   | `sortCategories`                                                                                                                                                   | No existe            | Reorder usa `moveCategory`/`moveCategoryGroup` (ya undoable)             |
| budget (quick) | `setZero`                                                                                                                                                          | No existe            | "Quick budget" no portado                                                |
| budget (quick) | `set3MonthAvg` / `set6MonthAvg` / `set12MonthAvg` / `setNMonthAvg`                                                                                                 | No existe            | Promedios no portados                                                    |
| budget (quick) | `copyPreviousMonth` / `copySinglePreviousMonth` / `copyUntilYearEnd`                                                                                               | No existe            | Copiar mes no portado                                                    |
| budget (quick) | `coverOverbudgeted`                                                                                                                                                | No existe            | —                                                                        |
| budget (quick) | `coverOverspending`                                                                                                                                                | No existe como fn    | Flujo cubierto por `transferBetweenCategories` (ya undoable)             |
| budget (goals) | `runCheckTemplates`, `applyTemplate`, `applyMultipleCategoryTemplates`, `applySingleCategoryTemplate`, `overwriteTemplate`, `storeTemplates`, `createCleanupGroup` | No existen           | Plantillas de metas; `cleanupTemplate` solo parcial vía `persistCleanup` |
| rules          | `applyRuleActions`, `deleteAllRules`                                                                                                                               | No existen           | Feature no portada                                                       |
| preferences    | `saveSyncedPrefs`                                                                                                                                                  | Existe, sin envolver | Upstream lo hace undoable; deshacer un pref es UX dudosa en móvil        |

## Por revisar

- `setBudgetGoal` (`budget/actions.ts`) — existe sin envolver. Confirmar si es un
  helper interno (llamado desde `updateCategory`, ya undoable) o un entry-point
  directo desde la UI sin undo. Si es lo segundo, es un gap arreglable.

## Divergencias intencionales (NO son deuda)

- **Sin `undoTag`/restauración de UI**: upstream reabre modal/navega a la URL del
  cambio al deshacer; en móvil el patrón es el snackbar. `meta` en el marker queda
  como placeholder estructural.
- **Flags booleanos vs mutator-context**: no tenemos capa IPC/handlers, así que
  usamos `_undoListening`/`_undoDisabled` + `runMutator`. Misma semántica.
- **Granularidad más fina**: transacciones (add/update/delete/toggle/…) van como
  funciones `undoable` separadas; upstream las agrupa en `handleBatchUpdateTransactions`.
  Comportamiento equivalente.
- **Shake-to-undo (solo iOS)**: patrón Apple HIG, no existe en upstream.
