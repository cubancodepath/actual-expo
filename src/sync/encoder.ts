import {
  EncryptedData,
  Message,
  MessageEnvelope,
  SyncRequest,
  SyncResponse,
  type IMessage,
} from "../proto";
import { Timestamp } from "../crdt/timestamp";
import * as encryption from "../encryption";
import { SyncError } from "../errors";
import { serializeValue, deserializeValue } from "./values";

export type SyncMessage = {
  timestamp: Timestamp;
  dataset: string;
  row: string;
  column: string;
  value: string | number | null;
};

export async function encode(
  groupId: string,
  fileId: string,
  since: Timestamp | string,
  messages: SyncMessage[],
  encryptKeyId?: string,
): Promise<Uint8Array> {
  const envelopes = [];

  for (const msg of messages) {
    const msgBytes = Message.encodeToBinary({
      dataset: msg.dataset,
      row: msg.row,
      column: msg.column,
      value: serializeValue(msg.value), // raw → "S:...", "N:...", "0:"
    } satisfies IMessage);

    let content: Uint8Array;
    let isEncrypted = false;

    if (encryptKeyId) {
      let result;
      try {
        result = await encryption.encrypt(msgBytes, encryptKeyId);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        throw new SyncError("encrypt-failure", {
          isMissingKey: errMsg === "missing-key",
        });
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
        throw new SyncError("decrypt-failure", {
          isMissingKey: errMsg === "missing-key",
        });
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
