# Plan: Nueva estructura (sin design-system) + HeroUI Native directo + paridad upstream

> Documento autocontenido para retomar en cualquier sesión. Generado 2026-07-03 tras análisis completo del repo, investigación de HeroUI Native y decisiones del usuario.
> Estado al escribirse: branch `develop` limpio, v1.0.1 en TestFlight, tests 742/743, tsc con 6 errores pre-existentes.

## 1. Diagnóstico (por qué se siente "regado")

La arquitectura Feature-Sliced (`src/core`, `src/design-system`, `src/features`, `src/stores`, `src/services`) **ya está implementada y sin carpetas legacy** — el problema no son las carpetas sino la disciplina:

| #   | Problema                                             | Evidencia                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rutas gordas en `app/` (regla "routes thin" violada) | `budget/goal.tsx` 930 líneas, `budget/edit.tsx` 801, `(budget)/index.tsx` 782, `budget/edit-category.tsx` 781, `schedule/[id].tsx` 593, `onboarding.tsx` 577, `(spending)/search.tsx` 574; backlog: `account/[id].tsx` 558, `account/search.tsx` 550, `settings/budget.tsx` 529 |
| 2   | Aliases muertos                                      | `@core/`, `@ds/`, `@features/`, `@shared/` en tsconfig + CLAUDE.md con **0 usos**; todo usa `@/` (1300+) y ~440 relativos                                                                                                                                                       |
| 3   | Inversión de dependencia                             | `src/design-system/index.ts` re-exporta de features: `CurrencyInput`, `MonthPicker`, `OverspentPill`, `ExpenseGroupListItem`, `ExpenseCategoryListItem`, `IncomeGroup`                                                                                                          |
| 4   | Barrels inconsistentes                               | core/ todos; features/ casi ninguno; stores/lib/services/shared ninguno                                                                                                                                                                                                         |
| 5   | Hooks en `components/`                               | `features/transactions/components/useTransactionForm.ts`, `useAmountInput.ts`                                                                                                                                                                                                   |
| 6   | Andamiaje vacío                                      | `features/schedules/components/`, `features/settings/components/`, `features/spending/hooks/`                                                                                                                                                                                   |
| 7   | Docs desfasados                                      | aliases en CLAUDE.md; paths viejos en `docs/architecture-differences.md`                                                                                                                                                                                                        |

## 2. Decisiones tomadas (usuario, 2026-07-03)

1. **Eliminar `src/design-system/` por completo** — sin façade ni wrappers: `import { Button } from 'heroui-native'` directo en features.
2. **Toda la UI a HeroUI Native.**
3. **Erradicar `useThemedStyles`/StyleSheet** → 100% className/Tailwind (muere junto con design-system).
4. **Portar las 7 migraciones de schema upstream ANTES de HeroUI.**
5. Estructura **flat estándar**; transición **strangler gradual** (defaults recomendados; alternativas en §4 por si se revisan).

## 3. Estructura de carpetas objetivo

```
actual-expo/
├── app/                    # rutas Expo Router — SOLO routing (5-15 líneas/archivo)
├── src/
│   ├── core/               # port de loot-core — INTOCABLE en esta migración
│   ├── features/           # UI por dominio (budget, accounts, transactions, spending, reports, schedules, settings)
│   │   └── budget/
│   │       ├── screens/    # pantallas completas (extraídas de app/)
│   │       ├── components/
│   │       └── hooks/
│   ├── components/         # custom compartido que HeroUI NO da:
│   │   │                   #   Amount, TagPill, NotesWithTags, ScheduleStatusBadge,
│   │   │                   #   CurrencySymbol, CurrencyInput, SwipeableRow, UndoToast,
│   │   │                   #   KeyboardToolbar, CategoryPickerList, SearchBar, Banner,
│   │   │                   #   ListItem, SectionHeader, EmptyState, SyncBadge,
│   │   │                   #   Icon/(iconRegistry), GlassButton, ContextMenu,
│   │   │                   #   CircularProgress, ProgressBar, AnimatedCheckmark, haptics
│   │   ├── charts/         # victory-native
│   │   └── swift-ui/       # bridges @expo/ui (SAmount, SPill, SText...)
│   ├── hooks/              # antes src/shared/hooks (20 hooks)
│   ├── stores/  services/  lib/  i18n/  locales/   # sin cambios
│   └── theme/              # global.css (@theme Tailwind v4), tokens.ts, ThemeProvider
```

**Por qué**: convención dominante RN/Expo 2026 (shadcn-style; los templates de HeroUI Pro y RN Reusables usan exactamente `components/`+`features/`+`hooks/`); cero capas propias que mantener (HeroUI ES el design system; `components/` no es abstracción sino el cajón de lo genuinamente custom); regla de dependencias lintable: `app → features → components|hooks|stores|core`, y `components` nunca importa de `features`; `core/` intacto preserva el mapeo con loot-core.

## 4. Alternativas descartadas (revisables)

- **Feature-first radical**: componentes nacen en su feature, se "promueven" a `components/` con el 2º consumidor. Más colocation, pero con 15+ componentes ya claramente compartidos el beneficio es marginal y exige disciplina constante.
- **Espejo del upstream** (`src/loot-core/server/...` + `components/` por dominio como desktop-client): maximiza re-diff pero desktop-client no usa feature-slicing y es más caótico — se hereda su desorden. El re-diff se resuelve con el mapa+script de la Fase 6.
- **Façade** (design-system envolviendo HeroUI): rechazada explícitamente por el usuario.
- **Big-bang branch**: 2-4 semanas sin releases, merge arriesgado. Se eligió strangler.

## 5. HeroUI Native — evaluación (julio 2026)

- **v1.0.0 estable 19-mar-2026** (hoy v1.0.4), ~37 componentes, 3.5k stars, ~11k descargas/semana, Apache 2.0, releases mensuales. Parte de HeroUI v3 (ex-NextUI).
- Sobre **Uniwind**: binding Tailwind v4 del equipo de Unistyles, **nitro-based**, compilado en build-time (~2.5x más rápido que NativeWind, performance de StyleSheet nativo).
- **Componentes disponibles** (v1.x): Accordion, Avatar, Button, Card, Checkbox, Chip, Dialog, Divider, TextField/Input, Popover, RadioGroup, ScrollShadow, Select, Skeleton, Spinner, Surface, Switch, Tabs, ErrorView, entre otros (~37).
- **NO tiene** (sigue custom): Toast, Progress, Bottom Sheet, ContextMenu, FAB, layout primitives, charts, listas virtualizadas.
- **Pros**: iOS-first pulido por defecto, accesibilidad incluida, tailwind-variants, styling sin coste runtime, ecosistema creciendo (HeroUI Pro con templates RN, skill oficial para agentes IA).
- **Cons**: joven (v1.0 hace ~4 meses) vs Tamagui/gluestack; catálogo incompleto; solo el equipo core añade componentes.
- **Mercado**: Tamagui → universal apps con compilador optimizador; gluestack v3 → enterprise/catálogo amplio; RN Reusables → copy-paste shadcn; HeroUI Native → apps móviles iOS-first con estética pulida. Encaja para un cliente iOS de finanzas.
- **Riesgo sin façade**: acoplamiento directo asumido; mitigado porque lo custom queda en `src/components/` y el uso de HeroUI son primitivos fáciles de codemod-ear.

Fuentes: [repo heroui-native](https://github.com/heroui-inc/heroui-native) · [InfoQ HeroUI v3](https://www.infoq.com/news/2026/07/heroui-v3-rewrite/) · [releases](https://heroui.com/en/docs/native/releases) · [comparativa vs gluestack/RN-Reusables](https://gist.github.com/CarlosZiegler/5f9ea468ee3906d466b496af35d68aff)

---

## FASE 0 — Baseline (XS, medio día)

```bash
git tag pre-refactor-v1.0.1
pnpm test          # esperado 742/743 (fallo pre-existente schedule.test.ts:493)
npx tsc --noEmit   # 6 errores pre-existentes (@react-navigation, sf-symbols-typescript)
pnpm lint
```

Screenshots light/dark de budget, spending, account, schedule, settings, onboarding → `docs/screenshots-baseline/`. Anotar qué flujos Maestro pasan (`pnpm e2e`).

## FASE 1 — Saneamiento + esqueleto nueva estructura (M, 2-3 días, riesgo bajo)

1. **tsconfig.json**: borrar paths `@core/*`, `@ds/*`, `@features/*`, `@shared/*` (quedan `@/*` y `@modules/*`).
2. **Codemod imports relativos que cruzan capa** (~440 candidatos, solo los que cruzan; los intra-módulo `./` se quedan):
   ```bash
   # detectar cruces de capa:
   grep -rn "from '\.\./\.\./" src/ app/ --include='*.ts*'
   # reescribir con sed/ts-morph a @/...
   ```
3. **Moves** (git mv + codemod):
   - `src/shared/hooks/*` → `src/hooks/`; `src/shared/ErrorBoundary*` → `src/components/`; `src/shared/navigation*` → `src/lib/`; borrar `src/shared/`.
   - Crear `src/theme/`; mover `src/design-system/tokens/` → `src/theme/tokens/` y `src/design-system/providers/ThemeProvider.tsx` → `src/theme/ThemeProvider.tsx` (design-system re-exporta desde ahí temporalmente para no romper consumidores).
   - `features/transactions/components/useTransactionForm.ts` y `useAmountInput.ts` → `features/transactions/hooks/`.
   - Borrar carpetas vacías: `features/schedules/components/`, `features/settings/components/`, `features/spending/hooks/`.
4. **Inversión design-system→features**: quitar del barrel los re-exports de features; consumidores importan de `@/features/budget/components/...`. Dimensionar antes:
   ```bash
   grep -rn 'from "@/design-system"' src app | grep -E 'MonthPicker|Overspent|ExpenseGroup|ExpenseCategory|IncomeGroup|CurrencyInput'
   ```
5. **Barrels**: no crear nuevos; import directo por archivo (`@/components/Amount`, `@/stores/prefsStore`). Mantener los de `core/` (API del port). Barrel de design-system congelado hasta borrado.
6. **Guardrails** — `scripts/check-arch.sh` en hook husky pre-commit existente (o reglas oxlint `no-restricted-imports` si la versión las soporta):
   ```bash
   #!/bin/bash
   fail=0
   # core no importa UI/app
   grep -rln "from ['\"]@/\(features\|components\|stores\|design-system\)" src/core && fail=1
   # components no importa features
   grep -rln "from ['\"]@/features" src/components && fail=1
   # rutas gordas
   for f in $(find app -name '*.tsx'); do
     [ $(wc -l < "$f") -gt 120 ] && echo "WARN ruta gorda: $f"
   done
   # prohibido design-system en archivos nuevos (comparar contra lista congelada en scripts/design-system-freeze.txt)
   exit $fail
   ```
7. **Docs**: actualizar `CLAUDE.md` (estructura, alias único `@/`, convención className, patrón screens) y paths viejos de `docs/architecture-differences.md`.

**Gate**: tsc limpio, 742/743, lint, app arranca. Diff solo estructural (moves + imports).

## FASE 2 — Rutas thin → `features/*/screens/` (M-L, 3-5 días)

**Patrón** (la screen recibe params tipados por props; NO llama a `useLocalSearchParams` dentro → testeable, desacoplada de expo-router):

```tsx
// app/(auth)/budget/goal.tsx  (después: ~10 líneas)
import { useLocalSearchParams } from "expo-router";
import { GoalScreen } from "@/features/budget/screens/GoalScreen";

export default function GoalRoute() {
  const { categoryId, month } = useLocalSearchParams<{ categoryId: string; month: string }>();
  return <GoalScreen categoryId={categoryId} month={month} />;
}
```

Orden (menor→mayor riesgo, **un commit atómico por ruta** para poder bisectar):

| Ruta                                      | Líneas | Destino                                                                                                           |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `app/(public)/onboarding.tsx`             | 577    | `features/settings/screens/OnboardingScreen.tsx`                                                                  |
| `app/(auth)/(tabs)/(spending)/search.tsx` | 574    | `features/spending/screens/SearchScreen.tsx`                                                                      |
| `app/(auth)/schedule/[id].tsx`            | 593    | `features/schedules/screens/ScheduleDetailScreen.tsx`                                                             |
| `app/(auth)/budget/edit-category.tsx`     | 781    | `features/budget/screens/EditCategoryScreen.tsx`                                                                  |
| `app/(auth)/budget/edit.tsx`              | 801    | `features/budget/screens/EditBudgetScreen.tsx`                                                                    |
| `app/(auth)/(tabs)/(budget)/index.tsx`    | 782    | `features/budget/screens/BudgetScreen.tsx` (tab principal, la más delicada)                                       |
| `app/(auth)/budget/goal.tsx`              | 930    | `features/budget/screens/GoalScreen.tsx` + extraer `hooks/useGoalEditor.ts` (>400 líneas de lógica de formulario) |

Backlog 2ª pasada: `account/[id].tsx` (558), `account/search.tsx` (550), `settings/budget.tsx` (529), resto >400.

Se hace ANTES de HeroUI: mover código con estilos viejos es mecánico; luego cada screen se migra a className in-situ sin volver a moverla.

**Gate por ruta**: tsc, tests, flujo Maestro correspondiente, comparación visual vs baseline.

## FASE 3 — 7 migraciones de schema upstream (M, ~1 semana)

- Referencia: `src/core/db/schema.ts` congela migraciones al ID `1765518577215`; upstream tiene 7 posteriores en `../actual/packages/loot-core/migrations/`.
- Portarlas en orden cronológico; cada una con test: crear db en schema viejo → aplicar → asserts de estructura y datos.
- **Test de paridad end-to-end**: fixture de budget (`.zip`/sqlite) exportado desde un Actual server actual que la suite abre y sincroniza — la garantía real de "crecer a la par".

## FASE 4 — Infra HeroUI Native + Uniwind + theme (M, 2-3 días + spike, riesgo técnico ALTO)

### 4.1 Spike (medio día, branch desechable `spike/heroui`)

```bash
pnpm add heroui-native uniwind tailwindcss@^4
npx expo prebuild --clean && pnpm ios
```

Validar (criterio de abort: incompatibilidad no resoluble → parar y decidir):

- Matriz Expo 55 / RN 0.83 / New Architecture / `react-native-nitro-modules ^0.34.1` **ya instalado** (Uniwind es nitro-based — verificar que las versiones de nitro no chocan).
- `metro.config.js` — hoy solo Sentry; componer:
  ```js
  const { getSentryExpoConfig } = require("@sentry/react-native/metro");
  const { withUniwind } = require("uniwind/metro"); // verificar import exacto en docs de Uniwind
  module.exports = withUniwind(getSentryExpoConfig(__dirname));
  ```
- Pantalla de prueba con TODO junto: HeroUI `Button` + componente viejo con `useThemedStyles` + Reanimated 4 + `expo-glass-effect` + vista Skia + HeroUI dentro de celdas `@legendapp/list`.

### 4.2 Theme — `src/theme/global.css`

Variables semánticas Tailwind v4 con los valores de los tokens actuales (`src/theme/tokens/colors.ts` como referencia; al final el CSS es la fuente de verdad y los tokens TS quedan reducidos a lo que Skia/charts lean por JS):

```css
@import "tailwindcss";
@theme {
  --color-page-background: #ffffff;
  --color-card-background: #f7f7f8;
  --color-text-primary: #1f2023;
  --color-text-secondary: #6b6f76;
  --color-accent: #8719e0; /* morado Actual */
  --color-negative: #d32f2f;
  --color-positive: #2e7d32;
  /* ...resto de tokens semánticos: spacing/radii si se personalizan */
}
/* bloque dark: según mecanismo de Uniwind (dark: variant / data-theme) */
```

Uso: `className="bg-page-background text-text-primary"`, `text-negative` para importes en rojo, etc.

### 4.3 Dark mode con prefsStore

`ThemeProvider` (`src/theme/ThemeProvider.tsx`) sigue siendo el **único dueño de la decisión** (`themeMode` de `prefsStore` — `system|light|dark` — + `useColorScheme()`), y sincroniza a Uniwind con su API imperativa (equivalente a `UnistylesRuntime.setTheme`/adaptive) en un effect. Envolver en `app/_layout.tsx`:

```tsx
<ThemeProvider>
  {" "}
  {/* decide el scheme; MMKV es síncrono → sin flash */}
  <HeroUINativeProvider>
    {" "}
    {/* nombre exacto según docs */}
    ...
  </HeroUINativeProvider>
</ThemeProvider>
```

**Gate**: pantalla de prueba con paleta Actual en light/dark; el toggle de tema en settings cambia AMBOS sistemas (viejo StyleSheet y Uniwind) a la vez; tests/tsc verdes; `pnpm build:preview` (EAS) compila.

## FASE 5 — Strangler pantalla a pantalla (L, 3-5 semanas incremental)

**Convención desde ya** (CLAUDE.md): HeroUI directo + className; nada nuevo importa `@/design-system` ni usa `useThemedStyles`.

**Mapeo de sustitución** al migrar cada pantalla:

| Hoy (design-system)                                                                                                                                             | Mañana                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `Input`, `Card`, `Divider`, `Skeleton`, `Badge/Pill/InfoPill`                                                                                         | heroui-native: `Button`, `TextField`, `Card`/`Surface`, `Divider`, `Skeleton`, `Chip`                                           |
| `Text` (variantes typography.ts)                                                                                                                                | RN `Text` + clases; si se repite, helper con tailwind-variants en `src/lib/text-variants.ts`                                    |
| `Spacer`, `RowSeparator`                                                                                                                                        | clases (`h-4`, `border-b border-divider`) — componentes eliminados                                                              |
| `Amount`, `TagPill`, `NotesWithTags`, `ScheduleStatusBadge`, `CurrencySymbol`, `CurrencyInput`                                                                  | mover a `src/components/`, estilos a className                                                                                  |
| `CircularProgress`/`ProgressBar` (Skia), `GlassButton` (expo-glass-effect), `ContextMenu` (zeego), `Icon`+iconRegistry, `AnimatedCheckmark/View`, `haptics`     | mover a `src/components/`; layout por className; props de dibujo Skia leen CSS vars vía hook de Uniwind                         |
| `SwipeableRow`, `UndoToast`, `KeyboardToolbar`, `CategoryPickerList`, `SearchBar`, `Banner/ErrorBanner`, `ListItem`, `SectionHeader`, `EmptyState`, `SyncBadge` | mover a `src/components/`; los mapeables se reescriben sobre primitivos HeroUI por dentro (son componentes de app, no wrappers) |
| `swift-ui/` (bridges @expo/ui)                                                                                                                                  | mover a `src/components/swift-ui/` tal cual                                                                                     |

**Orden de pantallas** (bajo→alto riesgo): settings → onboarding → (files)/(public) auth → schedules → accounts → transactions → spending → reports (charts) → **budget** (tab principal, al final con máxima experiencia acumulada). Un PR por pantalla o grupo pequeño; cada PR mueve a `src/components/` los custom que necesita.

**Cierre**: `grep -rn "design-system\|useThemedStyles" src/ app/` = 0 → `rm -rf src/design-system`, eliminar el hook y `StyleSheet.create` restantes.

**Gate por PR**: tests + Maestro del flujo + screenshot-diff light/dark vs baseline. Al cierre: `pnpm e2e` completo.

## FASE 6 — Proceso de paridad con upstream (M, 3-4 días setup; **paralelo desde Fase 1**)

- `docs/upstream-map.md`: tabla `packages/loot-core/src/... ↔ src/core/...`. Semilla automática:
  ```bash
  grep -rn "Ported from" src/core   # ya hay comentarios de trazabilidad en casi todo el core
  ```
  Columna "último commit upstream sincronizado". Correspondencias clave ya verificadas: `server/sync/index.ts ↔ core/sync/{apply,fullSync}.ts`, `server/budget/{envelope,base}.ts ↔ core/domain/{spreadsheet,budgets}`, `server/budget/goal-template* ↔ core/domain/goals/{engine,parse}.ts`, `server/transactions/transaction-rules.ts ↔ core/domain/rules/{prepare,apply}.ts`, `server/spreadsheet/ ↔ core/domain/spreadsheet/`, AQL `server/aql ↔ core/queries/`.
- `UPSTREAM_VERSION` en la raíz: tag/commit de `../actual` al que `src/core` está al día.
- `scripts/upstream-diff.sh`:
  ```bash
  #!/bin/bash
  NEW_TAG=${1:?uso: upstream-diff.sh <tag-upstream>}
  BASE=$(cat UPSTREAM_VERSION)
  git -C ../actual diff "$BASE".."$NEW_TAG" --stat -- \
    packages/loot-core/src/server packages/loot-core/src/shared packages/loot-core/migrations
  # cruzar con docs/upstream-map.md → checklist portar/evaluar/ignorar
  ```
- Checklist de release en `docs/upstream-sync.md`: script → triage por módulo de `domain/` → portar con tests → actualizar `UPSTREAM_VERSION` y mapa → actualizar `aql-parity.md`/`PARITY-PLAN.md`.

---

## Resumen de fases

| Fase | Contenido                                           | Esfuerzo        | Gate                                 |
| ---- | --------------------------------------------------- | --------------- | ------------------------------------ |
| 0    | Baseline (tag, tests, screenshots)                  | XS              | Números registrados                  |
| 1    | Saneamiento + esqueleto estructura                  | M               | tsc + 742/743, diff solo estructural |
| 2    | Rutas thin → features/\*/screens/                   | M-L             | Maestro + screenshots por ruta       |
| 3    | 7 migraciones schema upstream                       | M               | Tests migración + fixture paridad    |
| 4    | Spike + infra HeroUI/Uniwind/theme                  | M (riesgo alto) | Toggle tema dual, EAS preview        |
| 5    | Strangler pantalla a pantalla; borrar design-system | L (incremental) | grep design-system = 0               |
| 6    | Proceso upstream (mapa, script, checklist)          | M (paralelo)    | Script funcionando contra ../actual  |

## Archivos críticos

- `tsconfig.json` — aliases muertos (F1)
- `src/design-system/index.ts` — inversión a limpiar (F1); carpeta a borrar (F5)
- `src/design-system/providers/ThemeProvider.tsx` → `src/theme/ThemeProvider.tsx` — dueño del tema, puente prefsStore↔Uniwind (F4), `useThemedStyles` a erradicar (F5)
- `src/design-system/tokens/colors.ts` → valores para `src/theme/global.css` (F4)
- `metro.config.js` — `withUniwind(getSentryExpoConfig(...))`, punto de riesgo (F4)
- `src/core/db/schema.ts` — schema congelado `1765518577215` (F3)
- `CLAUDE.md` — actualizar convenciones en F1 y F5

## Verificación transversal

`pnpm test` (742/743) · `npx tsc --noEmit` (sin errores nuevos sobre los 6 pre-existentes) · `pnpm lint` · recorrer budget→spending→account→schedule→settings en simulador vs screenshots baseline light/dark · `pnpm e2e` (Maestro) al cierre de F2 y F5 · `pnpm build:preview` al cierre de F4.

---

## Cleanups diferidos (deuda conocida — anotado 2026-07-13)

Detectados durante `/simplify` de la migración de BudgetScreen. Se dejaron a propósito (cambian
comportamiento o tocan legacy); abordar cuando toque la pieza correspondiente:

1. **`src/ui/Money.tsx` no respeta las prefs de moneda/formato/privacidad.** Usa `NumberValue`
   (Intl) con `currency="USD"` hardcodeado, así ignora `numberFormat` / `defaultCurrencyCode` /
   `hideFraction` / privacy mask que sí honran `Amount` (`src/design-system/atoms/Amount.tsx`) y
   `AmountText` (`src/screens/transactions/components/AmountText.tsx` → `formatCents`). Afecta a
   Budget + 3 pantallas de transacciones que ya consumen `Money`. **Al tocar:** hacer `Money`
   pref-aware (o migrarlo a `formatCents`/`AmountText`) en un cambio dedicado, no mecánico.
2. **Regla "tono por signo" duplicada en 4 sitios.** `Money` (`tone="auto"`), `AvailableChip`
   (success/danger/default), `AmountText` (inflow) y `SPill.tsx`. Cuando un 3.er consumidor necesite
   sign-coloring, promover un helper único (p.ej. en `src/lib/colors.ts`) en vez de re-implementarlo.
3. **Agrupación de categorías duplicada.** `src/screens/budget/hooks/useBudgetSections.ts` repite la
   lógica de `EditBudgetScreen.tsx` (grupo sintético `__hidden__`, income al final). `useBudgetSections`
   es el hogar canónico nuevo; al migrar `EditBudgetScreen` (F5), que consuma ese hook.
