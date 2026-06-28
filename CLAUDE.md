# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Start Expo dev server (Metro bundler only)
npm run ios            # Build & run dev variant on iOS simulator (APP_VARIANT=development)
npm run ios:prod       # Build & run production variant on iOS simulator
npx tsc --noEmit       # Type check (6 pre-existing errors from missing npm types — ignore)
docker-compose up      # Local Actual Budget server on http://localhost:5006
npm run lint           # Lint with oxlint
npm run lint:fix       # Lint and auto-fix with oxlint
npm run fmt            # Format with oxfmt
npm run fmt:check      # Check formatting without writing
npm run e2e            # Run all Maestro E2E tests (requires app running in simulator)
npm run e2e:flow       # Run a single Maestro flow (e.g. npm run e2e:flow maestro/flows/login_screen.yaml)
npm run build:preview  # Local preview build (ad-hoc distribution, installable on device)
npm run build:prod     # Local production build (.ipa for App Store/TestFlight)
npm run submit:ios     # Upload latest build to App Store Connect
npm run release:ios    # Build + upload in one command
```

Unit tests use Vitest (`npm test`). E2E tests use Maestro (YAML flows in `maestro/flows/`). Linting uses oxlint (`.oxlintrc.json`). Formatting uses oxfmt (`.oxfmtrc.json`).

## Architecture

Mobile client for [Actual Budget](https://actualbudget.com/) — local-first budgeting app with CRDT-based sync.

**Stack**: Expo 55 / React Native 0.83 / React 19 / Zustand 5 / expo-sqlite (raw SQL) / Expo Router 55 / TanStack Query 5 / i18next (EN+ES) / Sentry

### Source Layout

```
src/
├── core/                   # Domain logic — NO React or UI imports allowed here
│   ├── db/                 # SQLite connection, query helpers, schema, migrations
│   ├── crdt/               # HLC timestamps (timestamp.ts), Merkle tree diff (merkle.ts)
│   ├── sync/               # fullSync, syncEvents, encoder (protobuf + AES), undo, clock
│   ├── encryption/         # AES-256-GCM via @noble/ciphers, PBKDF2 key derivation
│   ├── errors/             # AppError, SyncError, PostError, toAppError
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
├── design-system/          # UI component library — single source of truth for UI
│   ├── tokens/             # Design tokens: colors.ts, typography.ts, spacing.ts, borders.ts
│   ├── atoms/              # Primitive components: Text, Button, Amount, Icon, Input, Badge...
│   ├── molecules/          # Composite components: ListItem, SearchBar, Banner, CategoryPickerList...
│   ├── swift-ui/           # Native SwiftUI bridge components (SText, SAmount, SPill, SSectionHeader...)
│   ├── providers/          # ThemeProvider
│   └── index.ts            # Barrel export for atoms + molecules
│
├── features/               # Feature-Sliced: each feature owns its components and hooks
│   ├── accounts/           # components/ (TransactionListItem, Balance...) + hooks/
│   ├── budget/             # components/ (ExpenseCategoryListItem, MonthPicker...) + hooks/
│   ├── transactions/       # components/ (TransactionForm, CurrencyInput...) + hooks/transactionList/
│   ├── spending/           # components/ (SpendingOverviewCard, CategoryBreakdownRow)
│   ├── reports/            # components/ (dashboard cards) + hooks/ (useNetWorth, useCashFlow...)
│   ├── schedules/          # hooks/ (useSchedules)
│   └── settings/           # hooks/ (useBudgetFiles, useFileActionSheet)
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
├── shared/                 # Cross-feature utilities (not specific to any feature)
│   ├── hooks/              # useSheetValue, useSyncedPrefs, useErrorHandler, useSelectionMode...
│   ├── navigation/         # screenOptions (themedScreenOptions, themedModalOptions)
│   └── ErrorBoundary.tsx
│
├── services/               # Side-effect services (auth, file management, encryption)
│   ├── authService.ts      # Login, bootstrap (connect to server, download budget)
│   ├── budgetfiles.ts      # Open/close/switch budget, list files
│   ├── budgetMetadata.ts   # Local budget metadata (exists, dir management)
│   └── encryptionService.ts# Key derivation, key storage, per-budget keys
│
├── i18n/                   # react-i18next config + locale files (en/, es/)
├── lib/                    # Pure utilities: currency, date, format, colors, badge, syncShortcutCache
└── __mocks__/              # Vitest stubs for native modules
```

### Routes (`app/`)

File-based routing with Expo Router. Three protected groups:

- `(public)/`: Login, onboarding, local setup
- `(files)/`: Budget file selection and creation
- `(auth)/`: Main app — tabs (accounts, budget, spending, reports), plus modal screens

Auth guard uses `<Stack.Protected guard={condition}>` in root `_layout.tsx`.

### Architecture Rules

1. **`src/core/` has zero UI imports** — pure logic, safe to test in Node
2. **`src/features/` owns domain-specific UI** — import from `@/core/domain/`, `@/design-system/`, `@/stores/`
3. **`src/stores/` holds only UI state** — never queries the DB directly
4. **`app/` routes are thin** — no business logic, call into features/ hooks

### Path Aliases

```
@/*          → src/*
@core/*      → src/core/*
@ds/*        → src/design-system/*
@features/*  → src/features/*
@shared/*    → src/shared/*
```

Import from the barrel `@/design-system` for atoms/molecules. Import specific files for features.

### Key Patterns

- **Raw SQL everywhere**: No ORM. Queries use `db/index.ts` helpers (`runQuery`, `first`, `run`, `transaction`). Schema column names match Actual's original.
- **AQL queries**: `src/core/queries/` has a full query compiler + liveQuery system. `useQuery(q)` in `src/shared/hooks/useQuery.ts` wraps it for React.
- **Zustand stores**: Pure UI state. After mutations, re-query via hooks rather than `.getState().load()`.
- **Bootstrap flow** (`app/_layout.tsx`): Load prefs → open DB → load CRDT clock → open budget → show UI. Sync runs in background after ready.
- **Sync on foreground**: AppState listener triggers `fullSync()` when app returns to foreground. Also polls every 60s.
- **CRDT messages**: Each change = `{timestamp, dataset, row, column, value}`. Values serialized as `'0:'` (null), `'N:123'` (number), `'S:text'` (string).
- **Theme system**: `useTheme()` from `@/design-system/providers/ThemeProvider`. `useThemedStyles(fn)` creates memoized themed StyleSheets. Colors follow Actual Budget's palette (purple accent `#8719e0`). Light/dark mode via system `useColorScheme()`.
- **Screen options**: Use `themedScreenOptions(theme)` / `themedModalOptions(theme)` from `@/shared/navigation/screenOptions`.
- **Modals**: Use Expo Router `presentation: "modal"` on Stack.Screen.
- **Icons**: `@expo/vector-icons` (Ionicons) — wrapped in `Icon` atom in `@/design-system/atoms/Icon`.
- **Preferences**: Non-sensitive in MMKV, auth token in expo-secure-store.
- **i18n**: `useTranslation()` from react-i18next. Keys in `src/i18n/locales/en/` and `src/i18n/locales/es/`.
