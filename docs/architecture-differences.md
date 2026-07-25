# Expo vs Original Actual Budget — Diferencias Arquitectónicas

Referencia para cuando algo no cuadre entre las dos apps. Documenta QUÉ hacemos diferente, POR QUÉ, y las trampas conocidas.

---

## 1. Cálculo del Presupuesto (To Budget)

|                  | Original                                                                                 | Expo                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Enfoque**      | Spreadsheet reactivo con celdas y dependencias                                           | Queries SQL cumulativas                                                            |
| **Archivo**      | `loot-core/src/server/budget/envelope.ts` + `base.ts`                                    | `src/budgets/index.ts`                                                             |
| **Fórmula**      | `to-budget = available + lastOverspent + totalBudgeted - buffered` (recursiva mes a mes) | `toBudget = cumIncome - cumBudgeted + overspendingPenalty - buffered` (cumulativa) |
| **Equivalencia** | Son matemáticamente idénticas — la cumulativa es la recursiva desenrollada               |

**Por qué diferente**: No tenemos el spreadsheet engine (~miles de líneas en `loot-core/src/server/spreadsheet/`). La fórmula cumulativa es más eficiente para mobile (2-3 queries SQL vs N queries por mes).

**Gotchas**:

- `computeCarryoverChain()` DEBE filtrar `histBudgets` a solo categorías de gasto no-tombstoned. Categorías eliminadas/fusionadas conservan filas en `zero_budgets` pero sus transacciones fueron remapeadas via `category_mapping`, creando "categorías fantasma" que corrompen el penalty.
- El original NO filtra `a.tombstone` en cuentas — cuentas cerradas siguen contando. Nuestras queries tampoco deben filtrar `a.tombstone = 0`.
- La fórmula depende de que `category_mapping` tenga self-mappings para todas las categorías (el original los crea en `insertCategory`).

---

## 2. Filtro de Transacciones

|                | Original                                  | Expo                               |
| -------------- | ----------------------------------------- | ---------------------------------- |
| **Mecanismo**  | Vista SQL `v_transactions_internal_alive` | Constante inline `ALIVE_TX_FILTER` |
| **Definición** | `aql/schema/index.ts`                     | `src/budgets/index.ts`             |

**Filtros equivalentes**:

- `tombstone = 0` (no eliminada)
- `isParent = 0` (excluir padres de splits — el original lo hace via `CASE WHEN isParent=1 THEN NULL` en category, nosotros excluimos directamente)
- `date IS NOT NULL`, `acct IS NOT NULL`
- Child con parent tombstoned excluida

**Gotcha**: Si el schema cambia, hay que actualizar `ALIVE_TX_FILTER` en todos los archivos que lo usen. La vista del original es un solo punto de cambio.

---

## 3. Resolución de Categorías (category_mapping)

|           | Original                                                                                              | Expo                                                     |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Dónde** | Dentro de la vista `v_transactions_internal`: `CASE WHEN isParent=1 THEN NULL ELSE cm.transferId END` | Inline en queries: `COALESCE(cm.transferId, t.category)` |

**Funcionalmente equivalentes** porque todas las categorías tienen self-mappings (`id → id`). El `COALESCE` del Expo es defensivo pero produce el mismo resultado.

---

## 3a. Presupuesto `#cleanup` DSL + setter type-aware

Port del `#cleanup` DSL de upstream (`server/budget/cleanup-*`) en `src/core/domain/budgets/cleanup/`. Redistribuye sobregasto: devuelve el sobrante de categorías "source" y lo reparte para cubrir sobregasto y rellenar sinks por peso.

|                   | Original                                                      | Expo                                                                                                       |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Parser**        | Gramática PEG.js (`cleanup-template.pegjs`)                   | Parser a mano en `parse.ts` (PEG no corre en Hermes) — mismas 5 variantes, mismo full-consume              |
| **Lecturas**      | `getSheetValue('to-budget'/'leftover-'/'budget-')`            | `getBudgetMonth(month)` (mismas celdas del spreadsheet) — paridad                                          |
| **Escrituras**    | `setBudget`/`setGoal` con `getBudgetTable()` por `budgetType` | Setter type-aware nuevo (`budgets/index.ts::setBudget`/`setBudgetGoal`), `zero_budgets`/`reflect_budgets`  |
| **Persist notas** | `db.updateWithSchema` (write inmediato)                       | `sendMessages` inmediato (NO `batchMessages`: el barrido de huérfanos lee el `cleanup_def` recién escrito) |

**Única divergencia real**: el parser a mano (forzado por runtime). Reads = paridad; el cleanup es **envelope-céntrico** en ambos (lee `to-budget`, que el tracking no tiene → degrada a 0 igual que upstream).

**Setter type-aware** (`setBudget`/`setBudgetGoal`, espejo de `getBudgetTable()`): base del tracking write-path (ver §3a-bis).

**Entrada core**: `cleanupTemplate(month)` (recompila notas → `computeCleanup` dry-run → `persistCleanup`). Falta cablear la UI (menú de mes, análogo a `useAutoAssign`).

---

## 3a-bis. Tracking/report budget: writers + read path (core, sin UI)

El core ya lee y escribe presupuestos tracking (`reflect_budgets`) además de envelope (`zero_budgets`), eligiendo tabla por `budgetType` (default `envelope`). La UI (Capa 3) aún no ramifica — es follow-up.

|                                              | Envelope                                                                                                                    | Tracking                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Tabla**                                    | `zero_budgets`                                                                                                              | `reflect_budgets` (columnas idénticas)                                                                |
| **Writers type-aware** (vía `budgetTable()`) | `setBudgetAmount`, `setCategoryCarryover`, `transferBetween/MultipleCategories`, `setGoalResult` (delega a `setBudgetGoal`) | igual, escriben `reflect_budgets`                                                                     |
| **Summary read** (`getBudgetMonth`)          | `to-budget` + `buffered`                                                                                                    | `total-saved` (=budget-income − budgeted) + `real-saved` (=income − spent); `toBudget`/`buffered` = 0 |

**Envelope-only (NO convertidos — concepto To-Budget/buffer que tracking no tiene, fiel a upstream)**: `holdForNextMonth`, `resetHold`, `resetIncomeCarryover`, `transferAvailable`, y `computeCarryoverChain` (solo lo usa el auto-assign de goals, envelope-shaped). Las celdas de categoría/grupo (`budget-`/`sum-amount-`/`leftover-`/`carryover-`) son **aliased** (mismos nombres) en ambos motores, así que solo el summary ramifica.

---

## 3a-ter. Utilidades de transacciones (merge / fix-split / export CSV)

Port de tres utilidades de `loot-core` en `src/core/domain/transactions/` (core-puras, sin UI):

- **`merge.ts::mergeTransactions(ids)`** — fusiona 2 duplicados (misma cuenta/importe). keep/drop por prioridad `financial_id` > `imported_description` > fecha menor. Coalesce keep-wins de `description/category/notes/cleared/reconciled/schedule`; re-parent de hijos si solo drop tiene splits; tombstone del drop (+ cascada). **Ambos casos** (no-transfer y transfer: nullear links → `mergeTransfers` recursivo → re-linkear → category cleanup on/off-budget). Mensajes CRDT directos en un `undoable`.
- **`fixSplits.ts::fixSplitTransactions()`** — 7 reparaciones (payees en blanco, sync de cleared, huérfanos→tombstone, transfers sin categoría, errores stale, padres con categoría) + **detección** (no fix) de splits descuadrados. SQL crudo sobre `transactions` (`isParent`/`isChild`) — no vista.
- **`export/csv.ts`** — serializador CSV propio (no hay `csv-stringify` en Hermes) con **guard anti-inyección** (`'` ante `^[=+\-@\t\r]`). `exportTransactionsToCSV` (plano) y `exportSplitAwareToCSV` (markers de split + `Split_Amount`). Amount = `int/100` **con signo** (NO `centsToDollars`, que hace `Math.abs`).

Única adaptación: el serializador CSV a mano (por Hermes). Lógica de columnas/merge/reparaciones = paridad con upstream. Falta cablear UI (acciones en listas/detalle).

---

## 3a-quater. Forecast engine (proyección de saldos)

Port de `loot-core/server/forecast/*` en `src/core/domain/forecast/` (core-puro, **read-only**). `generateForecast(params)` proyecta saldos futuros. Dos fuentes: **schedules** (serie diaria por cuenta) y **tracking-budget** (mensual, desde las celdas del presupuesto tracking).

|                     | Original                                                          | Expo                                                                                                                       |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Recurrencia**     | `@rschedule/core`                                                 | `recurrence-fns` (paquete propio, date-fns) tras `server/util/rschedule` — misma API, mismo código de app. Sin divergencia |
| **Fechas**          | `'yyyy-MM-dd'` strings; DB guarda int (`fromDateRepr`)            | Idéntico — DB int, string en lectura (compilador AQL / `intToStr`). Sin divergencia                                        |
| **Seed**            | Σ transacciones antes del start (no `account.balance`)            | Igual                                                                                                                      |
| **Occurrences**     | expandir schedules, dedup vs posted, rules, transfers (2 patas)   | Igual (reusa `posted.ts`, `runRules`, `getTransferAccount`)                                                                |
| **Filtros reporte** | `conditionsToAQL` + `matchesAQLFilter` (evaluador AQL en memoria) | Reusa el motor de rules (`Condition.eval`) — mismo matching, sin duplicar la maquinaria AQL                                |

**Read-only**: nada de escrituras. Seed = Σ posteadas antes del start; occurrences deduped contra posteadas (`isScheduleOccurrencePosted`); `firstForecastDate=max(start,hoy)` gatea occurrences (no reescribe historia). Transfers emiten ambas patas. `lowestBalance` = mínimo del balance combinado (sumado entre cuentas).

**Filtros de reporte**: el matching en memoria reusa `Condition.eval` (nuestro motor de rules ya evalúa condiciones contra una transacción — el mismo trabajo que `matchesAQLFilter`). El param `conditions` no tiene caller en la app todavía (no hay saved-filters/UI); gap conocido: el special-case `category IS null` (que upstream expande a not-transfer/not-parent) no está.

**Entrada core**: `generateForecast(params)`. Falta cablear la UI (el flag `balanceForecastReport` sigue sin engine detrás cableado a pantalla).

---

## 3b. Rules ↔ mappings (`migrateIds`)

Las **transacciones** resuelven merges de payee/categoría en LECTURA (vista/COALESCE, §2b y §3) — igual que el original, que **tampoco** reescribe `transactions.description`/`category` en un merge. Pero las **rules** guardan ids crudos en sus conditions/actions, así que un id fusionado hay que proyectarlo al target al usarlas.

|                       | Original                                                                                             | Expo                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Cache de mappings** | `server/db/mappings.ts`: `allMappings` en memoria + `onApplySync` que la parcha in-place             | `src/core/db/mappings.ts`: mismo `Map<string,string>` global, refrescado re-SELECTando ambas tablas         |
| **Rule-set**          | Persistente en memoria; `makeRule`→`migrateIds`, y un listener re-proyecta todas al cambiar mappings | Load-fresh: `getRules()` reconstruye cada vez y `makeRule` llama `migrateIds(rule, getMappings())` al vuelo |
| **Trigger del cache** | `addSyncListener` con `(oldValues,newValues)`                                                        | `syncEvents` (`"applied"` local + `"success"` remoto) filtrando `tables.some(t => t.includes("mapping"))`   |

**Equivalencia**: como reconstruimos las rules en cada `getRules()`/`getRuleById()` (y `useRules`, que ahora reusa `makeRule`), cada rule se proyecta siempre con los mappings vigentes en el momento de uso — observablemente igual a mantener el rule-set en memoria y re-proyectarlo por evento. `migrateIds` (`rules/rule-utils.ts`) es idempotente porque re-proyecta desde `cond.rawValue` (id original inmutable), preservado para undo/re-proyección determinista. La fila persistida de la rule **nunca** se reescribe: guarda el id original, la proyección es solo en lectura.

**Bootstrap/teardown**: `openBudget()` llama `loadMappings()` tras `loadClock()` (antes de rules/pre-fetch/fullSync); `closeDatabase()` llama `clearMappings()`. `getRules()` awaita `ensureMappingsLoaded()`, así que si el bootstrap se salta (tests) degrada a lazy-load, nunca a mappings stale.

**Limitación conocida**: el memo de `useRules` re-corre en cambios de la tabla `rules`, no de las tablas `*mapping`. En la práctica los flujos de merge/delete remontan los forms que consumen el hook, así que la proyección está fresca en el próximo mount.

**Sitios que también resuelven en lectura** (no vía la vista, SQL a mano): `learn.ts` y `getUncategorizedStats` fueron corregidos para pasar por `payee_mapping`/`category_mapping` (antes joins crudos `p.id = t.description` → un payee fusionado quedaba tombstoned y descuadraba el conteo/aprendizaje).

---

## 4. Sync (CRDT)

|                   | Original                                             | Expo                                                        |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| **Librería**      | `@actual-app/crdt` (paquete publicado)               | Port directo de loot-core en `src/crdt/` y `src/loot-core/` |
| **Protobuf**      | `protobufjs` con clases generadas                    | `protobufjs` con schemas custom en `src/proto/`             |
| **Reintentos**    | Un intento                                           | Hasta 5 reintentos en divergencia de merkle                 |
| **Serialización** | `'0:'` (null), `'N:x'` (number), `'S:text'` (string) | Idéntica                                                    |

**6 bug fixes críticos en el port**:

1. `murmurhash.v3()` hash correcto
2. Counter hex en UPPERCASE
3. Clock global a nivel de módulo
4. `insert()` sin padding
5. `keyToTimestamp()` right-pad con zeros
6. `diff()` iterativo con break

---

## 5. Encriptación

|               | Original                | Expo                                                 |
| ------------- | ----------------------- | ---------------------------------------------------- |
| **Crypto**    | Node.js `crypto` nativo | `@noble/ciphers` + `@noble/hashes` (JavaScript puro) |
| **Algoritmo** | AES-256-GCM + PBKDF2    | Idéntico                                             |
| **Random**    | Node.js `crypto`        | `globalThis.crypto` (Web Crypto API via Hermes)      |

**Gotcha**: Si `encryptKeyId` no está configurado, sync funciona sin encriptación.

---

## 6. Estado y Reactividad

|           | Original                                                             | Expo                                                                         |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Motor** | Spreadsheet reactivo (celdas con dependencias automáticas)           | Zustand stores con refresh manual                                            |
| **Flujo** | Mutación → celda cambia → dependientes se recalculan automáticamente | `sendMessages()` → `applyMessages()` → `refreshAllStores()` → `store.load()` |
| **Cache** | LRU de 100 queries preparadas                                        | Sin cache de queries                                                         |

**Por qué diferente**: El spreadsheet engine es demasiado complejo para mobile. Zustand + SQL explícito es más simple, predecible, y suficiente para el caso mobile donde no hay edición concurrente multi-ventana.

**Gotcha**: Después de CUALQUIER mutación via `sendMessages()`, hay que llamar `refreshAllStores()` o el store específico con `.load()`. No hay recalculación automática.

---

## 7. Acceso a Datos

|                  | Original                                                            | Expo                                         |
| ---------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| **Motor SQLite** | `sql.js` (sync, in-memory)                                          | `expo-sqlite` (async, nativo)                |
| **API**          | `db.runQuery(sql, params, fetchAll)` sync                           | `runQuery<T>()`, `first<T>()`, `run()` async |
| **Vistas**       | Usa vistas SQL (`v_transactions_internal_alive`, etc.)              | Queries directas con filtros inline          |
| **Schema**       | Nombres de columna originales (`isParent`, `isChild`, `transferId`) | Idénticos                                    |

---

## 8. ~~Formato de IDs en zero_budget_months~~ (FIXED)

Ahora ambos usan `'YYYY-MM'` (e.g., `'2026-03'`). Se corrigió pasando `month` directamente en vez de `String(monthToInt(month))`.

---

## 9. OpenID sign-in callback — limitación aceptada, server-constrained

El sign-in con OpenID entrega el token de sesión al cliente vía deep link de
esquema custom (`actualbudget://<hostname>/openid-cb?token=…`), abierto con
`WebBrowser.openAuthSessionAsync` (`ASWebAuthenticationSession` en iOS). Se
investigó si el sync-server de Actual soporta un nonce `state` o PKCE
expuesto al cliente para autenticar ese callback (upstream checkout:
`actual/packages/sync-server/`, commit local al momento de la investigación):

1. **¿El servidor hace echo de query params arbitrarios de `returnUrl` de
   vuelta al callback?** No, en el sentido literal de query params. El
   servidor concatena strings: `` `${return_url}/openid-cb?token=${token}` ``
   (`actual/packages/sync-server/src/accounts/openid.ts:336`). Si el cliente
   envía `returnUrl` con un `?state=…` propio, la concatenación produce una
   URL rota (el `/openid-cb?token=` queda dentro del valor del primer query
   param en vez de crear un query param nuevo), y `token` deja de poder
   extraerse. `returnUrl` se valida solo por **hostname** en
   `isValidRedirectUrl` (`accounts/openid.ts:359-381`), llamada tanto en el
   setup (`app-account.js:98`) como en el finalize
   (`app-openid.ts:107`) — no valida ni preserva query params.
2. **¿Soporta PKCE o firma de respuesta?** Sí, pero es interno
   servidor↔proveedor OIDC, no expuesto a la app. `loginWithOpenIdSetup`
   genera `state` + `code_verifier`/`code_challenge` (S256) por intento y los
   guarda en `pending_openid_requests` (`accounts/openid.ts:151-176`); ese
   `state` viaja entre el navegador del sistema y el IdP/servidor
   (`app-openid.ts:99-113`, `accounts/openid.ts:178-234`), nunca llega al
   deep link `actualbudget://…/openid-cb`.
3. **¿El token en el query string es el único mecanismo de entrega?** Sí —
   `accounts/openid.ts:336` construye la única redirección hacia la app, con
   `token` como el único dato relevante en el query string.

**Conclusión**: el servidor no ofrece ningún mecanismo cliente-verificable de
autenticidad de respuesta para este deep link (ni state-echo ni PKCE
expuesto). El cliente Expo implementa la defensa más fuerte disponible dado
esto: `isExpectedOpenIdCallback` (en
`src/screens/auth/OpenIdSignInScreen/hooks/isExpectedOpenIdCallback.ts`)
valida esquema (`actualbudget:`), hostname y path (`/openid-cb`) del
callback ANTES de leer `token` — mitiga otras apps registrando el mismo
esquema custom y entregando URLs con hostname/path distintos, pero no
sustituye a un nonce firmado por el servidor.

**Revisitar cuando** upstream agregue soporte de `state`/PKCE expuesto al
`returnUrl`, o cuando Universal Links/App Links (que sí requieren control de
dominio, fuera del alcance del modelo self-hosted) reemplacen el esquema
custom.
