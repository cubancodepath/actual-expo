# Expo vs Original Actual Budget — Diferencias Arquitectónicas

Referencia para cuando algo no cuadre entre las dos apps. Documenta QUÉ hacemos diferente, POR QUÉ, y las trampas conocidas.

---

## 1. Cálculo del Presupuesto (To Budget)

| | Original | Expo |
|---|---|---|
| **Enfoque** | Spreadsheet reactivo con celdas y dependencias | Queries SQL cumulativas |
| **Archivo** | `loot-core/src/server/budget/envelope.ts` + `base.ts` | `src/budgets/index.ts` |
| **Fórmula** | `to-budget = available + lastOverspent + totalBudgeted - buffered` (recursiva mes a mes) | `toBudget = cumIncome - cumBudgeted + overspendingPenalty - buffered` (cumulativa) |
| **Equivalencia** | Son matemáticamente idénticas — la cumulativa es la recursiva desenrollada |

**Por qué diferente**: No tenemos el spreadsheet engine (~miles de líneas en `loot-core/src/server/spreadsheet/`). La fórmula cumulativa es más eficiente para mobile (2-3 queries SQL vs N queries por mes).

**Gotchas**:
- `computeCarryoverChain()` DEBE filtrar `histBudgets` a solo categorías de gasto no-tombstoned. Categorías eliminadas/fusionadas conservan filas en `zero_budgets` pero sus transacciones fueron remapeadas via `category_mapping`, creando "categorías fantasma" que corrompen el penalty.
- El original NO filtra `a.tombstone` en cuentas — cuentas cerradas siguen contando. Nuestras queries tampoco deben filtrar `a.tombstone = 0`.
- La fórmula depende de que `category_mapping` tenga self-mappings para todas las categorías (el original los crea en `insertCategory`).

---

## 2. Filtro de Transacciones

| | Original | Expo |
|---|---|---|
| **Mecanismo** | Vista SQL `v_transactions_internal_alive` | Constante inline `ALIVE_TX_FILTER` |
| **Definición** | `aql/schema/index.ts` | `src/budgets/index.ts` |

**Filtros equivalentes**:
- `tombstone = 0` (no eliminada)
- `isParent = 0` (excluir padres de splits — el original lo hace via `CASE WHEN isParent=1 THEN NULL` en category, nosotros excluimos directamente)
- `date IS NOT NULL`, `acct IS NOT NULL`
- Child con parent tombstoned excluida

**Gotcha**: Si el schema cambia, hay que actualizar `ALIVE_TX_FILTER` en todos los archivos que lo usen. La vista del original es un solo punto de cambio.

---

## 3. Resolución de Categorías (category_mapping)

| | Original | Expo |
|---|---|---|
| **Dónde** | Dentro de la vista `v_transactions_internal`: `CASE WHEN isParent=1 THEN NULL ELSE cm.transferId END` | Inline en queries: `COALESCE(cm.transferId, t.category)` |

**Funcionalmente equivalentes** porque todas las categorías tienen self-mappings (`id → id`). El `COALESCE` del Expo es defensivo pero produce el mismo resultado.

---

## 4. Sync (CRDT)

| | Original | Expo |
|---|---|---|
| **Librería** | `@actual-app/crdt` (paquete publicado) | Port directo de loot-core en `src/crdt/` y `src/loot-core/` |
| **Protobuf** | `protobufjs` con clases generadas | `protobufjs` con schemas custom en `src/proto/` |
| **Reintentos** | Un intento | Hasta 5 reintentos en divergencia de merkle |
| **Serialización** | `'0:'` (null), `'N:x'` (number), `'S:text'` (string) | Idéntica |

**6 bug fixes críticos en el port**:
1. `murmurhash.v3()` hash correcto
2. Counter hex en UPPERCASE
3. Clock global a nivel de módulo
4. `insert()` sin padding
5. `keyToTimestamp()` right-pad con zeros
6. `diff()` iterativo con break

---

## 5. Encriptación

| | Original | Expo |
|---|---|---|
| **Crypto** | Node.js `crypto` nativo | `@noble/ciphers` + `@noble/hashes` (JavaScript puro) |
| **Algoritmo** | AES-256-GCM + PBKDF2 | Idéntico |
| **Random** | Node.js `crypto` | `globalThis.crypto` (Web Crypto API via Hermes) |

**Gotcha**: Si `encryptKeyId` no está configurado, sync funciona sin encriptación.

---

## 6. Estado y Reactividad

| | Original | Expo |
|---|---|---|
| **Motor** | Spreadsheet reactivo (celdas con dependencias automáticas) | Zustand stores con refresh manual |
| **Flujo** | Mutación → celda cambia → dependientes se recalculan automáticamente | `sendMessages()` → `applyMessages()` → `refreshAllStores()` → `store.load()` |
| **Cache** | LRU de 100 queries preparadas | Sin cache de queries |

**Por qué diferente**: El spreadsheet engine es demasiado complejo para mobile. Zustand + SQL explícito es más simple, predecible, y suficiente para el caso mobile donde no hay edición concurrente multi-ventana.

**Gotcha**: Después de CUALQUIER mutación via `sendMessages()`, hay que llamar `refreshAllStores()` o el store específico con `.load()`. No hay recalculación automática.

---

## 7. Acceso a Datos

| | Original | Expo |
|---|---|---|
| **Motor SQLite** | `sql.js` (sync, in-memory) | `expo-sqlite` (async, nativo) |
| **API** | `db.runQuery(sql, params, fetchAll)` sync | `runQuery<T>()`, `first<T>()`, `run()` async |
| **Vistas** | Usa vistas SQL (`v_transactions_internal_alive`, etc.) | Queries directas con filtros inline |
| **Schema** | Nombres de columna originales (`isParent`, `isChild`, `transferId`) | Idénticos |

---

## 8. ~~Formato de IDs en zero_budget_months~~ (FIXED)

Ahora ambos usan `'YYYY-MM'` (e.g., `'2026-03'`). Se corrigió pasando `month` directamente en vez de `String(monthToInt(month))`.
