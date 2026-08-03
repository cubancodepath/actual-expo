import type { LucideIcon } from "lucide-react-native";
import type { SFSymbol } from "sf-symbols-typescript";

/**
 * Both platforms are required because neither icon set is portable: iOS draws
 * the SF Symbol so the glyph matches the rest of the system bar, Android draws
 * the lucide component.
 */
export type HeaderIcon = { sfSymbol: SFSymbol; lucide: LucideIcon };

/** One entry in a header action's menu. */
export type HeaderMenuItem = {
  label: string;
  /** Secondary text beside the label — UIKit renders it under the title. */
  description?: string;
  onPress: () => void;
  icon?: HeaderIcon;
  /** Renders in the system's destructive style — red, and last by convention. */
  destructive?: boolean;
  disabled?: boolean;
};

type HeaderActionBase = {
  /** Visible text, and the accessibility label when `icon` is set. */
  label: string;
  disabled?: boolean;
  /** Makes this an icon-only action. */
  icon?: HeaderIcon;
  /** `"done"` is the bold confirming action; `"plain"` is everything else. */
  emphasis?: "plain" | "done";
  /**
   * Overrides the bar's tint for this action alone.
   *
   * Needed for `emphasis: "done"`, which on iOS 26 draws a filled capsule whose
   * fill comes from the system accent rather than from `headerTintColor` — so
   * without this it renders system blue no matter what the bar's tint is.
   */
  tintColor?: string;
};

/**
 * A header action described declaratively rather than as JSX, so each platform
 * can render it the way that platform expects: a real `UIBarButtonItem` on iOS,
 * a tinted pressable on Android.
 *
 * An action either does something (`onPress`) or offers a choice of things
 * (`items`) — an overflow menu. The menu is native on iOS too, a `UIMenu` hung
 * off the bar button item, so it inherits the system's presentation rather than
 * being a popover drawn over the bar.
 */
export type HeaderAction = HeaderActionBase &
  ({ onPress: () => void; items?: never } | { items: HeaderMenuItem[]; onPress?: never });

export type HeaderActions = {
  /** Replaces the back button when present. */
  left?: HeaderAction;
  /**
   * One action, or several in visual reading order — first renders closest to
   * the title, last at the screen edge. (UIKit numbers its items from the edge
   * inwards; the iOS hook reverses so callers never have to know that.)
   */
  right?: HeaderAction | HeaderAction[];
};
