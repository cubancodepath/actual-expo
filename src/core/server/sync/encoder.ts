import {
  EncryptedData,
  Message,
  MessageEnvelope,
  SyncRequest,
  SyncResponse,
  type IMessage,
} from "@/core/proto";
import { Timestamp } from "@/core/crdt/timestamp";
import * as encryption from "@/core/server/encryption";
import { ActualError } from "@/core/errors";
import { deserializeValue } from "./values";

export type SyncMessage = {
  timestamp: Timestamp;
  dataset: string;
  row: string;
  column: string;
  value: string | number | null;
  old?: boolean;
};

/**
 * A message ready to upload: `value` is already wire-serialized
 * ("N:123", "S:foo", "0:"). Used for outgoing messages read back from
 * messages_crdt, so the exact stored string is resent byte-for-byte instead
 * of being deserialized and re-serialized (upstream sync/index.ts:534-540
 * resends the stored value verbatim; round-tripping it through
 * deserializeValue/serializeValue risks a different string representation
 * for the same logical value, e.g. across float formatting edge cases).
 */
export type OutgoingSyncMessage = {
  timestamp: Timestamp;
  dataset: string;
  row: string;
  column: string;
  value: string;
};

export async function encode(
  groupId: string,
  fileId: string,
  since: Timestamp | string,
  messages: OutgoingSyncMessage[],
  encryptKeyId?: string,
): Promise<Uint8Array> {
  const envelopes = [];

  for (const msg of messages) {
    const msgBytes = Message.encodeToBinary({
      dataset: msg.dataset,
      row: msg.row,
      column: msg.column,
      value: msg.value, // already wire-serialized — passed through verbatim
    } satisfies IMessage);

    let content: Uint8Array;
    let isEncrypted = false;

    if (encryptKeyId) {
      let result;
      try {
        result = await encryption.encrypt(msgBytes, encryptKeyId);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        throw errMsg === "missing-key"
          ? new ActualError("sync/key-missing", { cause: e })
          : new ActualError("sync/encrypt-failure", { cause: e });
      }

      content = EncryptedData.encodeToBinary({
        iv: base64ToUint8(result.meta.iv),
        authTag: base64ToUint8(result.meta.authTag),
        data: result.value,
      });
      isEncrypted = true;
    } else {
      content = msgBytes;
    }

    envelopes.push({
      timestamp: msg.timestamp.toString(),
      isEncrypted,
      content,
    });
  }

  return SyncRequest.encodeToBinary({
    messages: envelopes,
    groupId,
    fileId,
    keyId: encryptKeyId ?? "",
    since: since.toString(),
  });
}

export async function decode(
  data: Uint8Array,
  encryptKeyId?: string,
): Promise<{ messages: SyncMessage[]; merkle: object }> {
  const response = SyncResponse.decodeFromBinary(data);
  const merkle = JSON.parse(response.merkle ?? "{}");
  const messages: SyncMessage[] = [];

  for (const envelope of response.messages ?? []) {
    const timestamp = Timestamp.parse(envelope.timestamp ?? "");
    if (!timestamp) continue;

    let msgBytes: Uint8Array;

    if (envelope.isEncrypted) {
      const encData = EncryptedData.decodeFromBinary(envelope.content as Uint8Array);

      let decrypted: Uint8Array;
      try {
        decrypted = await encryption.decrypt(encData.data as Uint8Array, {
          keyId: encryptKeyId ?? "",
          algorithm: "aes-256-gcm",
          iv: uint8ToBase64(encData.iv as Uint8Array),
          authTag: uint8ToBase64(encData.authTag as Uint8Array),
        });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (__DEV__) console.warn("Sync decrypt error:", errMsg);
        throw errMsg === "missing-key"
          ? new ActualError("sync/key-missing", { cause: e })
          : new ActualError("sync/decrypt-failure", { cause: e });
      }

      msgBytes = decrypted;
    } else {
      msgBytes = envelope.content as Uint8Array;
    }

    const msg = Message.decodeFromBinary(msgBytes);

    messages.push({
      timestamp,
      dataset: msg.dataset ?? "",
      row: msg.row ?? "",
      column: msg.column ?? "",
      value: deserializeValue(msg.value ?? ""), // "S:..." → raw
    });
  }

  return { messages, merkle };
}

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
