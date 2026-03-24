import { randomUUID } from "expo-crypto";

import * as internals from "./internals";
import type { KeyValue } from "./internals";

let keys: Record<string, Key> = {};

class Key {
  private id: string;
  private value: KeyValue | undefined;

  constructor({ id }: { id?: string }) {
    this.id = id ?? randomUUID();
  }

  async createFromPassword({ password, salt }: { password: string; salt: string }) {
    this.value = await internals.createKey({ secret: password, salt });
  }

  async createFromBase64(str: string) {
    this.value = await internals.importKey(str);
  }

  getId(): string {
    return this.id;
  }

  getValue(): KeyValue {
    if (!this.value) throw new Error("Key has no value — call createFrom* first");
    return this.value;
  }

  serialize(): { id: string; base64: string } {
    return {
      id: this.id,
      base64: this.getValue().base64,
    };
  }
}

export function getKey(keyId: string): Key {
  if (keyId == null || keys[keyId] == null) {
    throw new Error("missing-key");
  }
  return keys[keyId];
}

export function hasKey(keyId: string): boolean {
  return keyId in keys;
}

export async function encrypt(value: Uint8Array, keyId: string) {
  return internals.encrypt(getKey(keyId), value);
}

export async function decrypt(
  encrypted: Uint8Array,
  meta: { keyId: string; algorithm: string; iv: string; authTag: string },
) {
  return internals.decrypt(getKey(meta.keyId), encrypted, meta);
}

export function randomBytes(n: number): Uint8Array {
  return internals.randomBytes(n);
}

export async function loadKey(key: Key | { id: string; base64: string }): Promise<void> {
  let keyInstance: Key;
  if (!(key instanceof Key)) {
    keyInstance = new Key({ id: key.id });
    await keyInstance.createFromBase64(key.base64);
  } else {
    keyInstance = key;
  }
  keys[keyInstance.getId()] = keyInstance;
}

export function unloadKey(key: Key): void {
  delete keys[key.getId()];
}

export function unloadAllKeys(): void {
  keys = {};
}

export async function createKey({
  id,
  password,
  salt,
}: {
  id?: string;
  password: string;
  salt: string;
}): Promise<Key> {
  const key = new Key({ id });
  await key.createFromPassword({ password, salt });
  return key;
}
