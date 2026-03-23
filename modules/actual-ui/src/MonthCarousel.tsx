import { requireNativeView } from "expo";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";
import { createViewModifierEventListener } from "@expo/ui/swift-ui/modifiers";

export interface MonthCarouselProps extends CommonViewModifierProps {
  /** Formatted month label (e.g. "March 2026") */
  monthLabel: string;
  /** Text color hex */
  textColor?: string;
  /** Chevron color hex */
  chevronColor?: string;
  /** Called when navigating to previous month */
  onPrevious?: () => void;
  /** Called when navigating to next month */
  onNext?: () => void;
}

const NativeMonthCarousel: React.ComponentType<MonthCarouselProps> = requireNativeView(
  "ActualUi",
  "MonthCarouselView",
);

export function MonthCarousel({ modifiers, onPrevious, onNext, ...restProps }: MonthCarouselProps) {
  return (
    <NativeMonthCarousel
      modifiers={modifiers}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
      onPrevious={onPrevious}
      onNext={onNext}
    />
  );
}
