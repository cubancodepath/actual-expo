// RN implementation of the sqlite capability, backed by expo-sqlite. This is
// the ONLY module in src/core that imports the native sqlite dependency at
// runtime; the rest of core opens/queries the DB through here.
//
// (In vitest this resolves to src/__mocks__/expo-sqlite.ts via the config
// alias, so the platform boundary is transparently mocked in Node tests.)
export { openDatabaseAsync } from "expo-sqlite";
export type { SQLiteDatabase, SQLiteBindParams } from "./index-types";
