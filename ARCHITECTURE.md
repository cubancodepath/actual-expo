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
├── core/                   # Dominio puro (SIN React ni UI): domain/, db/, sync/, crdt/,
│                           # queries/, encryption/, errors/, proto/. NO SE TOCA — ya está bien.
│
├── screens/                # Toda la UI, organizada por pantalla (espejo del árbol de navegación)
│   ├── budget/
│   │   ├── BudgetScreen/       # index.tsx + components/ + hooks/ PRIVADOS de esta screen
│   │   ├── GoalScreen/
│   │   ├── EditBudgetScreen/
│   │   ├── EditCategoryScreen/
│   │   ├── components/         # compartidos SOLO entre screens de budget (MonthPicker, skeletons…)
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
├── stores/                 # Zustand — SOLO estado de UI/sesión. Se queda como está (nombre incluido).
│
├── services/               # Side effects hacia el exterior: authService, budgetfiles, encryptionService,
│   └── api/                # locationService, seedBudget, importers/ + HTTP (ex shared/infra/api,
│                           # manteniendo la separación .api/.dto/.mappers/.types)
│
├── lib/                    # Utilidades puras sin React (currency, date, format, colors, screenOptions)
│   └── hooks/              # hooks React verdaderamente globales (useQuery, useLocale…).
│                           # Si un hook solo lo usa un dominio → screens/<dominio>/hooks/
│
└── i18n/                   # config i18next + locales/ (en/, es/) — se fusiona la antigua src/locales/
```

`src/__mocks__/` se mantiene (infra de Vitest, no cuenta como capa).

## Regla de colocación (árbol de decisión)

Ante cualquier archivo, pregunta en orden:

1. **¿Es lógica de negocio/datos sin React?** → `core/` (o `lib/` si es un util genérico sin dominio).
2. **¿Es un side effect hacia fuera (HTTP, keychain, GPS, import/export)?** → `services/`.
3. **¿Es estado global de UI (Zustand)?** → `stores/`.
4. **¿Lo usa UNA sola pantalla?** → dentro de su carpeta `screens/<dominio>/<ScreenName>/`.
5. **¿Lo usan varias pantallas del MISMO dominio?** → `screens/<dominio>/components|hooks/`.
6. **¿Lo usan varios dominios?** → `ui/` si es visual, `lib/hooks/` si es un hook, `lib/` si es un util.

**Regla de subagrupación**: cuando un `components/` pase de ~8 archivos, agrupa en subcarpetas
por bloque (`currency-input/`, `category-list/`…). Nunca carpetas planas gigantes.

## Dirección de dependencias

```
app → screens → (ui | stores | lib | services) → core
```

- `core/` no importa nada de las demás capas (ya vigente).
- Una screen **nunca** importa de una screen de otro dominio. Si lo necesita, ese código sube a `ui/` o `lib/`.
- `ui/` no importa de `screens/` ni de `stores/`.
- `app/` solo importa de `screens/` y `lib/screenOptions`.
- Prohibido crear imports nuevos hacia `@/features/`, `@/shared/`, `@/components/`, `@/design-system/` (legacy).

## Mapa de migración: dónde va lo que existe hoy

| Hoy (legacy) | Destino | Notas |
|---|---|---|
| `src/features/*/screens/X.tsx` | `src/screens/<dominio>/XScreen/index.tsx` | |
| `src/features/*/components|hooks/` | según árbol de decisión (pasos 4–6) | grep de usos antes de mover |
| `src/features/` (carpeta) | **desaparece** | borrar al vaciarse |
| `src/design-system/*` (atoms/molecules) | **desaparecen**: se sustituyen por componentes heroui-native usados directamente en las screens; solo lo que heroui no traiga Y usen 2+ dominios va a `src/ui/` | ritmo marcado por `docs/DX-HEROUI-MIGRATION-PLAN.md` |
| `src/design-system/swift-ui/` | `src/ui/swift-ui/` | |
| `src/design-system/providers/ThemeProvider` + `tokens/` | `src/ui/theme/` | |
| `src/components/` (ErrorBoundary etc.) | `src/ui/feedback/` | |
| `src/shared/infra/api/` | `src/services/api/` | ✅ hecho 2026-07-08 |
| `src/shared/` (resto, .gitkeep) | **borrado** | ✅ hecho 2026-07-08 |
| `src/hooks/` | globales → `src/lib/hooks/`; de un dominio → `screens/<dominio>/hooks/` | |
| `src/locales/` | `src/i18n/locales/` | ✅ hecho 2026-07-08 |
| `src/features/auth/` | `src/screens/auth/` | ✅ hecho 2026-07-08 — primer dominio migrado (patrón de referencia) |
| files.tsx + change-budget.tsx + hooks de settings | `src/screens/files/` (Budget­FilesScreen, ChangeBudgetScreen, hooks/, components/) | ✅ hecho 2026-07-09 — todo heroui; BudgetFileRow → `src/ui/`, InlineError → `src/ui/feedback/` |
| Pipeline de errores `reportError`/policy/errorStore/ErrorPresenter | **borrado** — queda solo el bus `ErrorChannel` + `ErrorChannelConsumer` (`src/ui/feedback/`, log + Sentry) | ✅ hecho 2026-07-09 — consumers de UI se colgarán del bus cuando toque |
| `src/stores/`, `src/services/`, `src/lib/`, `src/core/`, `src/i18n/` | se quedan donde están | |
| Rutas gordas: `app/(auth)/account/[id].tsx` (557), `account/search.tsx` (550), `settings/budget.tsx` (532), `transaction/split.tsx` (455) | extraer a `screens/accounts/`, `screens/settings/`, `screens/transactions/` | siguiente candidato cada vez que se toquen |

## Guardarraíles

- `scripts/check-arch.sh` (pre-commit): actualizar cuando avance la migración para prohibir
  imports nuevos a rutas legacy y validar la dirección de dependencias de arriba.
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
