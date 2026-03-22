import { requireNativeView } from "expo";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";
import { createViewModifierEventListener } from "@expo/ui/swift-ui/modifiers";

export interface ActualListProps extends CommonViewModifierProps {
  /** List visual style */
  listStyleType?: "plain" | "insetGrouped" | "grouped";
  children: React.ReactNode;
}

const NativeActualList: React.ComponentType<ActualListProps> = requireNativeView(
  "ActualUi",
  "ActualListView",
);

export function ActualList({ modifiers, children, ...restProps }: ActualListProps) {
  return (
    <NativeActualList
      modifiers={modifiers}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
    >
      {children}
    </NativeActualList>
  );
}
