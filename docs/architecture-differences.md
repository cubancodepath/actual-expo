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
