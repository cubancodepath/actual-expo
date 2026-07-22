// RN implementation of the filesystem capability, backed by expo-file-system's
// legacy API. This is the ONLY module in src/core that imports the native fs
// dependency — everything else imports from here (`@/core/platform/fs`).
// Mirrors upstream's `#platform/server/fs`.
//
// (In vitest this resolves to src/__mocks__/expo-file-system/legacy.ts via the
// config alias, so the platform boundary is transparently mocked in Node tests.)
export {
  documentDirectory,
  EncodingType,
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  readDirectoryAsync,
  deleteAsync,
  getInfoAsync,
} from "expo-file-system/legacy";
