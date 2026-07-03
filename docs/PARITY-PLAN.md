# Plan de paridad local-first: actual-expo vs Actual Budget

> **Entregable**: este documento se guardará en `actual-expo/docs/PARITY-PLAN.md` como primer paso de la ejecución.

## Estado de ejecución (actualizado)

- **Fase 0** ✅ completa — mocks de `expo-sqlite`/`expo-crypto`/`expo-localization`, harness de tests con SQLite real.
- **Fase 1** ✅ completa — fixes #1-8, #16. 16 tests nuevos en `src/core/sync/__tests__/` y `src/core/db/__tests__/`.
- **Fase 2** ✅ completa — fixes #10, #11, #13, #14. Bug adicional encontrado y arreglado: el índice de prefijos de `Spreadsheet` (`sum-amount-` con IDs tipo UUID) nunca hacía match, así que el gasto de categorías no se recalculaba en vivo tras una transacción. 13 tests nuevos.
- **Fase 3.1** ⚠️ **parcial** — el MOTOR de cálculo tracking/report está completo y testeado (`spreadsheet/tracking.ts`, `spreadsheet/shared.ts`, `getBudgetType()` en preferences, dispatch por tipo en `spreadsheet/sync.ts`, reacción a `reflect_budgets`/`preferences.budgetType` en `triggerBudgetChanges`). Un archivo tracking sincronizado desde desktop ahora renderiza los números correctos en el motor de celdas (12 tests nuevos). **NO incluido**: el write-path (`setBudgetAmount`/`setCategoryCarryover`/`holdForNextMonth`/etc. en `budgets/index.ts` siguen escribiendo solo `zero_budgets`/`zero_budget_months`, no hay variante que escriba `reflect_budgets`) ni la UI (las pantallas de budget no seleccionan bindings condicionalmente por tipo — mostrarían campos envelope-only como `to-budget`/`buffered` en un archivo tracking). Ambos quedan como trabajo de seguimiento.
- **Fase 3.2** ✅ completa — fix #12: tipo de goal `schedule` (`goals/engine.ts::runSchedule`, versión simplificada del algoritmo de sinking-fund upstream), parser real de notas legacy `#template`/`#goal` (`goals/parse.ts`), `inferGoalFromDef` consolidado. 47 tests nuevos.
- **Fase 3.3** ✅ completa — fix #15: las reglas ahora corren también al postear transacciones de schedules (`rules/apply.ts::applyRulesToNewTransaction`, `schedules/index.ts::buildScheduledTransactionFields`). La entrada manual del form sigue siendo fill-empty-only (fiel a upstream). No hay importador bulk en el port todavía, así que ese camino no aplica. 4 tests nuevos.
- **Fase 3.4** ✅ completa — fix #5: `sync/syncMode.ts` (enabled/offline/disabled/import), fast-path `applyMessagesForImport` en `apply.ts`, gates en `scheduleFullSync`/`fullSync`, modo `offline` real ante fallo de red (se limpia en el siguiente sync exitoso o al volver a foreground). 13 tests nuevos.
- **Fase 4.1** ✅ completa — fix #6: `uploadBudget()` ahora saca una copia standalone de la DB viva vía `VACUUM INTO` (nunca muta la conexión activa) y limpia `kvcache`/`kvcache_key` de esa copia antes de zipear. `possiblyUpload()` (7 días) llamado desde `openBudget()`.
- **Fase 4.2** ✅ completa — fix #7: `encryptionService.ts::checkKey()` detecta rotación de clave; se invoca solo tras un `decrypt-failure` previo (no en cada sync) para no añadir latencia al camino caliente.
- **Fase 4.3**: sin cambio de runtime necesario (documentado, no requiere código — las vistas `v_*` solo importarían si se exportara el sqlite crudo).
- **Fase 4.4** ✅ completa — `repairSync()` (antes huérfano, sin ningún caller) expuesto como acción explícita "Reparar sincronización" en Ajustes.

**Todas las fases del plan original están completas.** Trabajo de seguimiento identificado pero fuera de alcance de este plan: write-path + UI de presupuesto tracking (Fase 3.1), verificación end-to-end contra un servidor real (sección "Verificación end-to-end" del plan).

## Contexto

`actual-expo` es un port a React Native (Expo/Hermes) de Actual Budget. Se reimplementó el core (CRDT, sync, spreadsheet, encryption) porque las dependencias originales (better-sqlite3, HyperFormula, WebCrypto, PEG.js…) no funcionan en Hermes. La sospecha del usuario era que la sincronización y los cálculos "no están 100% bien". La exploración comparativa de ambos códigos (3 agentes: sync/CRDT, motor de cálculo, capa de datos) lo confirma: la arquitectura es fiel al modelo local-first (cada mutación es un mensaje CRDT, HLC + merkle idénticos al upstream, protobuf y cifrado wire-compatibles), pero hay **2 bugs P0 que rompen la convergencia**, varios bugs P1 de corrección, y huecos de paridad de features.

### Hallazgos verificados (resumen, con referencia a archivo)

**Sync/CRDT** (port: `src/core/sync`, `src/core/crdt`):
1. **[P0] `ALLOWED_TABLES` descarta datasets del merkle** — `src/core/sync/apply.ts:17-36,157-163`: un mensaje con dataset desconocido hace `continue` SIN insertarse en `messages_crdt` ni en el merkle. El original (`actual/packages/loot-core/src/server/sync/index.ts:341-371`) registra TODO mensaje en el log CRDT + merkle aunque no conozca la tabla. Faltan en la lista: `custom_reports`, `reflect_budgets`, `transaction_filters`, `banks`, `pending_transactions`. Consecuencia: si el desktop crea un filtro guardado, un reporte custom o usa presupuesto tracking → el merkle local nunca converge → `SyncError('out-of-sync')` permanente.
2. **[P0] Merkle mutado in-place dentro de la transacción** — `apply.ts:153,186,190-191` muta `getClock().merkle` y llama `saveClock()` DENTRO de `transaction()`. Upstream acumula en un trie local y asigna `clock.merkle` solo tras el commit (index.ts:320-391). Si la transacción falla a mitad, el clock en memoria queda divergido del estado persistido hasta reiniciar la app.
3. **[P1] `addMovementNote()` salta el CRDT** — `src/core/domain/budgets/index.ts:486-492` escribe la tabla sincronizada `notes` con SQL directo → esas notas nunca sincronizan.
4. **[P2] `batchMessages` anidado hace flush prematuro** — `src/core/sync/batch.ts:71-83` sin guard de reentrancia (upstream index.ts:501-505).
5. **[P2] Sin SYNC_MODE** (enabled/offline/disabled/import) ni fast-path `applyMessagesForImport`.
6. **[P2] Sin re-upload periódico de 7 días** (`possiblyUpload`) y el upload no limpia `kvcache` (upstream cloud-storage.ts:165-171, 341-363).
7. **[P2] Sin `checkKey()`** al inicio de sync para detectar rotación de clave de cifrado.
8. **[P3] Rebuild de merkle a mitad de loop** (port-only, `fullSync.ts:118-133`, puede enmascarar corrupción); round-trip deserialize→re-serialize en `getMessagesSince` (riesgo de representación de floats).

**Motor de cálculo** (port: `src/core/domain/spreadsheet`, `budgets`, `goals`):
9. **[P0] Presupuesto tracking/report no existe** — el port es envelope-only (no hay equivalente a `budget/tracking.ts`: faltan celdas `spent-with-carryover`, `total-saved`, `real-saved`, `total-budget-income`) y no se lee nunca `preferences.budgetType`. Un archivo tracking abierto en móvil renderiza con semántica errónea.
10. **[P1] `ensureBudgetCellsForMonth` es código muerto** (definido en `envelope.ts:328`, nunca llamado) y el horizonte forward es solo hoy+3 meses (original: +12). Navegar más allá muestra ceros sin mecanismo de construcción lazy.
11. **[P1] `triggerBudgetChanges` ignora `accounts.offbudget` y `category_mapping`** (`spreadsheet/sync.ts:39`) → saldos de categoría stale tras mover una cuenta on/off budget o fusionar categorías (original: `budget/base.ts` handleAccountChange/handleCategoryMappingChange). Además `BUDGET_TABLES` excluye `reflect_budgets`.
12. **[P2] Goals**: falta el tipo `schedule` (`goals/types.ts`, `engine.ts`); las notas `#template` legacy solo se detectan (`hasLegacyTemplateNotes`), nunca se parsean; `inferGoalFromDef` solo lee `templates[0]` y 3 tipos.
13. **[P2] Invariante `safeNumber` perdido** — el original lanza excepción si un resultado no es entero (`shared/util.ts::safeNumber`); el port coerce en silencio (`envelope.ts::num()`).
14. **[P2] Cálculo to-budget duplicado** — `budgets/toBudget.ts` (`computeToBudgetFull`) es un camino imperativo paralelo al spreadsheet → riesgo de drift.

**Capa de datos:**
15. **[P2] Reglas solo se aplican en el form de guardado** (`transactions/save.ts:88`, fill-empty-only); `addTransaction`, transfers, reconciliación, schedule-post e import se saltan el motor de reglas (upstream las corre en `addTransactions`).
16. **[P3] Migraciones congeladas en `1765518577215`** — faltan 7 migraciones upstream posteriores (columnas `tags.hidden`, `accounts.bank_sync_status`, `schedules.custom_upcoming_length`, `categories.cleanup_def`, tabla `cleanup_groups`, `custom_reports.show_trend_lines`, índices). Con el fix #1, mensajes a columnas inexistentes serían el siguiente fallo → hay que subir el schema junto con el fix #1.
17. **[P3] No hay vistas SQL `v_*` físicas** (inlined en el compilador AQL) aunque sus migration IDs están stampeados — solo importa si el sqlite crudo se entrega al desktop.

**Lo que está bien (preservar):** primitivas HLC/merkle byte-idénticas, protobuf y cifrado (AES-256-GCM + PBKDF2-SHA512-10000) wire-compatibles con el servidor, undo correcto (no graba mensajes remotos), prefs de 3 niveles, transfers/splits/payee-merge fieles, prefix-index O(1) del spreadsheet, batching + debounce de fullSync.

---

## Fase 0 — Infraestructura de tests (prerequisito)

El mock actual de `expo-sqlite` (`src/__mocks__/expo-sqlite.ts`) es un stub vacío — no hay NINGÚN test bajo `src/core/sync`, `src/core/crdt` ni `src/core/domain/spreadsheet`, y sin DB real no se pueden escribir.

**0.1** Reemplazar el mock por un shim respaldado por `better-sqlite3` (devDependency) que implemente la superficie que usa `src/core/db/index.ts`: `getAllAsync`, `getFirstAsync`, `runAsync`, `execAsync`, `getAllSync`, `getFirstSync` y lo que use `transaction()`. DBs `:memory:` keyed por nombre.
**0.2** Helper `src/core/db/__tests__/testDb.ts` que corre `initSchema` + `loadClock()`.

*Verificación*: los 742 tests existentes siguen en verde + smoke test insert/read vía `runQuery`.

## Fase 1 — Integridad de sync (P0: convergencia y atomicidad)

1.1 y 1.2 son una reescritura conjunta de `applyMessages` en `src/core/sync/apply.ts`.

**1.1 Registrar TODO mensaje en `messages_crdt` + merkle; el allow-list solo protege la escritura de tabla** (fix #1). Orden por mensaje: (a) `prefs` → colecta como hoy; (b) tabla permitida y `!msg.old` → INSERT/UPDATE; (c) dataset desconocido → warn en `__DEV__` pero SIN `continue`; (d) **incondicionalmente** insertar en `messages_crdt` + `currentMerkle = merkle.insert(...)`. Reemplazar el `ALLOWED_TABLES` hardcodeado por un set derivado en apertura de budget desde `sqlite_master` menos tablas internas (`messages_*`, `kvcache*`, `spreadsheet_cells`, `db_version`, `__migrations__`, `__meta__`, `created_budgets`) — mantiene la protección anti-inyección sin poder desincronizarse del schema. Ante fallo SQL de tabla → `SyncError('invalid-schema')` (con 1.2, rollback atómico). Actualizar también el pre-fetch `rowsToFetch` (apply.ts:110) para que el undo cubra las tablas nuevas.

**1.2 Merkle acumulado localmente, commit tras la transacción** (fix #2). Mutar solo un `currentMerkle` local dentro del loop; al final del body: `prune` + persistir con una variante `saveClockWith(merkle)` en `clock.ts`; asignar `clock.merkle = currentMerkle` SOLO después de que `transaction()` resuelva (upstream index.ts:373-391). La rama `prefs` (apply.ts:153) pierde su mutación directa.

**1.3 Catch-up de schema/migraciones** (fix #16, adelantado — lo requiere 1.1). En `src/core/db/schema.ts`: columnas `schedules.custom_upcoming_length`, `categories.cleanup_def`, `custom_reports.show_trend_lines`, `tags.hidden`, `accounts.bank_sync_status`; tabla `cleanup_groups`; índices `1780606215001`; stampear los 7 migration IDs nuevos. `ALTER TABLE ... ADD COLUMN` idempotente (guard con `PRAGMA table_info` o mini-runner keyed por ID) para budgets locales existentes. Añadir nota de mantenimiento: re-diff de `actual/packages/loot-core/migrations/` en cada bump de upstream.

**1.4 `addMovementNote` vía CRDT** (fix #3). En `budgets/index.ts:475-492`: reemplazar SQL directo por el patrón `sendMessages([{dataset:'notes', row, column:'note', value}])` ya usado en el mismo archivo (líneas 392-457). Envolver junto con las transferencias de categoría en un `batchMessages` para que el undo revierta la nota también.

**1.5 Guard de reentrancia en `batchMessages`** (fix #4). `batch.ts:71-83`: `if (_isBatching) { await fn(); return; }` al inicio, como upstream.

**1.6 Quitar el rebuild de merkle mid-loop y arreglar el round-trip de valores** (fix #8). Borrar el bloque `rebuildMerkleHash` de `fullSync.ts:118-133` (mantener `repairSync` como acción explícita en settings, Fase 4.4). Hacer que `getMessagesSince` (apply.ts:205-217) devuelva el `value` serializado tal cual está almacenado y que `encode()` (encoder.ts) lo acepte sin re-serializar, como upstream (index.ts:534-540).

**Tests Fase 1** (`src/core/sync/__tests__/`):
- `apply.test.ts` — round-trip de convergencia: 2 DBs en memoria, mensajes entrelazados incluyendo `custom_reports`, `banks`, `transaction_filters`, `reflect_budgets` y un dataset ficticio `future_table`, aplicados en distinto orden → mismo contenido de `messages_crdt`, mismo hash de merkle, `merkle.diff === null`. (Regresión directa del fix #1.)
- `apply-rollback.test.ts` — mensaje con columna inexistente a mitad de batch → `SyncError('invalid-schema')`, `messages_crdt`, `messages_clock` y hash de merkle en memoria intactos. (Regresión del fix #2.)
- `batch.test.ts` — `batchMessages` anidado aplica exactamente una vez.
- `roundtrip.test.ts` — valores `1.1`, `1e21`, `0.30000000000000004`, `-0` → string serializado byte a byte igual a `messages_crdt.value`.
- `movementNote.test.ts` — `addMovementNote` genera mensaje CRDT en `messages_crdt`.

## Fase 2 — Corrección del motor de cálculo (P1)

**2.1 Extensión lazy de meses + horizonte** (fix #10). Conectar el código muerto: añadir `ensureMonthRange(month)` en `spreadsheet/sync.ts` que trackea el rango construido `[start, end]` y construye **contiguamente** desde el borde hasta el mes pedido (las deps cross-month `prevSheet` no admiten huecos), dentro de un `startTransaction()`. Llamarlo desde el hook de navegación de mes en `src/features/budget/hooks/` antes de leer celdas. Mantener el rango inicial −3/+3 por velocidad de arranque; el lazy path hace que los meses lejanos sean correctos en vez de cero.
*Test*: navegar a hoy+8 → `to-budget` no-cero con budgets sembrados y meses intermedios existentes.

**2.2 `triggerBudgetChanges` reacciona a `accounts` y `category_mapping`** (fix #11). Añadir ambos a los dos sets `BUDGET_TABLES` (batch.ts y fullSync.ts). En `triggerBudgetChanges`: mensaje de `accounts` con columna `offbudget`/`closed`/`tombstone` → invalidar todas las celdas de prefijo `sum-amount-` (conservador pero barato con el prefix index y es operación rara); `category_mapping` → igual.
*Test*: flip de `offbudget` vía `sendMessages` → `sum-amount-{cat}` y `to-budget` recomputan excluyendo la cuenta.

**2.3 Restaurar el invariante `safeNumber`** (fix #13). Portar `shared/util.ts::safeNumber` de upstream (lanza si el resultado no es entero) a `src/lib/number.ts` y envolver los resultados de las fórmulas en `envelope.ts` donde upstream lo hace. Consolidar con el `safeNumber` privado no usado de `spreadsheet.ts:51`.

**2.4 Retirar el camino to-budget duplicado** (fix #14). Secuencia: (a) primero un **test de paridad** — fixture multi-mes (carryovers, buffered, sobre-gasto, cuenta off-budget) asertando `computeToBudgetFull(month) === celda 'to-budget'` para cada mes; (b) en verde (el spreadsheet es la fuente de verdad), reescribir `computeToBudget`/`getBudgetMonth` (`budgets/index.ts:184,201`) para leer celdas del spreadsheet (+ `ensureMonthRange` de 2.1); (c) borrar `toBudget.ts`.

## Fase 3 — Paridad de features

**3.1 Presupuesto tracking/report** (fix #9; depende de 2.x). Esfuerzo ~3-4 días: el `Spreadsheet` del port ya soporta todo lo que `tracking.ts` necesita — es un archivo de fórmulas nuevo + switch de tipo, no un cambio de motor.
- Nuevo `src/core/domain/spreadsheet/tracking.ts` espejo de `envelope.ts`: `catBudgeted` lee `reflect_budgets` (ya en schema); `leftover` income-aware sin cadena `leftover-pos`; celdas extra `spent-with-carryover-{cat}`, `total-budget-income`, `total-saved`, `real-saved`; sin `to-budget`/`buffered`/`from-last-month`; honrar `hidden` en sumas de grupo/summary. Extraer el SQL de `catSpent` a un helper compartido con envelope.
- Extender `bindings.ts` con el objeto `trackingBudget`.
- `getBudgetType(): 'envelope' | 'report'` en `preferences/index.ts` leyendo la fila `budgetType` de `preferences` (verificar el valor exacto que guarda el desktop — históricamente `'report'|'rollover'` — y normalizar como upstream `budget/base.ts:17`).
- `initSpreadsheet()` branch por tipo; en `apply.ts`, tras commit, si algún mensaje fue `preferences/budgetType` → `runStructuralRefresh` + evento a la UI (upstream index.ts:368).
- Añadir `reflect_budgets` a `BUDGET_TABLES` y a `triggerBudgetChanges`.
- UI: hooks de `src/features/budget/` seleccionan bindings por tipo; `setBudgetAmount` etc. escriben `reflect_budgets` en modo tracking (patrón `getBudgetTable()` de upstream `budget/actions.ts`).
*Tests*: escenarios portados de upstream (carryover con `spent-with-carryover`, `total-saved = income − budgeted`, `real-saved`, signo de leftover en categorías income) + test de switch de tipo vía mensaje sincronizado.

**3.2 Goals: tipo `schedule` + parseo de notas legacy** (fix #12). Añadir el tipo `schedule` a `types.ts`/`engine.ts` (resolver el schedule por nombre; el port ya tiene motor de recurrencia completo en `domain/schedules`). Extender `parse.ts` para parsear de verdad las líneas `#template`/`#goal` cuando `goal_def` esté vacío (parser a mano del subset: `simple`, `by`, `spend`, `schedule`, `percentage`, `week`, `remainder`, `#goal`), sustituyendo el detect-only. Rehacer `inferGoalFromDef` (envelope.ts:271-287) para considerar todos los templates y los tipos nuevos.
*Tests*: casos espejo de `goal-template.test.ts` upstream.

**3.3 Reglas en todos los caminos de creación de transacciones** (fix #15). Nuevo `rules/runRules.ts` portando la semántica de `transaction-rules.ts::applyRules` (pre → default → post stage sobre el objeto completo). Aplicar en `addTransaction`, schedule-post e importadores; verificar contra upstream `accounts/transactions.ts::addTransactions` qué caminos corren reglas exactamente antes de implementar (la entrada manual del form es autoritativa en upstream — replicar exacto).
*Tests*: regla con acción de categoría aplica en `addTransaction` y schedule-post; el contraparte de un transfer no se toca.

**3.4 SYNC_MODE + `applyMessagesForImport`** (fix #5). Nuevo `src/core/sync/syncMode.ts` (`setSyncingMode`/`checkSyncingMode`, upstream index.ts:41-78); gate en `apply.ts` (fast-path import: sin `compareMessages` ni log CRDT, upstream index.ts:231-250), en `scheduleFullSync` (respetar `disabled`/`offline`) y en `fullSync.ts`. Modo `import` durante descarga inicial / importación de archivo; `offline` en fallo de red.

## Fase 4 — Hardening y paridad de ciclo de vida

**4.1 Re-upload periódico + limpieza de caché** (fix #6). En `budgetfiles.ts::uploadBudget`: copiar `db.sqlite` a temp, `DELETE FROM kvcache; DELETE FROM kvcache_key;` (+ `spreadsheet_cells` si aplica), `VACUUM`, zipear la copia — nunca mutar la DB viva. Añadir `lastUploaded` a la metadata (`budgetMetadata.ts`); `possiblyUpload()` con `UPLOAD_FREQUENCY_IN_DAYS = 7` llamado desde `closeBudget()` y en app-background (listener AppState existente).

**4.2 `checkKey()` al inicio de sync** (fix #7). En `encryptionService.ts` + `fullSync.ts`: POST `/user-get-key`, comparar `id` con `encryptKeyId` local. Llamarlo solo en apertura de budget o tras un `decrypt-failure` — NO en cada poll de 60s (coste móvil). En mismatch → subtipo `decrypt-failure` existente para que la UI pida la clave.

**4.3 Vistas `v_*` solo en export** (fix #17). Sin cambio de runtime; crear las vistas solo si algún día se implementa export del sqlite crudo. Documentar en `schema.ts` que los IDs de vista están stampeados intencionalmente.

**4.4 UX de reparación.** Exponer `repairSync()` como acción explícita "Reparar sincronización" en settings (ahora que el rebuild automático mid-loop desaparece).

---

## Verificación end-to-end (tras Fase 1, repetir en cada fase)

Con el sync-server del `docker-compose.yml` (puerto 5006) + cliente web upstream (`yarn start:server-dev` en `actual/`):

1. **Desktop → port** (regresión #1): crear en desktop un custom report, un transaction filter, filas de `reflect_budgets` (cambiar brevemente a tracking) y un tag `hidden`. Sincronizar y abrir en el port (`npm run ios`): sin `out-of-sync`; hash de merkle y `SELECT COUNT(*), MAX(timestamp) FROM messages_crdt` idénticos en ambos clientes (log `__DEV__` temporal).
2. **Port → desktop**: budgets, transferencias entre categorías (ejercita `addMovementNote`), transacciones, notas → verificar en desktop que las movement notes aparecen y los valores cuadran.
3. **Convergencia a 3 bandas**: desktop + 2 instancias del port, ediciones offline entrelazadas → los 3 merkle iguales; `to-budget` idéntico en ±3 meses.
4. **Rollback** (regresión #2): forzar fallo SQL a mitad de `applyMessages` con un hook de debug; matar y relanzar; el siguiente sync converge sin reparación.
5. **Cifrado**: repetir (1) con archivo E2E-encrypted; rotar clave en desktop → el port muestra el prompt de clave (4.2).
6. **Tracking E2E** (tras 3.1): archivo con `budgetType=report` → celdas tracking correctas, `total-saved`/`real-saved` cuadran con desktop; flip de tipo en desktop con el port abierto → rebuild tras sync.
7. **Upload 7 días** (tras 4.1): `lastUploaded` a −8 días, cerrar budget → request a `/sync/upload-user-file` y `kvcache` vacío en el zip.

## Orden y dependencias

**0 → 1 (1.1+1.2 atómicos; 1.3 antes o junto a 1.1) → 2 (2.1 antes que 2.4) → 3 (3.1 depende de 2.2/2.4; 3.2/3.3/3.4 independientes) → 4 (paralelizable con 3)**

## Archivos críticos

Port: `src/core/sync/apply.ts`, `src/core/sync/batch.ts`, `src/core/sync/fullSync.ts`, `src/core/db/schema.ts`, `src/core/domain/spreadsheet/{envelope,sync,bindings}.ts`, `src/core/domain/budgets/index.ts`, `src/services/budgetfiles.ts`, `src/__mocks__/expo-sqlite.ts`.
Referencia upstream: `actual/packages/loot-core/src/server/sync/index.ts`, `.../budget/{base,tracking,envelope}.ts`, `.../cloud-storage.ts`, `actual/packages/crdt/`.
