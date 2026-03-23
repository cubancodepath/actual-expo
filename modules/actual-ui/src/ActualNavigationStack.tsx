import { requireNativeView } from "expo";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";
import { createViewModifierEventListener } from "@expo/ui/swift-ui/modifiers";

// Child marker views
const NativeNavTrailing: React.ComponentType<{ children: React.ReactNode }> = requireNativeView(
  "ActualUi",
  "NavTrailingView",
);

const NativeNavContent: React.ComponentType<{ children: React.ReactNode }> = requireNativeView(
  "ActualUi",
  "NavContentView",
);

export interface ActualNavigationStackProps extends CommonViewModifierProps {
  /** Navigation title */
  title?: string;
  /** Enable large title mode (default true) */
  largeTitleEnabled?: boolean;
  /** Page background color hex */
  backgroundColor?: string;
  /** Accent/tint color hex (buttons, refresh spinner) */
  tintColor?: string;
  /** Trailing toolbar content (buttons, menus) */
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

const NativeActualNavigationStack: React.ComponentType<any> = requireNativeView(
  "ActualUi",
  "ActualNavigationStackView",
);

export function ActualNavigationStack({
  modifiers,
  trailing,
  children,
  ...restProps
}: ActualNavigationStackProps) {
  return (
    <NativeActualNavigationStack
      modifiers={modifiers}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
    >
      <NativeNavContent>{children}</NativeNavContent>
      {trailing && <NativeNavTrailing>{trailing}</NativeNavTrailing>}
    </NativeActualNavigationStack>
  );
}
