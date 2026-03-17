// Stub for react-native-mmkv in vitest
export class MMKV {
  getString() {
    return undefined;
  }
  getBoolean() {
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

export function createMMKV() {
  return new MMKV();
}
