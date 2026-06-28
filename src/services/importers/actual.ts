/**
 * Actual Budget JSON (.zip) importer.
 *
 * Accepts a Uint8Array of an Actual Budget backup (.zip containing db.sqlite),
 * writes it as a new local budget, and returns the new budgetId.
 *
 * Mirrors the server-side importActual() in loot-core, adapted for expo-file-system.
 */

import { EncodingType, makeDirectoryAsync, writeAsStringAsync } from "expo-file-system/legacy";
import { unzipSync } from "fflate";

import { getBudgetDir, idFromBudgetName, writeMetadata } from "@/services/budgetMetadata";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type ImportActualResult = { ok: true; budgetId: string } | { ok: false; error: string };

/**
 * Import an Actual Budget archive from raw bytes.
 *
 * @param bytes   Raw content of a .zip Actual Budget file (unencrypted)
 * @param name    Display name for the imported budget
 */
export async function importActualBudget(
  bytes: Uint8Array,
  name: string,
): Promise<ImportActualResult> {
  // Validate ZIP magic bytes (PK\x03\x04)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ok: false, error: "The selected file is not a valid Actual Budget ZIP archive." };
  }

  let unzipped: ReturnType<typeof unzipSync>;
  try {
    unzipped = unzipSync(bytes);
  } catch (e) {
    return {
      ok: false,
      error: `Failed to extract archive: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const dbBytes = unzipped["db.sqlite"];
  if (!dbBytes) {
    return {
      ok: false,
      error: "Archive does not contain db.sqlite. Is this a valid Actual Budget file?",
    };
  }

  const budgetId = idFromBudgetName(name);
  const budgetDir = getBudgetDir(budgetId);

  try {
    await makeDirectoryAsync(budgetDir, { intermediates: true });
    await writeAsStringAsync(`${budgetDir}db.sqlite`, uint8ToBase64(dbBytes), {
      encoding: EncodingType.Base64,
    });

    // Write local metadata; no cloudFileId since this is a local import
    await writeMetadata(budgetId, {
      id: budgetId,
      budgetName: name,
      resetClock: true,
    });

    return { ok: true, budgetId };
  } catch (e) {
    return {
      ok: false,
      error: `Failed to write budget files: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
