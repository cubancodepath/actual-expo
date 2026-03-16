# GEMINI.md - actual-expo

## Project Overview

`actual-expo` is a local-first mobile client for [Actual Budget](https://actualbudget.com/), built with **Expo** and **React Native**. It features end-to-end encrypted synchronization using **CRDTs** (Conflict-free Replicated Data Types) and a **Merkle trie** for divergence detection, mirroring the synchronization logic of the original Actual Budget.

### Core Tech Stack

- **Framework:** Expo (v55) with Expo Router (File-based routing).
- **Language:** TypeScript.
- **State Management:** Zustand (located in `src/stores`).
- **Persistence:** Expo SQLite (located in `src/db`).
- **Sync Engine:** Custom CRDT implementation (located in `src/sync` and `src/crdt`).
- **Networking:** Binary protocol using `protobufjs` and `fflate`.
- **Security:** `@noble/ciphers` and `expo-crypto` for encryption.

## Architecture

### 1. Data Flow (CRDT-based)

- All mutations (creating/updating/deleting accounts, transactions, etc.) are converted into **Sync Messages**.
- Messages are processed via `sendMessages` in `src/sync/index.ts`.
- They are applied to the local SQLite database and recorded in the `messages_crdt` table.
- A background process (`fullSync`) periodically uploads new local messages and downloads server messages.

### 2. State Management

- UI state is managed by **Zustand** stores in `src/stores/`.
- After every message application (local or from server), `refreshAllStores()` is called to reload data from SQLite into the Zustand stores.

### 3. Directory Structure

- `app/`: Expo Router screens and layouts.
  - `(auth)/`: Protected routes (Accounts, Budget, Settings).
  - `(public)/`: Onboarding and server configuration.
- `src/`: Core logic.
  - `crdt/`: Low-level CRDT and Merkle trie implementation.
  - `db/`: Database schema and connection logic.
  - `presentation/`: UI components (Atoms, Molecules) and providers.
  - `services/`: High-level business logic.
  - `stores/`: Zustand store definitions.
  - `sync/`: Network synchronization and message encoding.

## Building and Running

### Commands

- `npm start`: Start the Expo development server.
- `npm run ios`: Run the application on an iOS simulator.
- `npm run android`: Run the application on an Android emulator.
- `npm run web`: Run the application in a web browser.

### Initialization

- The database is initialized via `openDatabase()` and `runSchema()` in `src/db/index.ts`.
- The CRDT clock is loaded via `loadClock()` in `src/sync/index.ts`.

## Development Conventions

### 1. UI Components (Atomic Design)

- Components are organized into **Atoms** (basic building blocks) and **Molecules** (complex components) in `src/presentation/components/`.
- Use the `useTheme` hook from `ThemeProvider` for styling.

### 2. Database Mutations

- **Never** write raw SQL `UPDATE` or `INSERT` directly for synced data.
- **Always** use `sendMessages` or high-level service functions (e.g., `createAccount`) to ensure changes are captured by the CRDT engine.

### 3. Testing

- `App.tsx` serves as a manual integration test runner for the CRDT protocol and DB writes.
- To run tests, ensure the app is pointing to `App.tsx` as the entry point or navigate to it if configured in the router.

### 4. Code Style

- Use TypeScript for all new code.
- Prefer functional components and hooks.
- Follow the existing pattern of lazy-loading stores in `src/sync/index.ts` to avoid circular dependencies.
