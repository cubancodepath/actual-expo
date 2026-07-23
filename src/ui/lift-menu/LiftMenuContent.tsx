import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Menu } from "heroui-native";
import { useLiftMenuContext } from "./context";

// Entering/exiting builders are class instances, not plain values — build them
// once so opening the menu doesn't allocate three per render.
const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

interface LiftMenuContentProps {
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Roughly how tall the menu renders; only picks which side to open on. */
  estimatedMenuHeight?: number;
  /** Popover width. */
  width?: number;
  /** The menu's items: heroui-native `Menu.Item` JSX. */
  children: ReactNode;
}

/**
 * The shared body of a lift menu: dim overlay, the iOS-style "lift" (a clone of
 * the pressed row rendered inside the portal — above the overlay — at the row's
 * measured frame, slightly scaled down as if held), and the popover holding the
 * caller's `Menu.Item`s. Rendered from `LiftMenu.Host`'s `renderMenu`; reads
 * the lifted row's frame from the host's context.
 */
export function LiftMenuContent({
  preview,
  estimatedMenuHeight = 240,
  width = 240,
  children,
}: LiftMenuContentProps) {
  const { rect, onPreviewLayout } = useLiftMenuContext();
  const { height: windowHeight } = useWindowDimensions();

  // Open above the row when there isn't room for the menu below it — otherwise
  // collision avoidance would slide the popover up and cover the row.
  const placement = rect.y + rect.height + estimatedMenuHeight > windowHeight ? "top" : "bottom";

  return (
    <Menu.Portal>
      {/* Dim the whole screen; the preview clone below sits above this layer.
          Tightened fades so the lift and the popover read as one gesture. */}
      <Menu.Overlay
        className="bg-black/20"
        animation={{ entering: OVERLAY_IN, exiting: OVERLAY_OUT }}
      />
      <Animated.View
        entering={PREVIEW_IN}
        pointerEvents="none"
        onLayout={onPreviewLayout}
        className="absolute overflow-hidden rounded-xl bg-overlay shadow-overlay"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          transform: [{ scale: 0.97 }],
        }}
      >
        {preview}
      </Animated.View>
      <Menu.Content presentation="popover" width={width} placement={placement} align="start">
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}
