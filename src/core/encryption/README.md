# Encryption (E2E)

End-to-end encryption for synced budgets, a **faithful port** of Actual's
`loot-core` implementation. The crypto and wire protocol are **byte-compatible**
with upstream: a key created on desktop decrypts on mobile and vice-versa
(AES-256-GCM, IV 12 B, auth tag 16 B / 128-bit, PBKDF2-SHA512 × 10000, 256-bit
key; same `user-get-key` / `reset-user-file` / `user-create-key` endpoints and
the same `testContent` shape).

## Module map (upstream → here)

| upstream (`loot-core/src/server`)                | here                               |
| ------------------------------------------------ | ---------------------------------- |
| `encryption/index.ts` (Key + crypto)             | `src/core/encryption/index.ts`     |
| `encryption/internals.*`                         | `src/core/encryption/internals.ts` |
| `encryption/app.ts` (`keyMake`,`keyTest`)        | `src/core/encryption/app.ts`       |
| `sync/make-test-message.ts`                      | `src/core/sync/makeTestMessage.ts` |
| `cloud-storage.ts` (`checkKey`,`resetSyncState`) | `src/core/sync/cloudStorage.ts`    |
| `sync/reset.ts` (`resetSync`)                    | `src/core/sync/reset.ts`           |
| `platform/server/asyncStorage` (`encrypt-keys`)  | `src/core/platform/keyStore.ts`    |
| (key loading on file open)                       | `src/core/encryption/keys.ts`      |

The password UI is a route form-sheet (`app/(auth)/encryption-password.tsx` →
`src/screens/encryption/EncryptionPasswordScreen`), driven imperatively via
`promptForPassword` / `promptToEnableEncryption`
(`src/ui/feedback/EncryptionPasswordPrompt.tsx`, a navigation↔promise bridge).

## Divergences from upstream — and why

Everything **pure** (crypto, protocol, function names, `{}` / `{ error: { reason } }`
return shapes) matches upstream. The remaining differences are forced by the
platform or our architecture, never by preference, and none break interop with a
real Actual server.

### Platform-forced (React Native ≠ browser/Node)

- **Crypto backend: `@noble` (raw `Uint8Array` keys) instead of WebCrypto
  (`CryptoKey`).** Hermes has no `crypto.subtle`. Same KDF/cipher params, so the
  derived key bytes are identical → byte-compatible.
- **Key persistence: Keychain/Keystore (`core/platform/keyStore`,
  expo-secure-store) instead of upstream's unencrypted `asyncStorage
'encrypt-keys'` map.** Hardware-backed, device-only — a security improvement.
  The platform-abstraction shape still mirrors upstream.
- **No `connection.send('prefs-updated')`.** There's no loot-core connection bus;
  UI refreshes through Zustand stores instead.
- **Native upload.** `resetSync` uploads via `services/budgetfiles.uploadBudget`
  (expo-sqlite `serialize` + filesystem) instead of `cloud-storage.upload()`, so
  it lives in `services` and `core` reaches it by **dynamic import** — the same
  documented port-compromise `core/sync/fullSync.ts` uses.
- **`clearLocalSyncState` omits `ANALYZE; VACUUM`.** VACUUM fails under
  expo-sqlite ("no other SQL statements in progress"); the same reason the upload
  path uses `serialize`. The row `DELETE`s are identical.

### Architecture (no loot-core "server app")

- **No `app.method('key-make', …)` message bus.** Upstream registers `key-make` /
  `key-test` handlers; we export plain `keyMake` / `keyTest` functions called
  directly. Same names, no bus.
- **Prefs = `metadata.json` + `budgetContextStore`, not `prefs.savePrefs`.** No
  global `prefs` module. `resetSync` writes metadata (dynamic import); the store
  update (`encryptKeyId` / `groupId`) happens in the **screen** (upstream instead
  does `loadAllFiles()` + `sync()`).
- **Explicit `EncryptionContext`** (serverUrl / token / cloudFileId / budgetId)
  instead of reading globals (`getServer()` / `prefs`). Keeps `core` pure and
  testable.
- **`keyMake` returns `{ groupId }`** so the screen can update the budget context
  directly (upstream returns `{}` and reloads the files list).

### Minor

- **`keyTest` does not write `encryptKeyId` to metadata** — matching upstream's
  "prefs not loaded" branch (it's set when the file is opened/downloaded).
- **`makeTestMessage`** encodes its random fields as base64 vs upstream's
  `Buffer.toString()`. It's opaque round-trip test data — no interop impact.
- **`loadKeyForBudget` / `loadAllPersistedKeys`** are a mobile bootstrap concern
  (load persisted keys into memory); upstream loads the key inline on file open.
