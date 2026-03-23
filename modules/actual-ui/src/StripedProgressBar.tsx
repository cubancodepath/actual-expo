import { requireNativeView } from "expo";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";
import { createViewModifierEventListener } from "@expo/ui/swift-ui/modifiers";

export interface StripedProgressBarProps extends CommonViewModifierProps {
  /** Spent portion 0-1 (darker layer with stripes) */
  spent: number;
  /** Available/funded portion 0-1 (lighter solid layer) */
  available: number;
  /** Bar color as hex string (e.g. "#10B981") */
  color: string;
  /** Whether the category is overspent (full bar) */
  overspent?: boolean;
  /** Whether to show diagonal stripes on spent portion */
  striped?: boolean;
  /** Bar height in points */
  barHeight?: number;
}

const NativeStripedProgressBar: React.ComponentType<StripedProgressBarProps> = requireNativeView(
  "ActualUi",
  "StripedProgressBarView",
);

export function StripedProgressBar(props: StripedProgressBarProps) {
  const { modifiers, ...restProps } = props;
  return (
    <NativeStripedProgressBar
      modifiers={modifiers}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
    />
  );
}
