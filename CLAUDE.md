# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Start Expo dev server (Metro bundler only)
npm run ios            # Build & run dev variant on iOS simulator (APP_VARIANT=development)
npm run ios:prod       # Build & run production variant on iOS simulator
npx tsc --noEmit       # Type check (pre-existing errors in FlashList estimatedItemSize — ignore those)
docker-compose up      # Local Actual Budget server on http://localhost:5006
npm run lint           # Lint with oxlint
npm run lint:fix       # Lint and auto-fix with oxlint
npm run fmt            # Format with oxfmt
npm run fmt:check      # Check formatting without writing
npm run e2e            # Run all Maestro E2E tests (requires app running in simulator)
npm run e2e:flow       # Run a single Maestro flow (e.g. npm run e2e:flow maestro/flows/login_screen.yaml)
```

Unit tests use Vitest (`npm test`). E2E tests use Maestro (YAML flows in `maestro/flows/`). Linting uses oxlint (`.oxlintrc.json`). Formatting uses oxfmt (`.oxfmtrc.json`).

## Architecture

Mobile client for [Actual Budget](https://actualbudget.com/) — local-first budgeting app with CRDT-based sync.

**Stack**: Expo 55 / React Native 0.83 / React 19 / Zustand 5 / expo-sqlite (raw SQL) / Expo Router 55

### Source Layout (`src/`)

- **Domain modules** (`accounts/`, `budgets/`, `categories/`, `payees/`, `transactions/`): Each has `index.ts` (CRUD queries using raw SQL) and `types.ts`. These query the SQLite DB directly via helpers from `db/index.ts`.
- **`db/`**: SQLite connection, query helpers (`runQuery`, `first`, `run`, `transaction`), schema + migrations in `schema.ts`, raw row types in `types.ts`.
- **`crdt/`**: HLC timestamps (`timestamp.ts`), Merkle tree diff (`merkle.ts`). Ported from Actual's loot-core.
- **`sync/`**: `index.ts` orchestrates full sync (collect local messages → protobuf encode → POST `/sync/sync` → decode → apply remote → save clock). `encoder.ts` handles protobuf + optional AES encryption.
- **`encryption/`**: AES-256-GCM via @noble/ciphers, PBKDF2 key derivation via @noble/hashes.
- **`stores/`**: Zustand stores — `accountsStore`, `budgetStore`, `categoriesStore`, `payeesStore`, `prefsStore` (MMKV + SecureStore), `syncStore`, `transactionsStore`.
- **`services/`**: `authService.ts` (login, bootstrap), `budgetfiles.ts` (file listing/creation).
- **`presentation/`**: UI layer — `providers/ThemeProvider.tsx`, `components/` (atoms + molecules), `navigation/screenOptions.ts`.
- **`theme/`**: Design tokens — `colors.ts` (Actual Budget palette, light/dark semantic tokens), `typography.ts`, `spacing.ts`, `borders.ts`, `shadows.ts`.

### Routes (`app/`)

File-based routing with Expo Router. Two protected groups:

- `(public)/`: Login (`index.tsx`), file selection (`files.tsx`)
- `(auth)/`: Main app — tabs (accounts, budget, spending, settings), plus modal screens (account/new, account/[id], transaction/new, categories, payees)

Auth guard uses `<Stack.Protected guard={isConfigured}>` in root `_layout.tsx`.

### Key Patterns

- **Raw SQL everywhere**: No ORM. All queries use `db/index.ts` helpers. Schema column names match Actual's original (`isParent`, `isChild`, `targetId`, `transferId`).
- **Zustand stores**: Each store has `load()` to fetch from DB and CRUD actions. Stores are independent (no cross-store subscriptions). After mutations, call `.getState().load()` to refresh.
- **Bootstrap flow** (`app/_layout.tsx`): Load prefs → open DB → load CRDT clock → pre-load stores → show UI. Sync runs in background after ready.
- **Sync on foreground**: AppState listener triggers `fullSync()` when app returns to foreground.
- **CRDT messages**: Each change = `{timestamp, dataset, row, column, value}`. Values serialized as `'0:'` (null), `'N:123'` (number), `'S:text'` (string).
- **Theme system**: `useTheme()` returns current theme, `useThemedStyles(fn)` creates memoized themed StyleSheets. Colors follow Actual Budget's palette (purple accent `#8719e0`). Light/dark mode via system `useColorScheme()`.
- **Modals**: Use Expo Router `presentation: "modal"` on Stack.Screen — not custom modal components.
- **Screen options**: Use `themedScreenOptions(theme)` / `themedModalOptions(theme)` from `presentation/navigation/screenOptions.ts`.
- **Reusable components**: Atomic design in `presentation/components/` — atoms (Text, Button, Card, Amount, Icon, Badge, Divider, Spacer, IconButton) and molecules (ListItem, SearchBar, Banner, EmptyState, SectionHeader). Import from `presentation/components/index.ts`.
- **Icons**: `@expo/vector-icons` (Ionicons) — wrapped in `Icon` atom component.
- **Preferences**: Non-sensitive in MMKV, auth token in expo-secure-store.
