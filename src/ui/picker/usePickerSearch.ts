import { useCallback, useState } from "react";

export interface PickerSearch {
  query: string;
  setQuery: (query: string) => void;
  /** Trimmed, lowercased — what filtering should match against. */
  q: string;
  /** True once the user has typed something. */
  searching: boolean;
  clear: () => void;
}

/**
 * The search state every picker repeats: the raw query, its normalised form,
 * and whether a search is active.
 *
 * `seed` is read once, for the pickers that open pre-filled (the payee picker
 * seeds the current free-text payee so the "Create X" row is already there).
 */
export function usePickerSearch(seed = ""): PickerSearch {
  const [query, setQuery] = useState(seed);
  const clear = useCallback(() => setQuery(""), []);
  const q = query.trim().toLowerCase();

  return { query, setQuery, q, searching: q !== "", clear };
}
