/**
 * useTags — reactive tags.
 *
 * Tags are NOT part of the AQL schema (upstream queries them with raw SQL via
 * the `tags` server domain, and so do we). This wraps `getTags()` in a
 * TanStack Query and refetches on sync events that touch the `tags` table —
 * same pattern as `useSchedulePreviews`.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@/core/sync/syncEvents";
import { getTags } from "@/core/server/tags";
import type { Tag } from "@/core/types/models";

export function useTags(): { tags: Tag[]; isLoading: boolean } {
  const query = useQuery({ queryKey: ["tags"], queryFn: getTags });

  useEffect(() => {
    return listen((event) => {
      if (event.tables.includes("tags")) {
        query.refetch();
      }
    });
  }, [query]);

  return { tags: query.data ?? [], isLoading: query.isLoading };
}
