/**
 * useTags — reactive tags via liveQuery.
 * Replaces useTagsStore for data reads.
 */

import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import type { Tag } from "@/core/domain/tags/types";

export function useTags() {
  const { data, isLoading } = useLiveQuery<Tag>(() => q("tags"), []);
  return { tags: data ?? [], isLoading };
}
