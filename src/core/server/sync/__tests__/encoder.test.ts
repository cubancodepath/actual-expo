import { describe, it, expect, afterEach } from "vitest";

import { encode, decode } from "../encoder";
import type { OutgoingSyncMessage, SyncMessage } from "../encoder";
import { serializeValue } from "../values";
import { Timestamp } from "@/core/crdt/timestamp";
import { createKey, loadKey, unloadAllKeys } from "@/core/server/encryption";
import { SyncRequest, SyncResponse } from "@/core/proto";
import goldenVectorHex from "./fixtures/encoder-golden-vector.json";

/**
 * encode() serializes to the wire shape of a client->server SyncRequest
 * (fields: messages=1, fileId=2, groupId=3, keyId=5, since=6). decode()
 * parses the wire shape of a server->client SyncResponse (fields:
 * messages=1, merkle=2) — see src/core/proto/index.ts. These are DIFFERENT
 * proto messages that only happen to share field 1 ("messages", a repeated
 * MessageEnvelope). In production, encode()'s output is POSTed to the real
 * server and decode() is only ever called on the server's own SyncResponse
 * bytes — decode(encode(...)) never happens in the running app.
 *
 * That asymmetry means calling decode(encode(...)) directly (as this file
 * does, to test the MessageEnvelope round-trip) is only safe with an EMPTY
 * fileId: encode's field 2 (fileId, a string) collides on the wire with
 * decode's field 2 (merkle, a string) — a non-empty, non-JSON fileId would
 * make decode()'s unconditional `JSON.parse(response.merkle ?? "{}")` throw.
 * groupId/keyId/since (fields 3/5/6) have no field-2 collision and are
 * safely skipped as unknown fields by SyncResponse's decoder. This is a
 * protocol-design quirk, not an encoder bug — every test below uses
 * fileId: "" and asserts only on the returned `messages` array.
 */
const FILE_ID = "";
const GROUP_ID = "test-group";

function ts(millis: number, counter: number, node: string): Timestamp {
  return new Timestamp(millis, counter, node);
}

async function roundTrip(
  messages: OutgoingSyncMessage[],
  encryptKeyId?: string,
): Promise<{ messages: SyncMessage[]; merkle: object }> {
  const bytes = await encode(
    GROUP_ID,
    FILE_ID,
    ts(1000, 0, "0000000000000001"),
    messages,
    encryptKeyId,
  );
  return decode(bytes, encryptKeyId);
}

describe("encoder — unencrypted round-trips", () => {
  it("round-trips representative values through decode(encode(...))", async () => {
    const rawValues: (string | number | null)[] = [
      null, // '0:'
      42, // 'N:42'
      -17, // 'N:-17'
      1e21, // large float
      "", // empty string
      "héllo wörld 日本語", // unicode string
    ];

    const messages: OutgoingSyncMessage[] = rawValues.map((value, i) => ({
      timestamp: ts(1000 + i, 0, "0000000000000001"),
      dataset: "transactions",
      row: `row-${i}`,
      column: "note",
      value: serializeValue(value),
    }));

    const { messages: decoded } = await roundTrip(messages);

    expect(decoded).toHaveLength(rawValues.length);
    for (let i = 0; i < rawValues.length; i++) {
      expect(decoded[i].value).toEqual(rawValues[i]);
      expect(decoded[i].dataset).toBe("transactions");
      expect(decoded[i].row).toBe(`row-${i}`);
      expect(decoded[i].column).toBe("note");
    }
  });

  it("passes serialized-string-form values through verbatim", async () => {
    // OutgoingSyncMessage.value is already wire-serialized (fullSync resends
    // the exact string stored in messages_crdt without deserialize/re-serialize
    // — see encoder.ts's OutgoingSyncMessage doc comment).
    const messages: OutgoingSyncMessage[] = [
      {
        timestamp: ts(2000, 0, "0000000000000001"),
        dataset: "notes",
        row: "r1",
        column: "c",
        value: "0:",
      },
      {
        timestamp: ts(2001, 0, "0000000000000001"),
        dataset: "notes",
        row: "r2",
        column: "c",
        value: "N:3.14",
      },
      {
        timestamp: ts(2002, 0, "0000000000000001"),
        dataset: "notes",
        row: "r3",
        column: "c",
        value: "S:plain",
      },
    ];

    const { messages: decoded } = await roundTrip(messages);

    expect(decoded[0].value).toBeNull();
    expect(decoded[1].value).toBe(3.14);
    expect(decoded[2].value).toBe("plain");
  });

  it("passes through transactions, zero_budgets, preferences, and unknown dataset names unfiltered", async () => {
    const datasets = ["transactions", "zero_budgets", "preferences", "some_unknown_dataset_xyz"];
    const messages: OutgoingSyncMessage[] = datasets.map((dataset, i) => ({
      timestamp: ts(3000 + i, 0, "0000000000000001"),
      dataset,
      row: `row-${i}`,
      column: "col",
      value: serializeValue(`value-${i}`),
    }));

    const { messages: decoded } = await roundTrip(messages);

    expect(decoded.map((m) => m.dataset)).toEqual(datasets);
  });

  it("preserves message order and timestamps byte-for-byte across multiple messages", async () => {
    const timestamps = [
      ts(1000, 0, "0000000000000001"),
      ts(1000, 1, "0000000000000001"),
      ts(1500, 0, "0000000000000002"),
      ts(9999999, 42, "00000000000000ff"),
    ];
    const messages: OutgoingSyncMessage[] = timestamps.map((timestamp, i) => ({
      timestamp,
      dataset: "transactions",
      row: `row-${i}`,
      column: "col",
      value: serializeValue(i),
    }));

    const { messages: decoded } = await roundTrip(messages);

    expect(decoded).toHaveLength(timestamps.length);
    for (let i = 0; i < timestamps.length; i++) {
      // Byte-for-byte: compare the exact wire string form, not just Date value.
      expect(decoded[i].timestamp.toString()).toBe(timestamps[i].toString());
      expect(decoded[i].row).toBe(`row-${i}`);
    }
  });

  it("round-trips an empty message list", async () => {
    const { messages: decoded } = await roundTrip([]);
    expect(decoded).toEqual([]);
  });
});

describe("encoder — encrypted round-trips", () => {
  afterEach(() => {
    unloadAllKeys();
  });

  it("round-trips representative values through an encrypted envelope", async () => {
    const key = await createKey({
      id: "encoder-test-key",
      password: "correct horse battery staple",
      salt: "encoder-test-salt",
    });
    await loadKey(key);

    const rawValues: (string | number | null)[] = [null, 7, "unicode: 日本語", ""];
    const messages: OutgoingSyncMessage[] = rawValues.map((value, i) => ({
      timestamp: ts(4000 + i, 0, "0000000000000001"),
      dataset: "transactions",
      row: `row-${i}`,
      column: "note",
      value: serializeValue(value),
    }));

    const { messages: decoded } = await roundTrip(messages, "encoder-test-key");

    expect(decoded).toHaveLength(rawValues.length);
    for (let i = 0; i < rawValues.length; i++) {
      expect(decoded[i].value).toEqual(rawValues[i]);
    }
  });

  it("fails to decode when the underlying key is missing", async () => {
    const key = await createKey({
      id: "encoder-missing-key",
      password: "some-password",
      salt: "some-salt",
    });
    await loadKey(key);

    const messages: OutgoingSyncMessage[] = [
      {
        timestamp: ts(5000, 0, "0000000000000001"),
        dataset: "transactions",
        row: "r1",
        column: "note",
        value: serializeValue("secret"),
      },
    ];

    const bytes = await encode(
      GROUP_ID,
      FILE_ID,
      ts(1000, 0, "0000000000000001"),
      messages,
      "encoder-missing-key",
    );

    unloadAllKeys(); // simulate the key no longer being available to decode

    await expect(decode(bytes, "encoder-missing-key")).rejects.toThrow();
  });

  it("fails to decode with the expected error when ciphertext is tampered with", async () => {
    const key = await createKey({
      id: "encoder-tamper-key",
      password: "tamper-password",
      salt: "tamper-salt",
    });
    await loadKey(key);

    const messages: OutgoingSyncMessage[] = [
      {
        timestamp: ts(6000, 0, "0000000000000001"),
        dataset: "transactions",
        row: "r1",
        column: "note",
        value: serializeValue("do not tamper"),
      },
    ];

    const requestBytes = await encode(
      GROUP_ID,
      FILE_ID,
      ts(1000, 0, "0000000000000001"),
      messages,
      "encoder-tamper-key",
    );

    // encode() targets the SyncRequest wire shape; re-read it with the
    // matching decoder to get at the raw envelope/content bytes, flip a
    // ciphertext byte, then repackage as a SyncResponse (decode()'s
    // expected shape) — see the file-level comment on the Request/Response
    // asymmetry.
    const request = SyncRequest.decodeFromBinary(requestBytes);
    const envelope = request.messages![0];
    const tamperedContent = new Uint8Array(envelope.content as Uint8Array);
    tamperedContent[0] = tamperedContent[0] ^ 0xff;

    const tamperedResponseBytes = SyncResponse.encodeToBinary({
      messages: [{ ...envelope, content: tamperedContent }],
    });

    await expect(decode(tamperedResponseBytes, "encoder-tamper-key")).rejects.toThrow();
  });
});

describe("encoder — golden vector", () => {
  it("matches the pinned unencrypted wire bytes for a fixed message set", async () => {
    // Fixed timestamps/values only — no randomness, so this is fully
    // deterministic. Encrypted mode is intentionally excluded: encrypt()
    // uses a random IV per call (see src/core/encryption/internals.ts),
    // so an encrypted golden vector would not be reproducible outside the
    // Node crypto capability (src/core/platform/crypto/index.node.ts).
    //
    // IF THIS TEST STARTS FAILING: the wire format changed. Confirm server
    // compatibility (does the Actual server still accept/produce this exact
    // byte layout?) before regenerating fixtures/encoder-golden-vector.json.
    const messages: OutgoingSyncMessage[] = [
      {
        timestamp: ts(1700000000000, 0, "0000000000000001"),
        dataset: "transactions",
        row: "txn-1",
        column: "amount",
        value: serializeValue(1234),
      },
      {
        timestamp: ts(1700000000001, 1, "0000000000000001"),
        dataset: "transactions",
        row: "txn-1",
        column: "notes",
        value: serializeValue(null),
      },
      {
        timestamp: ts(1700000000002, 0, "0000000000000002"),
        dataset: "zero_budgets",
        row: "budget-1",
        column: "amount",
        value: serializeValue(-500),
      },
    ];

    const bytes = await encode(
      "golden-group",
      "", // fileId empty — see file-level comment on the field-2 collision
      ts(1699999999999, 0, "0000000000000000"),
      messages,
      undefined, // unencrypted
    );

    const hex = Buffer.from(bytes).toString("hex");
    expect(hex).toBe(goldenVectorHex.hex);

    // decode() targets SyncResponse's wire shape (fields: messages=1,
    // merkle=2); with fileId="" here, encode() never writes field 2, so
    // reading these bytes as a SyncResponse still round-trips the messages
    // safely.
    const { messages: decoded } = await decode(bytes);
    expect(decoded).toHaveLength(messages.length);
    for (let i = 0; i < messages.length; i++) {
      expect(decoded[i].dataset).toBe(messages[i].dataset);
      expect(decoded[i].row).toBe(messages[i].row);
      expect(decoded[i].column).toBe(messages[i].column);
      expect(decoded[i].timestamp.toString()).toBe(messages[i].timestamp.toString());
    }
  });
});
