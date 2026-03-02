/**
 * Expo-compatible Protobuf implementation using protobufjs/minimal.
 *
 * Replaces the google-protobuf + sync_pb.js combination which relies on
 * CommonJS side-effects and globalThis namespace mutations — incompatible
 * with Metro bundler and React Native.
 *
 * Wire format is identical to the original, ensuring full server compatibility.
 *
 * Proto3 wire type reference:
 *   0 = varint (int32, bool, enum)
 *   2 = length-delimited (string, bytes, embedded messages, repeated)
 *
 * Field tag = (field_number << 3) | wire_type
 */
import { Reader, Writer } from 'protobufjs/minimal';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IEncryptedData {
  iv?: Uint8Array;
  authTag?: Uint8Array;
  data?: Uint8Array;
}

export interface IMessage {
  dataset?: string;
  row?: string;
  column?: string;
  value?: string;
}

export interface IMessageEnvelope {
  timestamp?: string;
  isEncrypted?: boolean;
  content?: Uint8Array;
}

export interface ISyncRequest {
  messages?: IMessageEnvelope[];
  fileId?: string;
  groupId?: string;
  keyId?: string;
  since?: string;
}

export interface ISyncResponse {
  messages?: IMessageEnvelope[];
  merkle?: string;
}

// ---------------------------------------------------------------------------
// EncryptedData  (fields: iv=1, authTag=2, data=3)
// ---------------------------------------------------------------------------

export const EncryptedData = {
  encode(message: IEncryptedData, writer = Writer.create()): Writer {
    if (message.iv != null && message.iv.length > 0)
      writer.uint32(10).bytes(message.iv);
    if (message.authTag != null && message.authTag.length > 0)
      writer.uint32(18).bytes(message.authTag);
    if (message.data != null && message.data.length > 0)
      writer.uint32(26).bytes(message.data);
    return writer;
  },

  encodeToBinary(message: IEncryptedData): Uint8Array {
    return EncryptedData.encode(message).finish();
  },

  decode(input: Reader | Uint8Array, length?: number): IEncryptedData {
    const reader = input instanceof Reader ? input : Reader.create(input);
    const end = length !== undefined ? reader.pos + length : reader.len;
    const message: IEncryptedData = {};
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.iv = reader.bytes();
          break;
        case 2:
          message.authTag = reader.bytes();
          break;
        case 3:
          message.data = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return message;
  },

  decodeFromBinary(data: Uint8Array): IEncryptedData {
    return EncryptedData.decode(data);
  },
};

// ---------------------------------------------------------------------------
// Message  (fields: dataset=1, row=2, column=3, value=4)
// ---------------------------------------------------------------------------

export const Message = {
  encode(message: IMessage, writer = Writer.create()): Writer {
    if (message.dataset != null && message.dataset !== '')
      writer.uint32(10).string(message.dataset);
    if (message.row != null && message.row !== '')
      writer.uint32(18).string(message.row);
    if (message.column != null && message.column !== '')
      writer.uint32(26).string(message.column);
    if (message.value != null && message.value !== '')
      writer.uint32(34).string(message.value);
    return writer;
  },

  encodeToBinary(message: IMessage): Uint8Array {
    return Message.encode(message).finish();
  },

  decode(input: Reader | Uint8Array, length?: number): IMessage {
    const reader = input instanceof Reader ? input : Reader.create(input);
    const end = length !== undefined ? reader.pos + length : reader.len;
    const message: IMessage = {};
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.dataset = reader.string();
          break;
        case 2:
          message.row = reader.string();
          break;
        case 3:
          message.column = reader.string();
          break;
        case 4:
          message.value = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return message;
  },

  decodeFromBinary(data: Uint8Array): IMessage {
    return Message.decode(data);
  },
};

// ---------------------------------------------------------------------------
// MessageEnvelope  (fields: timestamp=1, isEncrypted=2, content=3)
// ---------------------------------------------------------------------------

export const MessageEnvelope = {
  encode(message: IMessageEnvelope, writer = Writer.create()): Writer {
    if (message.timestamp != null && message.timestamp !== '')
      writer.uint32(10).string(message.timestamp);
    if (message.isEncrypted === true) writer.uint32(16).bool(true);
    if (message.content != null && message.content.length > 0)
      writer.uint32(26).bytes(message.content);
    return writer;
  },

  encodeToBinary(message: IMessageEnvelope): Uint8Array {
    return MessageEnvelope.encode(message).finish();
  },

  decode(input: Reader | Uint8Array, length?: number): IMessageEnvelope {
    const reader = input instanceof Reader ? input : Reader.create(input);
    const end = length !== undefined ? reader.pos + length : reader.len;
    const message: IMessageEnvelope = {};
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.timestamp = reader.string();
          break;
        case 2:
          message.isEncrypted = reader.bool();
          break;
        case 3:
          message.content = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return message;
  },

  decodeFromBinary(data: Uint8Array): IMessageEnvelope {
    return MessageEnvelope.decode(data);
  },
};

// ---------------------------------------------------------------------------
// SyncRequest  (fields: messages=1, fileId=2, groupId=3, keyId=5, since=6)
// Note: field 4 is intentionally skipped (proto3 reserved/unused gap)
// ---------------------------------------------------------------------------

export const SyncRequest = {
  encode(message: ISyncRequest, writer = Writer.create()): Writer {
    for (const env of message.messages ?? []) {
      MessageEnvelope.encode(env, writer.uint32(10).fork()).ldelim();
    }
    if (message.fileId != null && message.fileId !== '')
      writer.uint32(18).string(message.fileId);
    if (message.groupId != null && message.groupId !== '')
      writer.uint32(26).string(message.groupId);
    if (message.keyId != null && message.keyId !== '')
      writer.uint32(42).string(message.keyId);
    if (message.since != null && message.since !== '')
      writer.uint32(50).string(message.since);
    return writer;
  },

  encodeToBinary(message: ISyncRequest): Uint8Array {
    return SyncRequest.encode(message).finish();
  },

  decode(input: Reader | Uint8Array): ISyncRequest {
    const reader = input instanceof Reader ? input : Reader.create(input);
    const message: ISyncRequest = { messages: [] };
    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.messages!.push(
            MessageEnvelope.decode(reader, reader.uint32()),
          );
          break;
        case 2:
          message.fileId = reader.string();
          break;
        case 3:
          message.groupId = reader.string();
          break;
        case 5:
          message.keyId = reader.string();
          break;
        case 6:
          message.since = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return message;
  },

  decodeFromBinary(data: Uint8Array): ISyncRequest {
    return SyncRequest.decode(data);
  },
};

// ---------------------------------------------------------------------------
// SyncResponse  (fields: messages=1, merkle=2)
// ---------------------------------------------------------------------------

export const SyncResponse = {
  encode(message: ISyncResponse, writer = Writer.create()): Writer {
    for (const env of message.messages ?? []) {
      MessageEnvelope.encode(env, writer.uint32(10).fork()).ldelim();
    }
    if (message.merkle != null && message.merkle !== '')
      writer.uint32(18).string(message.merkle);
    return writer;
  },

  encodeToBinary(message: ISyncResponse): Uint8Array {
    return SyncResponse.encode(message).finish();
  },

  decode(input: Reader | Uint8Array): ISyncResponse {
    const reader = input instanceof Reader ? input : Reader.create(input);
    const message: ISyncResponse = { messages: [] };
    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.messages!.push(
            MessageEnvelope.decode(reader, reader.uint32()),
          );
          break;
        case 2:
          message.merkle = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return message;
  },

  decodeFromBinary(data: Uint8Array): ISyncResponse {
    return SyncResponse.decode(data);
  },
};
