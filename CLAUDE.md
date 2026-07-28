# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Start Expo dev server (Metro bundler only)
npm run ios            # Build & run dev variant on iOS simulator (APP_VARIANT=development)
npm run ios:prod       # Build & run production variant on iOS simulator
npx tsc --noEmit       # Type check (clean — 0 errors)
docker-compose up      # Local Actual Budget server on http://localhost:5006
npm run lint           # Lint with oxlint
npm run lint:fix       # Lint and auto-fix with oxlint
npm run fmt            # Format with oxfmt
npm run fmt:check      # Check formatting without writing
npm run build:preview  # Local preview build (ad-hoc distribution, installable on device)
npm run build:prod     # Local production build (.ipa for App Store/TestFlight)
npm run submit:ios     # Upload latest build to App Store Connect
npm run release:ios    # Build + upload in one command
```

Unit tests use Vitest (`npm test`). Linting uses oxlint (`.oxlintrc.json`). Formatting uses oxfmt (`.oxfmtrc.json`).

## Architecture

Mobile client for [Actual Budget](https://actualbudget.com/) — local-first budgeting app with CRDT-based sync.

**Stack**: Expo 55 / React Native 0.83 / React 19 / Zustand 5 / expo-sqlite (raw SQL) / Expo Router 55 / TanStack Query 5 / i18next (EN+ES) / Sentry

### Source Layout

> **Screens-first.** [`ARCHITECTURE.md`](./ARCHITECTURE.md) is the source of truth for folder
> organization. The strangler migration is **finished**: `src/features/` and
> `src/design-system/` were deleted, along with the routes that still depended on them.
> All UI is HeroUI Native under `src/screens/` and `src/ui/`.

```
src/
├── core/                   # Domain logic — NO React, UI, or react-query imports allowed here.
│   │                       # Mirrors upstream loot-core's src/ layout (server/ + shared/ + types/).
│   ├── crdt/               # HLC timestamps (timestamp.ts), Merkle tree diff (merkle.ts)
│   │                       #   TODO(align): upstream ships this as its own package (packages/crdt)
│   ├── errors/             # ActualError, ErrorCode — core only THROWS, never emits to the UI bus
│   ├── proto/              # Protobuf definitions (see crdt/ — same upstream package)
│   ├── platform/           # Capability seams — one dir per capability with a NAMED interface
│   │                       #   (types.ts: PlatformFileSystem, PlatformSqlite, PlatformCrypto,
│   │                       #   PlatformHttp, PlatformAsyncStorage, PlatformKeyStore,
│   │                       #   PlatformLocation), a native adapter (index.ts — the only place
│   │                       #   expo-*/MMKV/ky may be imported) and, where Node needs one, an
│   │                       #   index.node.ts impl that vitest swaps in via resolve.alias.
│   │                       #   Contracts use OUR vocabulary (fs.readFile, db.all, http.get →
│   │                       #   ActualError) — no vendor naming crosses the seam.
│   ├── shared/             # Pure logic shared with UI (upstream loot-core/src/shared):
│   │                       #   months, util (number/currency format), currencies, arithmetic,
│   │                       #   schedules (status/recurrence/preview), tags (note parsing),
│   │                       #   transactions (split math), location-utils
│   ├── types/              # prefs.ts + models/ — one file per entity (account, category,
│   │                       #   transaction, payee, rule, schedule, templates…), upstream names
│   └── server/             # Engine by domain (upstream loot-core/src/server; index.ts per
│       │                   #   domain instead of app.ts — no IPC layer, UI calls directly):
│       ├── db/             # SQLite connection, query helpers, CRDT write helpers (insert/
│       │                   #   insertWithUUID/update/delete_), entity SQL, sort.ts, schema, migrations
│       ├── sync/           # fullSync, syncEvents, encoder (protobuf + AES), clock
│       ├── encryption/     # AES-256-GCM via @noble/ciphers, PBKDF2 key derivation
│       ├── aql/            # AQL query engine: compiler, exec, schema, views (faithful port)
│       ├── accounts/       # Account CRUD (raw SQL)
│       ├── auth/, budgetfiles/, server-info/  # sync-server transport + handlers
│       ├── budget/         # Category CRUD (index.ts) + sort-categories, budget actions
│       │                   #   (actions.ts), envelope/tracking cells, goal-template +
│       │                   #   category-template-context + goal-template-parser,
│       │                   #   cleanup-template*. Solo el MOTOR: describir, dar forma o
│       │                   #   validar un template es UI y vive en screens/budget/goals/
│       ├── forecast/       # forecast-* files, upstream names
│       ├── notes/, tags/, payees/  # payees includes payee-locations (like upstream)
│       ├── preferences/    # Synced prefs, feature flags, format config, global prefs
│       ├── rules/          # Rule/Condition/Action classes, indexer, formulas
│       ├── schedules/      # CRUD/post/advance, find-schedules, preview
│       ├── spreadsheet/    # spreadsheet (engine), graph-data-structure, util
│       │                   #   (resolveName), bindings (cell names), warm-cache
│       ├── transactions/   # CRUD, transaction-rules (rule running/learning), transfer,
│       │                   #   merge, save pipeline, export/
│       ├── undo.ts          # Undo/redo engine (marker history, withUndo/undoable, redo)
│       └── sheet.ts        # Spreadsheet lifecycle: owns the loaded instance
│                           #   (loadSpreadsheet/unloadSpreadsheet/getSpreadsheet,
│                           #   one per budget file) + ensureMonthRange + sync refresh
│
├── screens/                # ALL UI, organized by screen (mirrors the navigation tree), e.g.:
│   ├── auth/               # OpenIdSignInScreen/, PasswordSignInScreen/, ServerConnectScreen/ — migrated
│   ├── budget/, transactions/, accounts/, files/  # each: <ScreenName>/ (index.tsx + private
│   │                       #   components/ + hooks/) plus a domain-shared components/ and hooks/
│   └── reports/, spending/, schedules/, settings/  # all HeroUI Native
│
├── ui/                     # Cross-domain custom pieces ONLY — heroui-native components are
│   │                       # imported directly in screens (no wrapper layer). e.g.:
│   ├── Money.tsx, PickerScreen.tsx, ScreenHeader/, amount-keyboard/, navigation/
│   └── feedback/           # ErrorBoundary, ErrorChannelConsumer, EncryptionPasswordPrompt, InlineError
│
├── stores/                 # Zustand — PURE STATE slices (own state + actions that only touch
│   │                       #   own state or core). A store NEVER imports another store.
│   │                       #   sessionStore (session), budgetContextStore (open budget + sync
│   │                       #   coords), syncStore (sync status + conflict), budgetUIStore,
│   │                       #   undoStore, pickerStore, tabBarStore, uiPrefsStore.
│   │                       #   session.selectors.ts = read-only composition; prefsStorage.ts =
│   │                       #   MMKV/SecureStore persistence adapter.
│   └── operations/         # Cross-store WORKFLOWS (upstream slice thunks). One-way deps
│                           #   operations → stores → core, so stores stay cycle-free:
│                           #   budgetfiles.ts (loadBudget/closeBudget/closeAndLoad/…),
│                           #   users.ts (signOut), syncRecovery.ts (resetSync/redownloadBudget/
│                           #   handleSyncFileError), resetStores.ts, autoRecoveryGuard.ts.
│                           #   (No src/services/: side effects live in core/server + core/platform.)
│
├── lib/                    # Pure app-level utilities, no React: colors, badge
│                           #   (date/currency/format live in @/core/shared: months, util, currencies)
│   ├── errors/             # ErrorChannel bus (emitErrorEvent, toErrorCode) + install.ts
│   ├── queries/            # AQL reactive layer: liveQuery, pagedQuery, queryCache (upstream's
│   │                       #   desktop-client/src/queries). The ENGINE is core/server/aql/
│   ├── tanstack/           # TanStack Query wiring: queryClient singleton, ambient types.
│   │                       #   Named for the library so it can't be confused with queries/ above
│   └── hooks/              # Truly global React hooks (useQuery, useLocale...); single-domain
│                           #   hooks live in screens/<domain>/hooks/ instead
│
├── i18n/                   # react-i18next config + locale files (en/, es/)
│
├── hooks/                  # Top-level cross-feature hooks — globals move to `lib/hooks/`,
│                           #   single-domain ones to `screens/<domain>/hooks/`
│
└── __mocks__/              # Vitest stubs for native modules
```

### Routes (`app/`)

File-based routing with Expo Router. Three protected groups:

- `(public)/`: Login, onboarding, local setup
- `(files)/`: Budget file selection and creation
- `(auth)/`: Main app — tabs (accounts, budget, spending, reports), plus modal screens

Auth guard uses `<Stack.Protected guard={condition}>` in root `_layout.tsx`.

### Architecture Rules

1. **`src/core/` has zero UI, React, or react-query imports** — pure logic, safe to test in Node
2. **`src/screens/<domain>/` owns domain-specific UI** — import from `@/core/server/` + `@/core/shared/`, `@/ui/`, `@/stores/`, `@/lib/`
3. **`src/stores/` holds pure state slices** — a store never queries the DB and **never imports another store**; cross-store workflows live in `src/stores/operations/` (thunks: `operations → stores → core`)
4. **`app/` routes are thin re-exports** — `export { BudgetScreen as default } from '@/screens/budget/BudgetScreen'`; no business logic in `app/`, all UI lives under `src/screens/<domain>/`
5. **`src/ui/` never imports `@/screens/` or `@/stores/`** — stays screen-agnostic
6. **The legacy layers are gone** — `src/features/` and `src/design-system/` were deleted; `check:arch` fails if anything recreates them

Dependency direction: `app → screens → (ui | stores | lib) → core`. Enforced by `dependency-cruiser` (`npm run check:arch`, husky pre-commit) against the real module graph — dynamic `import()` and type-only imports included. Rules live in `.dependency-cruiser.cjs`.

### Path Aliases

```
@/*          → src/*
@modules/*   → modules/*
```

Single alias `@/` for everything under `src/` (the old `@core`/`@ds`/`@features`/`@shared` aliases were removed — they had zero usages). Import specific files (`@/screens/budget/BudgetScreen`, `@/ui/Money`, `@/lib/hooks/useQuery`).

### Key Patterns

- **Raw SQL everywhere**: No ORM. Queries use `db/index.ts` helpers (`runQuery`, `first`, `run`, `transaction`). Schema column names match Actual's original.
- **AQL queries**: the engine (compiler/exec/schema) lives in `src/core/server/aql/`; the reactive layer (`liveQuery`/`pagedQuery`/`queryCache`) in `src/lib/queries/`, matching upstream's `desktop-client/src/queries/`. `useQuery(q)` in `src/hooks/useQuery.ts` (migrating to `src/lib/hooks/`) wraps it for React.
- **Zustand stores**: Pure UI state. After mutations, re-query via hooks rather than `.getState().load()`.
- **Bootstrap flow** (`app/_layout.tsx`): Load prefs → open DB → load CRDT clock → open budget → show UI. Sync runs in background after ready.
- **Sync on foreground**: AppState listener triggers `fullSync()` when app returns to foreground. Also polls every 60s.
- **CRDT messages**: Each change = `{timestamp, dataset, row, column, value}`. Values serialized as `'0:'` (null), `'N:123'` (number), `'S:text'` (string).
- **Theme system**: heroui-native components (`import { Button } from "heroui-native"`, imported directly — no wrapper layer) styled with Uniwind `className`; tokens live in `global.css`. For imperative/non-className colors use `useThemeColor("token")` from `heroui-native`. Light/dark mode via system `useColorScheme()`.
- **Screen options**: Use `useStackOptions()` from `@/lib/hooks/useStackOptions` — returns `screen` / `modal` / `formSheet(detents)`, all built from HeroUI tokens. **Every `<Stack>`/`<Tabs>` must set one**: React Navigation paints its own background behind each screen and falls back to its theme (white) when `contentStyle`/`sceneStyle` is unset.
- **Modals**: Use Expo Router `presentation: "modal"` on Stack.Screen.
- **Surfaces**: follow HeroUI's model — don't invent elevation ladders.
  - A screen, a `fullScreenModal`, a route `modal` and a `formSheet` are all the same rung: canvas `bg-background`, cards `bg-surface` (the `Surface`/`Card`/`ListGroup` default). A route modal's elevation comes from its rounded corners, shadow and dimmed backdrop, not from a different token.
  - Inside a **floating container** (`BottomSheet`/`Dialog`/`Popover`/`Menu`) the library already paints `bg-overlay` — never override it. Because `--overlay` equals `--surface` in this theme, anything inside must step down: `variant="secondary"` on `ListGroup`/`Surface`, and on `Input`/`TextArea` too (HeroUI's `useIsOnSurface` auto-switch only fires inside a `Surface`, and overlays don't provide one).
  - `Card` and `ListGroup` have no colour of their own — both render a `Surface`. No component reads `*-foreground` container tokens; all text is `text-foreground`/`text-muted`.
- **Icons**: `lucide-react-native`, imported directly — no wrapper.
- **Preferences**: Non-sensitive in MMKV, auth token in expo-secure-store.
- **i18n**: `useTranslation()` from react-i18next. Keys in `src/i18n/locales/en/` and `src/i18n/locales/es/`.
