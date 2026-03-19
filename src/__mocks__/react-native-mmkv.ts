// Stub for react-native-mmkv in vitest
export class MMKV {
  getString() {
    return undefined;
  }
  set() {}
  delete() {}
  contains() {
    return false;
  }
  getAllKeys() {
    return [];
  }
}

export function createMMKV(_opts?: { id?: string }) {
  return new MMKV();
}
