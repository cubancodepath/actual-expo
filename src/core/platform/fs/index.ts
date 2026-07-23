// Native implementation of the filesystem capability, backed by
// expo-file-system's legacy API. The only module in src/core that imports the
// native fs dependency — everything else uses the `fs` object from here
// (`@/core/platform/fs`), whose vocabulary is ours (readFile/writeFile/mkdir…),
// not the SDK's. In vitest the whole module is swapped for `./index.node.ts`
// via resolve.alias.
import {
  documentDirectory,
  EncodingType,
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  readDirectoryAsync,
  deleteAsync,
  getInfoAsync,
} from "expo-file-system/legacy";

import type { FileEncoding, PlatformFileSystem } from "./types";

function toExpoEncoding(encoding: FileEncoding | undefined): EncodingType | undefined {
  if (encoding === "base64") return EncodingType.Base64;
  if (encoding === "utf8") return EncodingType.UTF8;
  return undefined;
}

export const fs: PlatformFileSystem = {
  documentDirectory: documentDirectory ?? "",

  readFile: (path, opts) => readAsStringAsync(path, { encoding: toExpoEncoding(opts?.encoding) }),

  writeFile: (path, contents, opts) =>
    writeAsStringAsync(path, contents, { encoding: toExpoEncoding(opts?.encoding) }),

  mkdir: (path, opts) => makeDirectoryAsync(path, { intermediates: opts?.intermediates }),

  removeFile: (path, opts) => deleteAsync(path, { idempotent: opts?.idempotent }),

  exists: async (path) => {
    const info = await getInfoAsync(path);
    return info.exists;
  },

  listDir: (path) => readDirectoryAsync(path),
};
