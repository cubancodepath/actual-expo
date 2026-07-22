import { Message, type IMessage } from "@/core/proto";
import * as encryption from "@/core/encryption";
import { uint8ToBase64 } from "@/core/encryption/base64";

/**
 * A random encrypted protobuf Message for key validation — upstream's
 * `sync/make-test-message.ts`. The server stores it so clients can verify a
 * password is correct.
 */
export async function makeTestMessage(keyId: string) {
  const randomStr = () => uint8ToBase64(encryption.randomBytes(12));
  const msg: IMessage = {
    dataset: randomStr(),
    row: randomStr(),
    column: randomStr(),
    value: randomStr(),
  };
  const msgBytes = Message.encodeToBinary(msg);
  return encryption.encrypt(msgBytes, keyId);
}
