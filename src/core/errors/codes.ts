export type ErrorCode =
  // network / transport
  | "network/offline"
  | "network/timeout"
  | "http/server-error"
  | "http/parse-error"
  | "http/rejected"
  // auth
  | "auth/unauthorized"
  | "auth/token-expired"
  | "auth/invalid-password"
  // sync
  | "sync/not-configured"
  | "sync/clock-drift"
  | "sync/out-of-sync"
  | "sync/invalid-schema"
  | "sync/encrypt-failure"
  | "sync/decrypt-failure"
  | "sync/key-missing"
  // sync file-state rejections from the server (validation.js reasons).
  // Conflict recovery (has-reset/has-new-key/old-version…) is owned by
  // syncRecovery + SyncConflictDialog at the app layer.
  | "sync/file-has-reset"
  | "sync/file-has-new-key"
  | "sync/file-old-version"
  | "sync/file-needs-upload"
  | "sync/file-not-found"
  | "sync/file-key-mismatch"
  // budget files
  | "file/upload-failed"
  | "file/download-failed"
  | "file/corrupt-archive"
  | "file/delete-failed"
  | "file/switch-failed"
  // local storage (filesystem/metadata)
  | "storage/read-failed"
  | "storage/write-failed"
  | "storage/delete-failed"
  | "storage/corrupt-data"
  // infra
  | "db/unavailable"
  | "unknown/unexpected"
  | "unknown/fatal";
