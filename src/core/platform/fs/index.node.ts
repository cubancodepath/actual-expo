// Node/test implementation of the filesystem capability: an in-memory fake
// filesystem keyed by path string (absorbed from the old expo-file-system
// vitest stub, now conforming to our contract instead of expo's API).
//
// Selected by the vitest resolve.alias for `@/core/platform/fs`.
import type { PlatformFileSystem } from "./types";

const documentDirectory = "file:///mock-documents/";

const files = new Map<string, string>();
const dirs = new Set<string>([documentDirectory]);

export const fs: PlatformFileSystem = {
  documentDirectory,

  readFile: async (path) => {
    const content = files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  },

  writeFile: async (path, contents) => {
    files.set(path, contents);
  },

  mkdir: async (path) => {
    dirs.add(path);
  },

  removeFile: async (path) => {
    files.delete(path);
    dirs.delete(path);
  },

  exists: async (path) => (path.endsWith("/") ? dirs.has(path) : files.has(path)),

  listDir: async (path) => {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Set<string>();
    for (const key of [...files.keys(), ...dirs.keys()]) {
      if (key.startsWith(prefix) && key !== prefix) {
        const rest = key.slice(prefix.length);
        names.add(rest.split("/")[0]);
      }
    }
    return [...names];
  },
};

/** Test-only: reset the in-memory fake filesystem between test files. */
export function __resetFs(): void {
  files.clear();
  dirs.clear();
  dirs.add(documentDirectory);
}
