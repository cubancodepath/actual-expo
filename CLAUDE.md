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
├── core/                   # Domain logic — NO React, UI, or react-query imports allowed here
│   ├── db/                 # SQLite connection, query helpers, schema, migrations
│   ├── crdt/               # HLC timestamps (timestamp.ts), Merkle tree diff (merkle.ts)
│   ├── sync/               # fullSync, syncEvents, encoder (protobuf + AES), undo, clock
│   ├── encryption/         # AES-256-GCM via @noble/ciphers, PBKDF2 key derivation
│   ├── errors/             # ActualError, ErrorCode — core only THROWS, never emits to the UI bus
│   ├── queries/            # AQL query compiler, liveQuery, pagedQuery, queryCache, execute
│   ├── proto/              # Protobuf definitions
│   └── domain/             # Business domain modules (each with index.ts + types.ts):
│       ├── accounts/       # Account CRUD (raw SQL)
│       ├── budgets/        # Budget calculations, toBudget
│       ├── categories/     # Category queries + sort
│       ├── goals/          # Goal engine (schedule, savings, spending, progress)
│       ├── payees/         # Payee queries
│       ├── payee-locations/# Location-based payee suggestions
│       ├── preferences/    # Format config, feature flags
│       ├── rules/          # Auto-categorization rule engine
│       ├── schedules/      # Recurring transactions, recurrence logic
│       ├── spreadsheet/    # Live spreadsheet engine (bindings, envelope, sync)
│       ├── tags/           # Transaction tags
│       └── transactions/   # Transaction CRUD, split, transfer, save
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
├── stores/                 # Zustand — UI state ONLY (no SQL queries)
│   ├── prefsStore.ts       # MMKV + SecureStore (theme, token, active budget)
│   ├── budgetUIStore.ts    # Selected month, collapsed groups
│   ├── syncStore.ts        # Sync status
│   ├── undoStore.ts        # Undo/redo state
│   ├── privacyStore.ts     # Privacy mode
│   ├── pickerStore.ts      # Picker state
│   └── tabBarStore.ts      # Tab bar visibility
│
├── services/               # Side effects out to the world (auth, file management, encryption)
│   ├── authService.ts      # Login, bootstrap (connect to server, download budget)
│   ├── budgetfiles.ts      # Open/close/switch budget, list files
│   ├── budgetMetadata.ts   # Local budget metadata (exists, dir management)
│   ├── encryptionService.ts# Key derivation, key storage, per-budget keys
│   └── api/                # HTTP client (.api/.dto/.mappers/.types split)
│
├── lib/                    # Pure utilities, no React: currency, date, format, colors, screenOptions
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
2. **`src/screens/<domain>/` owns domain-specific UI** — import from `@/core/domain/`, `@/ui/`, `@/stores/`, `@/lib/`, `@/services/`
3. **`src/stores/` holds only UI state** — never queries the DB directly
4. **`app/` routes are thin re-exports** — `export { BudgetScreen as default } from '@/screens/budget/BudgetScreen'`; no business logic in `app/`, all UI lives under `src/screens/<domain>/`
5. **`src/ui/` never imports `@/screens/` or `@/stores/`** — stays screen-agnostic
6. **No new imports to legacy** — `@/features/`, `@/design-system/` may not gain new import sites; only removed as files migrate out

Dependency direction: `app → screens → (ui | stores | lib | services) → core`. Enforced by `scripts/check-arch.sh` (husky pre-commit).

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
