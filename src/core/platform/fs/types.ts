// Platform capability contract: filesystem access for budget files and
// metadata. Mirrors upstream's `#platform/server/fs` role with our own
// vocabulary — no native SDK naming leaks through this seam. Each target
// ships an object conforming to this interface (index.ts = expo-file-system,
// index.node.ts = in-memory Node/test implementation).
export type FileEncoding = "utf8" | "base64";

export interface PlatformFileSystem {
  /** Absolute app documents directory, with trailing slash. */
  documentDirectory: string;
  readFile(path: string, opts?: { encoding?: FileEncoding }): Promise<string>;
  writeFile(path: string, contents: string, opts?: { encoding?: FileEncoding }): Promise<void>;
  mkdir(path: string, opts?: { intermediates?: boolean }): Promise<void>;
  removeFile(path: string, opts?: { idempotent?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
}
