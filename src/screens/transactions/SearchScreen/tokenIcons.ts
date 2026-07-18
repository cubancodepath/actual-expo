import {
  ArrowLeftRight,
  Copyright,
  Inbox,
  Landmark,
  Lock,
  LockOpen,
  Search,
  Tags,
  type LucideIcon,
} from "lucide-react-native";
import type { StatusFilter } from "@/core/domain/transactions/types";
import type { SearchToken } from "./searchTokens";

const STATUS_ICONS: Record<StatusFilter, LucideIcon> = {
  cleared: Copyright,
  uncleared: Copyright,
  reconciled: Lock,
  unreconciled: LockOpen,
};

/**
 * The lucide icon for a filter kind, shared by the suggestion rows and the
 * active-filter tags so both read as the same thing. Uses the same icon each
 * kind carries across the transaction screens. Callers render the "cleared"
 * `Copyright` as a faked filled variant themselves (the fill color differs by
 * surface), so only the icon component is shared here.
 */
export function iconForTokenKind(
  kind: SearchToken["type"],
  statusValue?: StatusFilter,
): LucideIcon {
  switch (kind) {
    case "text":
      return Search;
    case "status":
      return statusValue ? STATUS_ICONS[statusValue] : Copyright;
    case "account":
      return Landmark;
    case "category":
    case "uncategorized":
      return Inbox;
    case "payee":
      return ArrowLeftRight;
    case "tag":
      return Tags;
  }
}
