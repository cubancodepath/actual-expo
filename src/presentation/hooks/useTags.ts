/**
 * useTags — reactive tags via liveQuery.
 * Replaces useTagsStore for data reads.
 */

import { q } from "@core/queries";
import { useLiveQuery } from "./useQuery";
import type { Tag } from "@core/tags/types";

export function useTags() {
  const { data, isLoading } = useLiveQuery<Tag>(() => q("tags"), []);
  return { tags: data ?? [], isLoading };
}
