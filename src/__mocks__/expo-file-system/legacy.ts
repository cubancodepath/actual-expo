// Vitest stub for expo-file-system/legacy — an in-memory fake filesystem,
// keyed by path string. Covers the subset used by src/services/*.
export enum EncodingType {
  UTF8 = "utf8",
  Base64 = "base64",
}

export const documentDirectory = "file:///mock-documents/";

const files = new Map<string, string>();
const dirs = new Set<string>([documentDirectory]);

function isDir(path: string): boolean {
  return path.endsWith("/");
}

export async function makeDirectoryAsync(
  path: string,
  _options?: { intermediates?: boolean },
): Promise<void> {
  dirs.add(path);
}

export async function writeAsStringAsync(
  path: string,
  contents: string,
  _options?: { encoding?: EncodingType },
): Promise<void> {
  files.set(path, contents);
}

export async function readAsStringAsync(
  path: string,
  _options?: { encoding?: EncodingType },
): Promise<string> {
  const content = files.get(path);
  if (content === undefined) throw new Error(`ENOENT: ${path}`);
  return content;
}

export async function deleteAsync(
  path: string,
  _options?: { idempotent?: boolean },
): Promise<void> {
  files.delete(path);
  dirs.delete(path);
}

export async function getInfoAsync(
  path: string,
): Promise<{ exists: boolean; isDirectory?: boolean; uri: string }> {
  if (isDir(path)) {
    return { exists: dirs.has(path), isDirectory: true, uri: path };
  }
  return { exists: files.has(path), isDirectory: false, uri: path };
}

export async function readDirectoryAsync(path: string): Promise<string[]> {
  const prefix = path.endsWith("/") ? path : `${path}/`;
  const names = new Set<string>();
  for (const key of [...files.keys(), ...dirs.keys()]) {
    if (key.startsWith(prefix) && key !== prefix) {
      const rest = key.slice(prefix.length);
      names.add(rest.split("/")[0]);
    }
  }
  return [...names];
}

/** Test-only: reset the in-memory fake filesystem between test files. */
export function __resetMockFileSystem(): void {
  files.clear();
  dirs.clear();
  dirs.add(documentDirectory);
}
