/**
 * useTags — reactive tags via liveQuery (screens-first local hook).
 */

import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import type { Tag } from "@/core/domain/tags/types";

export function useTags() {
  const { data, isLoading } = useLiveQuery<Tag>(() => q("tags"), []);
  return { tags: data ?? [], isLoading };
}
