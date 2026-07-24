// Ported from loot-core src/types/util.ts (subset used by the app).
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
