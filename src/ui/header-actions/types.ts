import type { LucideIcon } from "lucide-react-native";
import type { SFSymbol } from "sf-symbols-typescript";

/**
 * A header action described declaratively rather than as JSX, so each platform
 * can render it the way that platform expects: a real `UIBarButtonItem` on iOS,
 * a tinted pressable on Android.
 */
export type HeaderAction = {
  /** Visible text, and the accessibility label when `icon` is set. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * Makes this an icon-only action. Both platforms are required because neither
   * icon set is portable: iOS draws the SF Symbol so the glyph matches the rest
   * of the system bar, Android draws the lucide component.
   */
  icon?: { sfSymbol: SFSymbol; lucide: LucideIcon };
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

export type HeaderActions = {
  /** Replaces the back button when present. */
  left?: HeaderAction;
  right?: HeaderAction;
};
