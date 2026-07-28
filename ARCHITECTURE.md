# Arquitectura definitiva — actual-expo

> **Este documento es la fuente de verdad de la organización de carpetas.**
> No se hace big-bang: se migra estilo **strangler** — cada vez que toques un archivo,
> muévelo a su ubicación definitiva según este documento y actualiza los imports.
> Todo archivo NUEVO nace ya en su ubicación definitiva. Cuando una carpeta legacy
> quede vacía, se borra.

## Estructura objetivo

De ~12 carpetas top-level en `src/` bajamos a **7**, cada una con una responsabilidad única:

```
app/                        # SOLO rutas de Expo Router. Cada archivo = re-export fino de una screen
                            #   export { BudgetScreen as default } from '@/screens/budget/BudgetScreen'
src/
├── core/                   # Dominio puro (SIN React ni UI, tampoco react-query). Espejo del layout
│                           # de loot-core upstream, cuyo src/ solo tiene platform/, server/, shared/
│                           # y types/ — todo lo demás cuelga de server/:
│                           #   server/     motor por dominio (accounts, budget, rules…) + db/ (SQL +
│                           #               helpers CRDT + sort.ts), sync/, encryption/, aql/ (compilador)
│                           #   shared/     lógica pura (months, util, schedules, tags, transactions…)
│                           #   types/      models/ (entidades)
│                           #   platform/   seams nativos
│                           # Pendientes de alinear: crdt/ y proto/ (upstream los tiene en un paquete
│                           # aparte, packages/crdt).
│                           # La capa reactiva de AQL (liveQuery/pagedQuery/queryCache) vive en
│                           # lib/queries/, como el desktop-client del upstream; el wiring de
│                           # react-query, en lib/tanstack/.
│
├── screens/                # Toda la UI, organizada por pantalla (espejo del árbol de navegación)
│   ├── budget/
│   │   ├── BudgetScreen/       # index.tsx + components/ + hooks/ PRIVADOS de esta screen
│   │   ├── GoalScreen/
│   │   ├── EditBudgetScreen/
│   │   ├── EditCategoryScreen/
│   │   ├── components/         # compartidos SOLO entre screens de budget (MonthPicker, skeletons…)
│   │   ├── goals/              # describir/moldear/validar templates — espejo de
│   │   │                       #   desktop-client/src/components/budget/goals del upstream.
│   │   │                       #   El MOTOR (goal-template, el parser) se queda en core
│   │   └── hooks/              # hooks compartidos del dominio budget (useCategories, useGoalEditor)
│   ├── transactions/           # TransactionDetailScreen/, SplitTransactionScreen/, components/, hooks/
│   ├── accounts/               # AccountScreen/, AccountSearchScreen/
│   ├── reports/
│   ├── spending/
│   ├── schedules/
│   ├── settings/
│   ├── auth/                   # OpenIdSignIn, PasswordSignIn, ServerConnect, AuthShell (ya en heroui)
│   ├── files/                  # selección/creación de budget files
│   └── onboarding/
│
├── ui/                     # SOLO componentes propios compartidos entre dominios, construidos CON
│   │                       # heroui-native. NO es una capa de wrappers: Button, TextField, Card…
│   │                       # se importan de 'heroui-native' DIRECTAMENTE en las screens.
│   ├── (CurrencyText.tsx, …)   # piezas que heroui no trae y usan 2+ dominios
│   ├── feedback/           # ErrorBoundary, ErrorPresenter, InlineError, ErrorChannelConsumer
│   ├── swift-ui/           # bridges SwiftUI (SAmount, SPill, SText, …)
│   └── theme/              # ThemeProvider + puente de tokens hacia global.css/Uniwind
│
├── stores/                 # Zustand — SLICES DE ESTADO puro (estado + acciones que solo tocan
│   │                       # su propio estado o core). Un store NUNCA importa otro store.
│   │                       #   sessionStore   = usersSlice STATE
│   │                       #   budgetContext… = budgetfilesSlice STATE
│   │                       #   syncStore      = appSlice STATE (+ sync + setters de conflicto)
│   │                       # En React se consumen con selectores useXStore(s => s.x), fuera con getState().
│   └── operations/         # Los THUNKS del upstream (desktop-client slices' async thunks):
│                           # workflows que orquestan VARIOS stores + core. Dependencia UNIDIRECCIONAL
│                           # operations → stores → core, así los stores quedan sin ciclos de init.
│                           #   budgetfiles.ts = loadBudget/closeBudget/closeAndLoad/closeAndDownload/deleteBudget
│                           #   users.ts       = signOut
│                           #   syncRecovery.ts= resetSync/redownloadBudget/handleSyncFileError
│                           #   resetStores.ts = resetAllStores (fan-out)
│                           # (Ya NO hay src/services/: los side effects viven en core/server + core/platform.)
│
├── lib/                    # Utilidades puras sin React (currency, date, format, colors)
│                           #   lib/hooks/ = hooks globales (useStackOptions, useQuery…)
│   ├── errors/             # bus de errores de la app (ErrorChannel, emitErrorEvent, toErrorCode)
│   │                       # + install.ts (handler global). core NO emite: solo lanza ActualError.
│   ├── queries/            # capa reactiva de AQL: liveQuery, pagedQuery, queryCache (espejo del
│   │                       # desktop-client/src/queries upstream). El MOTOR está en core/server/aql/
│   ├── tanstack/           # wiring de TanStack Query: queryClient (singleton + error handlers),
│   │                       # react-query.d.ts (ambient types) y query options multi-dominio.
│   │                       # Lleva el nombre de la librería para no confundirse con queries/
│   └── hooks/              # hooks React verdaderamente globales (useQuery, useLocale…).
│                           # Si un hook solo lo usa un dominio → screens/<dominio>/hooks/
│
└── i18n/                   # config i18next + locales/ (en/, es/) — se fusiona la antigua src/locales/
```

`src/__mocks__/` se mantiene (infra de Vitest, no cuenta como capa).

## Regla de colocación (árbol de decisión)

Ante cualquier archivo, pregunta en orden:

1. **¿Es lógica de negocio/datos sin React?** → `core/` (o `lib/` si es un util genérico sin dominio).
2. **¿Es un side effect hacia fuera (HTTP, fs, keychain, GPS)?** → transporte/handlers en
   `core/server/`; el módulo nativo se envuelve en un seam `core/platform/<capability>`.
3. **¿Es estado de una feature (el "slice")?** → `stores/` (store Zustand con acciones que solo
   tocan su propio estado). **¿Es un workflow que orquesta varios stores?** → `stores/operations/`
   (thunk; importa stores en una sola dirección — un store jamás importa otro store).
4. **¿Lo usa UNA sola pantalla?** → dentro de su carpeta `screens/<dominio>/<ScreenName>/`.
5. **¿Lo usan varias pantallas del MISMO dominio?** → `screens/<dominio>/components|hooks/`.
6. **¿Lo usan varios dominios?** → `ui/` si es visual, `lib/hooks/` si es un hook, `lib/` si es un util.

**Regla de subagrupación**: cuando un `components/` pase de ~8 archivos, agrupa en subcarpetas
por bloque (`currency-input/`, `category-list/`…). Nunca carpetas planas gigantes.

## Dirección de dependencias

```
app → screens → (ui | stores | lib) → core   (core/server + core/platform incluidos)
```

- `core/` no importa nada de las demás capas (ya vigente). Los side effects viven dentro
  de `core/server/` (transporte/handlers, espejo de `loot-core/src/server/`) y
  `core/platform/` (seams nativos: fetch, fs, sqlite, crypto, keyStore, location).
- Una screen **nunca** importa de una screen de otro dominio. Si lo necesita, ese código sube a `ui/` o `lib/`.
- `ui/` no importa de `screens/` ni de `stores/`.
- **Un `store` no importa otro `store`.** La orquestación cross-store vive en `stores/operations/`
  (thunks): `operations → stores → core`, nunca al revés. Exentos: `session.selectors.ts`
  (composición read-only) y `prefsStorage.ts` (adaptador de persistencia). Lo aplica la regla `stores-no-sibling-stores` de `.dependency-cruiser.cjs`.
- **Prohibidos los imports dinámicos de stores** (`await import("@/stores/…")`): cada uno tapaba un
  ciclo; se rompen estructuralmente (evento por el bus / operation / inyección de handler). HARD FAIL: regla `no-dynamic-store-imports` de `.dependency-cruiser.cjs`.
- **Wiring de arranque = ciclo de vida React, no efectos de import.** Los listeners de app-lifetime
  (política de sync + política del 401) se registran en `lib/app-services.ts::installAppServices`,
  llamado desde `useEffect(installAppServices, [])` en `app/_layout.tsx` (cleanup des-registra →
  StrictMode/Fast-Refresh safe). El 401 tiene un único dueño: `lib/errors/authPolicy.ts` (subscriber
  del ErrorChannel: `auth/token-expired` → `signOut`); nadie más desloguea. Fuera del root, en import
  time: `Sentry.init` + `installGlobalHandlers` (crash handlers) y el singleton `queryClient`.
- `app/` solo importa de `screens/`, `lib/hooks/useStackOptions` y `ui/surface-level`.
- Prohibido crear imports nuevos hacia `@/features/`, `@/shared/`, `@/components/`, `@/design-system/` (legacy).

## Mapa de migración: dónde va lo que existe hoy

| Hoy (legacy)                                                                                                                             | Destino                                                                                                                                                                                                                                         | Notas                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| `src/features/*/screens/X.tsx`                                                                                                           | `src/screens/<dominio>/XScreen/index.tsx`                                                                                                                                                                                                       |                                                                                                |
| `src/features/\*/components                                                                                                              | hooks/`                                                                                                                                                                                                                                         | según árbol de decisión (pasos 4–6)                                                            | grep de usos antes de mover |
| `src/features/` (carpeta)                                                                                                                | **desaparece**                                                                                                                                                                                                                                  | borrar al vaciarse                                                                             |
| `src/design-system/*` (atoms/molecules)                                                                                                  | **desaparecen**: se sustituyen por componentes heroui-native usados directamente en las screens; solo lo que heroui no traiga Y usen 2+ dominios va a `src/ui/`                                                                                 | ritmo marcado por `docs/DX-HEROUI-MIGRATION-PLAN.md`                                           |
| `src/design-system/swift-ui/`                                                                                                            | `src/ui/swift-ui/`                                                                                                                                                                                                                              |                                                                                                |
| `src/design-system/providers/ThemeProvider` + `tokens/`                                                                                  | `src/ui/theme/`                                                                                                                                                                                                                                 |                                                                                                |
| `src/components/` (ErrorBoundary, CloseButton, ScreenHeader, navigation)                                                                 | `src/ui/` (feedback/ErrorBoundary, CloseButton, ScreenHeader/, navigation/)                                                                                                                                                                     | ✅ hecho 2026-07-12 — carpeta borrada                                                          |
| `src/shared/infra/api/`                                                                                                                  | `src/services/api/`                                                                                                                                                                                                                             | ✅ hecho 2026-07-08                                                                            |
| `src/shared/` (resto, .gitkeep)                                                                                                          | **borrado**                                                                                                                                                                                                                                     | ✅ hecho 2026-07-08                                                                            |
| `src/hooks/`                                                                                                                             | globales → `src/lib/hooks/`; de un dominio → `screens/<dominio>/hooks/`                                                                                                                                                                         |                                                                                                |
| `src/locales/`                                                                                                                           | `src/i18n/locales/`                                                                                                                                                                                                                             | ✅ hecho 2026-07-08                                                                            |
| `src/features/auth/`                                                                                                                     | `src/screens/auth/`                                                                                                                                                                                                                             | ✅ hecho 2026-07-08 — primer dominio migrado (patrón de referencia)                            |
| files.tsx + change-budget.tsx + hooks de settings                                                                                        | `src/screens/files/` (Budget­FilesScreen, ChangeBudgetScreen, hooks/, components/)                                                                                                                                                              | ✅ hecho 2026-07-09 — todo heroui; BudgetFileRow → `src/ui/`, InlineError → `src/ui/feedback/` |
| Pipeline de errores `reportError`/policy/errorStore/ErrorPresenter                                                                       | **borrado** — queda solo el bus `ErrorChannel` + `ErrorChannelConsumer` (`src/ui/feedback/`, log + Sentry)                                                                                                                                      | ✅ hecho 2026-07-09 — consumers de UI se colgarán del bus cuando toque                         |
| react-query en core (`core/queries/queryClient.ts`, `react-query.d.ts`, `core/domain/transactions/queries.ts`)                           | `src/lib/tanstack/` (queryClient, ambient types, transactionQueries); `useTransactions` → `src/lib/hooks/` (multi-dominio)                                                                                                                      | ✅ hecho 2026-07-09 — regla `core-no-react` prohíbe paquetes React en core                     |
| Bus de errores en core (`core/errors/ErrorChannel.ts`, `normalizeError`, `CODE_META`)                                                    | `src/lib/errors/ErrorChannel.ts` (bus slim + `toErrorCode`); core queda con `ActualError` + `ErrorCode` y solo LANZA; `syncStore.sync()` es el entry point con la política (logout, syncRecovery, offline); i18n por convención `errors:<code>` | ✅ hecho 2026-07-09 — regla `core-no-lib` prohíbe TODO `@/lib` en core                         |
| `src/stores/`, `src/services/`, `src/lib/`, `src/core/`, `src/i18n/`                                                                     | se quedan donde están                                                                                                                                                                                                                           |                                                                                                |
| Rutas gordas: `app/(auth)/settings/budget.tsx` (526), `transaction/split.tsx` (455), `account/close.tsx` (435), `schedule/new.tsx` (406) | extraer a `screens/settings/`, `screens/transactions/`, `screens/accounts/`, `screens/schedules/`                                                                                                                                               | siguiente candidato cada vez que se toquen                                                     |

## Guardarraíles

- **`.dependency-cruiser.cjs`** (`npm run check:arch`, pre-commit): valida la dirección de
  dependencias sobre el grafo real de módulos (resuelve los `paths` de tsconfig), así que ve
  también los `import()` dinámicos y los imports de solo-tipo. `no-new-legacy-imports` congela
  `@/features`/`@/design-system` con una lista de grandfathering **archivo a archivo** (quitar
  líneas al migrar, nunca añadir; nada de globs anchos, que dejarían colar deuda nueva).
  `no-circular` está en `warn` mientras se limpian los ciclos heredados — el de `db ↔ sync` es
  de diseño y lo tiene igual el upstream. `npm run check:arch:graph` saca el grafo en DOT.
- `scripts/check-fat-routes.sh` (pre-commit): ratchet de rutas gordas, `max_fat=13`
  (bajar al migrar rutas, nunca subir). Cuenta líneas, no imports, por eso vive fuera.
- `tsconfig.json`: un solo alias `@/* → src/*`. Eliminar aliases muertos si reaparecen.
- Al mover un archivo: `npx tsc --noEmit` + `npm test` antes de commitear.

## Decisiones tomadas (y por qué)

- **SIN capa de wrappers sobre heroui-native (decidido 2026-07-08)**: los componentes de
  `heroui-native` se importan directamente donde se usan (`import { Button } from 'heroui-native'`).
  No se crea `ui/Button.tsx` que re-exporte o envuelva. Razón: un wrapper por componente es
  indirección pura — el theming ya se centraliza en `global.css` (tokens) y las variantes en
  `className`. Coste asumido: si heroui (beta) rompe API, el cambio toca todos los call sites en
  vez de un wrapper; se acepta a cambio de DX directa y de leer el código igual que la doc oficial.
  `src/ui/` queda solo para componentes PROPIOS multi-dominio que heroui no ofrece.
- **Rutas finas en `app/`, NO el estilo de los templates HeroUI (decidido 2026-07-08)**: cada ruta
  es un re-export de una screen de `src/screens/` (mapeando `useLocalSearchParams` → props tipadas
  cuando aplique). Se descartó el estilo de `example-heroui/` (pantalla dentro del archivo de ruta)
  porque: (1) los nombres en `app/` están secuestrados por la convención de URLs — decenas de
  `index.tsx`/`[id].tsx` indistinguibles en el editor; (2) las screens extraídas se testean en
  Vitest sin montar el router; (3) una misma screen puede montarse en push y en modal; (4) la
  Fase 2 del refactor ya extrajo 7 rutas con este patrón. Los templates son demos pequeñas sin
  tests — son referencia de USO de componentes HeroUI, no de organización de código. Excepción
  práctica: `_layout.tsx` y rutas triviales sin estado ni lógica no requieren extracción.
- **Screens-first en vez de features**: el árbol de código refleja el árbol de navegación de
  Expo Router; cero ambigüedad sobre dónde vive el código de una pantalla. El concepto "feature"
  generaba fronteras difusas y carpetas inconsistentes.
- **`stores/` no se renombra ni se anida**: 13 archivos coherentes; moverlos sería churn de
  imports sin ganancia real.
- **`hooks/` deja de ser top-level**: la mayoría son de un dominio concreto y se colocan con sus
  screens; los pocos globales caben en `lib/hooks/`.
- **`components/` desaparece como top-level**: se fusiona en `ui/` — dos carpetas de "componentes
  compartidos" era exactamente el tipo de ambigüedad a eliminar.
- **`core/` intocable**: espeja `loot-core` upstream y facilita portar cambios; reorganizarlo
  rompería ese mapeo (`docs/upstream-map.md`).
- **`example-heroui/` (raíz del repo)** se conserva como referencia de patrones HeroUI Native.
