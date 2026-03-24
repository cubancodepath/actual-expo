/**
 * CRDT value serialization — identical to loot-core.
 *
 * Wire format: '0:' (null), 'N:123' (number), 'S:text' (string).
 * Shared by sync/index.ts (apply) and sync/encoder.ts (protobuf).
 */

export function serializeValue(value: string | number | null): string {
  if (value === null) return "0:";
  if (typeof value === "number") return "N:" + value;
  return "S:" + value;
}

export function deserializeValue(value: string): string | number | null {
  if (value === "0:") return null;
  if (value.startsWith("N:")) return parseFloat(value.slice(2));
  if (value.startsWith("S:")) return value.slice(2);
  return value;
}
