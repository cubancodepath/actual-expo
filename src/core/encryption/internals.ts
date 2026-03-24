import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { getRandomBytes } from "expo-crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type KeyValue = {
  raw: Uint8Array;
  base64: string;
};

export interface IKey {
  getId(): string;
  getValue(): KeyValue;
}

export function randomBytes(n: number): Uint8Array {
  return getRandomBytes(n);
}

export async function encrypt(
  masterKey: IKey,
  value: Uint8Array,
): Promise<{
  value: Uint8Array;
  meta: {
    keyId: string;
    algorithm: string;
    iv: string;
    authTag: string;
  };
}> {
  const iv = getRandomBytes(12);
  const keyBytes = masterKey.getValue().raw;

  const cipher = gcm(keyBytes, iv);
  const encryptedWithTag = cipher.encrypt(value);

  const authTag = encryptedWithTag.slice(-16);
  const ciphertext = encryptedWithTag.slice(0, -16);

  return {
    value: ciphertext,
    meta: {
      keyId: masterKey.getId(),
      algorithm: ENCRYPTION_ALGORITHM,
      iv: uint8ToBase64(iv),
      authTag: uint8ToBase64(authTag),
    },
  };
}

export async function decrypt(
  masterKey: IKey,
  encrypted: Uint8Array,
  meta: { algorithm: string; iv: string; authTag: string },
): Promise<Uint8Array> {
  if (meta.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error("unsupported crypto algorithm: " + meta.algorithm);
  }

  const keyBytes = masterKey.getValue().raw;
  const iv = base64ToUint8(meta.iv);
  const authTag = base64ToUint8(meta.authTag);

  const combined = new Uint8Array(encrypted.length + authTag.length);
  combined.set(encrypted, 0);
  combined.set(authTag, encrypted.length);

  const cipher = gcm(keyBytes, iv);
  return cipher.decrypt(combined);
}

export async function createKey({
  secret,
  salt,
}: {
  secret: string;
  salt: string;
}): Promise<KeyValue> {
  const secretBytes = new TextEncoder().encode(secret);
  const saltBytes = new TextEncoder().encode(salt);

  const keyBytes = await pbkdf2Async(sha512, secretBytes, saltBytes, {
    c: 10000,
    dkLen: 32,
  });

  return {
    raw: keyBytes,
    base64: uint8ToBase64(keyBytes),
  };
}

export async function importKey(base64Str: string): Promise<KeyValue> {
  const raw = base64ToUint8(base64Str);
  return { raw, base64: base64Str };
}
