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

> **Screens-first is the current direction.** [`ARCHITECTURE.md`](./ARCHITECTURE.md) is the source
> of truth for folder organization. This is a **strangler migration**: every NEW file is born at
> its ARCHITECTURE.md destination; touching an existing legacy file means moving it there and
> updating imports. `src/features/` and `src/design-system/` are LEGACY — do not add new imports
> to either; files only leave them when touched and moved to their destination.

```
src/
├── core/                   # Domain logic — NO React, UI, or react-query imports allowed here.
│   │                       # Mirrors upstream loot-core's src/ layout (server/ + shared/ + types/).
│   ├── db/                 # SQLite connection, query helpers, schema, migrations
│   ├── crdt/               # HLC timestamps (timestamp.ts), Merkle tree diff (merkle.ts)
│   ├── sync/               # fullSync, syncEvents, encoder (protobuf + AES), clock
│   ├── encryption/         # AES-256-GCM via @noble/ciphers, PBKDF2 key derivation
│   ├── errors/             # ActualError, ErrorCode — core only THROWS, never emits to the UI bus
│   ├── queries/            # AQL query compiler, liveQuery, pagedQuery, queryCache, execute
│   ├── proto/              # Protobuf definitions
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
│       ├── accounts/       # Account CRUD (raw SQL)
│       ├── auth/, budgetfiles/, server-info/  # sync-server transport + handlers
│       ├── budget/         # Category CRUD (index.ts) + sort-categories, budget actions
│       │                   #   (actions.ts), envelope/tracking cells, goal-template +
│       │                   #   category-template-context + goal-template-parser,
│       │                   #   cleanup-template*, goals/ (editor-facing: automations,
│       │                   #   describe, progress, validate, fixedGoal — upstream keeps
│       │                   #   these in desktop-client)
│       ├── forecast/       # forecast-* files, upstream names
│       ├── notes/, tags/, payees/  # payees includes payee-locations (like upstream)
│       ├── preferences/    # Synced prefs, feature flags, format config, global prefs
│       ├── rules/          # Rule/Condition/Action classes, indexer, formulas
│       ├── schedules/      # CRUD/post/advance, find-schedules, preview
│       ├── spreadsheet/    # spreadsheet, graph-data-structure, globals, util, bindings
│       ├── transactions/   # CRUD, transaction-rules (rule running/learning), transfer,
│       │                   #   merge, save pipeline, export/
│       ├── undo.ts          # Undo/redo engine (marker history, withUndo/undoable, redo)
│       └── sheet.ts        # Spreadsheet lifecycle (initSpreadsheet/ensureMonthRange)
│
├── screens/                # ALL UI, organized by screen (mirrors the navigation tree), e.g.:
│   ├── auth/               # OpenIdSignInScreen/, PasswordSignInScreen/, ServerConnectScreen/ — migrated
│   ├── budget/, transactions/, accounts/, files/  # each: <ScreenName>/ (index.tsx + private
│   │                       #   components/ + hooks/) plus a domain-shared components/ and hooks/
│   └── reports/, spending/, schedules/, settings/, onboarding/  # not yet migrated (still in legacy
│                           #   src/features/, see below) — migrate opportunistically when touched
│
├── ui/                     # Cross-domain custom pieces ONLY — heroui-native components are
│   │                       # imported directly in screens (no wrapper layer). e.g.:
│   ├── Money.tsx, PickerScreen.tsx, ScreenHeader/, amount-keyboard/, navigation/
│   ├── feedback/           # ErrorBoundary, ErrorChannelConsumer, EncryptionPasswordPrompt, InlineError
│   └── swift-ui/           # Native SwiftUI bridge components (SText, SAmount, SPill...)
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
├── lib/                    # Pure app-level utilities, no React: colors, screenOptions, badge
│                           #   (date/currency/format live in @/core/shared: months, util, currencies)
│   ├── errors/             # ErrorChannel bus (emitErrorEvent, toErrorCode) + install.ts
│   ├── query/               # TanStack Query wiring: queryClient singleton, ambient types
│   └── hooks/              # Truly global React hooks (useQuery, useLocale...); single-domain
│                           #   hooks live in screens/<domain>/hooks/ instead
│
├── i18n/                   # react-i18next config + locale files (en/, es/)
│
├── hooks/                  # LEGACY top-level cross-feature hooks — being strangled: globals move
│                           #   to `lib/hooks/`, single-domain ones move to `screens/<domain>/hooks/`.
├── features/               # LEGACY (Feature-Sliced) — being strangled, do not add new imports.
│                           #   Still holds: reports/, spending/, schedules/, settings/ hooks,
│                           #   plus components not yet moved for budget/transactions/accounts.
├── design-system/          # LEGACY — being strangled, do not add new imports. Replaced by
│                           #   heroui-native components used directly in screens; only pieces
│                           #   heroui doesn't offer AND 2+ domains use graduate to `src/ui/`.
│                           #   (tokens/, atoms/, molecules/, swift-ui/, providers/ThemeProvider)
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
6. **No new imports to legacy** — `@/features/`, `@/design-system/` may not gain new import sites; only removed as files migrate out

Dependency direction: `app → screens → (ui | stores | lib) → core`. Enforced by `scripts/check-arch.sh` (husky pre-commit).

### Path Aliases

```
@/*          → src/*
@modules/*   → modules/*
```

Single alias `@/` for everything under `src/` (the old `@core`/`@ds`/`@features`/`@shared` aliases were removed — they had zero usages). Import specific files (`@/screens/budget/BudgetScreen`, `@/ui/Money`, `@/lib/hooks/useQuery`); legacy `@/design-system` and `@/features` imports are frozen, not a target for new usage.

### Key Patterns

- **Raw SQL everywhere**: No ORM. Queries use `db/index.ts` helpers (`runQuery`, `first`, `run`, `transaction`). Schema column names match Actual's original.
- **AQL queries**: `src/core/queries/` has a full query compiler + liveQuery system. `useQuery(q)` in `src/hooks/useQuery.ts` (migrating to `src/lib/hooks/`) wraps it for React.
- **Zustand stores**: Pure UI state. After mutations, re-query via hooks rather than `.getState().load()`.
- **Bootstrap flow** (`app/_layout.tsx`): Load prefs → open DB → load CRDT clock → open budget → show UI. Sync runs in background after ready.
- **Sync on foreground**: AppState listener triggers `fullSync()` when app returns to foreground. Also polls every 60s.
- **CRDT messages**: Each change = `{timestamp, dataset, row, column, value}`. Values serialized as `'0:'` (null), `'N:123'` (number), `'S:text'` (string).
- **Theme system**: heroui-native components (`import { Button } from "heroui-native"`, imported directly — no wrapper layer) styled with Uniwind `className`; tokens live in `global.css`. For imperative/non-className colors use `useThemeColor("token")` from `heroui-native`. Light/dark mode via system `useColorScheme()`. (Legacy screens still on `@/design-system/providers/ThemeProvider`'s `useTheme()`/`useThemedStyles` — do not use these patterns in new code.)
- **Screen options**: Use `themedScreenOptions(theme)` / `themedModalOptions(theme)` from `@/lib/screenOptions`.
- **Modals**: Use Expo Router `presentation: "modal"` on Stack.Screen.
- **Icons**: `lucide-react-native` on migrated screens (direct import, no wrapper). Legacy screens still use `@expo/vector-icons` (Ionicons) via the `Icon` atom in `@/design-system/atoms/Icon` — don't add new usages of it.
- **Preferences**: Non-sensitive in MMKV, auth token in expo-secure-store.
- **i18n**: `useTranslation()` from react-i18next. Keys in `src/i18n/locales/en/` and `src/i18n/locales/es/`.
