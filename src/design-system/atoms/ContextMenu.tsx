import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import * as ZeegoMenu from "zeego/context-menu";

// ── Root (with optional style wrapper) ────────────────────────────────

interface ContextMenuRootProps {
  /** Style applied to an outer View wrapper (for layout). */
  style?: ViewStyle;
  children: ReactNode;
}

function Root({ style, children }: ContextMenuRootProps) {
  const menu = <ZeegoMenu.Root>{children}</ZeegoMenu.Root>;
  if (style) {
    return <View style={style}>{menu}</View>;
  }
  return menu;
}

// ── Compound export ───────────────────────────────────────────────────
// Re-export zeego's components directly — they must be direct children
// for zeego's internal React.Children traversal to work.

export const ContextMenu = Object.assign(Root, {
  Trigger: ZeegoMenu.Trigger,
  Content: ZeegoMenu.Content,
  Item: ZeegoMenu.Item,
  ItemTitle: ZeegoMenu.ItemTitle,
  ItemIcon: ZeegoMenu.ItemIcon,
  Separator: ZeegoMenu.Separator,
  Preview: ZeegoMenu.Preview,
  Group: ZeegoMenu.Group,
  Sub: ZeegoMenu.Sub,
  SubTrigger: ZeegoMenu.SubTrigger,
  SubContent: ZeegoMenu.SubContent,
});

export type { ContextMenuRootProps };
