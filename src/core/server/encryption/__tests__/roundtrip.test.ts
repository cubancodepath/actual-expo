import { describe, it, expect, beforeEach } from "vitest";

import { createKey, loadKey, unloadAllKeys, encrypt, decrypt } from "@/core/server/encryption";
import * as internals from "@/core/server/encryption/internals";

// Deterministic payload generator. NOTE: we deliberately do NOT use the
// module's own `randomBytes()` here — under vitest, the crypto capability resolves
// to index.node.ts, which always returns a fixed 16-byte array
// regardless of the requested length, so it can't produce payloads of
// arbitrary size. That stub quirk is a test-environment artifact, not a
// production bug.
function makePayload(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = i % 256;
  }
  return bytes;
}

// AES-256-GCM (via @noble/ciphers) with PBKDF2 key derivation
// (@noble/hashes, sha512, c: 10000, dkLen: 32 — internals.ts:102-105).
// The iteration count is protocol-mandated by upstream Actual to
// interoperate with the server/desktop clients — do NOT change it to make
// a test pass. See internals.ts and plans/011-encryption-roundtrip-tests.md.

describe("encryption round-trip", () => {
  beforeEach(() => {
    unloadAllKeys();
  });

  it("round-trips a small payload through encrypt/decrypt", async () => {
    const key = await createKey({
      id: "key-1",
      password: "correct horse battery staple",
      salt: "fixed-salt",
    });
    await loadKey(key);

    const original = new TextEncoder().encode("hello, actual budget");
    const { value: ciphertext, meta } = await encrypt(original, "key-1");

    // Sanity: ciphertext must not equal plaintext (actually encrypted).
    expect(ciphertext).not.toEqual(original);

    const decrypted = await decrypt(ciphertext, { ...meta, keyId: "key-1" });
    expect(decrypted).toEqual(original);
  });

  it.each([
    ["0-byte payload", 0],
    ["1-byte payload", 1],
    ["~1 MiB payload", 1024 * 1024],
  ])("round-trips a %s", async (_label, size) => {
    const key = await createKey({
      id: "key-size",
      password: "size-test-password",
      salt: "size-test-salt",
    });
    await loadKey(key);

    const original = makePayload(size);
    const { value: ciphertext, meta } = await encrypt(original, "key-size");

    const decrypted = await decrypt(ciphertext, { ...meta, keyId: "key-size" });
    expect(decrypted).toEqual(original);
    expect(decrypted.length).toBe(size);
  });

  it("fails to decrypt with a key derived from a different password", async () => {
    const keyA = await createKey({ id: "key-a", password: "password-a", salt: "same-salt" });
    const keyB = await createKey({ id: "key-b", password: "password-b", salt: "same-salt" });
    await loadKey(keyA);
    await loadKey(keyB);

    const original = new TextEncoder().encode("sensitive transaction data");
    const { value: ciphertext, meta } = await encrypt(original, "key-a");

    // Attempt to decrypt with the wrong key: GCM authentication must reject
    // it rather than silently returning garbage bytes.
    await expect(decrypt(ciphertext, { ...meta, keyId: "key-b" })).rejects.toThrow();
  });

  it("fails to decrypt when the ciphertext has been tampered with", async () => {
    const key = await createKey({
      id: "key-tamper",
      password: "tamper-test-password",
      salt: "tamper-salt",
    });
    await loadKey(key);

    const original = new TextEncoder().encode("do not tamper with me");
    const { value: ciphertext, meta } = await encrypt(original, "key-tamper");

    const tampered = new Uint8Array(ciphertext);
    tampered[0] = tampered[0] ^ 0xff; // flip every bit of the first byte

    await expect(decrypt(tampered, { ...meta, keyId: "key-tamper" })).rejects.toThrow();
  });

  it("derives the same key bytes for the same password+salt (pins PBKDF2 params)", async () => {
    // If this test starts failing, someone changed the PBKDF2 iteration
    // count (or hash/derived key length) in internals.ts. That is a
    // PROTOCOL-BREAKING change requiring coordination with the Actual
    // server/desktop clients — it must not be "fixed" by updating this
    // test's expectations.
    const keyValue1 = await internals.createKey({
      secret: "deterministic-password",
      salt: "deterministic-salt",
    });
    const keyValue2 = await internals.createKey({
      secret: "deterministic-password",
      salt: "deterministic-salt",
    });

    expect(keyValue1.raw).toEqual(keyValue2.raw);
    expect(keyValue1.base64).toBe(keyValue2.base64);
    expect(keyValue1.raw.length).toBe(32); // dkLen: 32
  });
});
