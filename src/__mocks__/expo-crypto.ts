// Stub for expo-crypto in vitest
export function getRandomBytes() {
  return new Uint8Array(16);
}

// Unique per call (not a fixed constant) — tests that create multiple
// related rows (e.g. a category + its group + an account) need distinct
// ids, or joins between them collide on a shared "mock-uuid" primary key.
let counter = 0;
export function randomUUID() {
  counter += 1;
  return `mock-uuid-${counter}`;
}
