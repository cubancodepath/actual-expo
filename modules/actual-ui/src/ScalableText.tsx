import { requireNativeView } from "expo";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";
import { createViewModifierEventListener } from "@expo/ui/swift-ui/modifiers";

export interface ScalableTextProps extends CommonViewModifierProps {
  /** Text content */
  text: string;
  /** Font size in points */
  fontSize?: number;
  /** Font weight */
  fontWeight?: "regular" | "medium" | "semibold" | "bold" | "heavy";
  /** Text color hex */
  color?: string;
  /** Minimum scale factor (0-1). Text shrinks to fit instead of truncating. */
  minScale?: number;
  /** Max number of lines (0 = unlimited) */
  maxLines?: number;
  /** Use monospaced digits */
  monoDigits?: boolean;
  /** Text alignment */
  alignment?: "leading" | "center" | "trailing";
}

const NativeScalableText: React.ComponentType<ScalableTextProps> = requireNativeView(
  "ActualUi",
  "ScalableTextView",
);

export function ScalableText({ modifiers, ...restProps }: ScalableTextProps) {
  return (
    <NativeScalableText
      modifiers={modifiers}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
    />
  );
}
