import type { ComponentProps } from "react";
import { Accordion } from "heroui-native";

/**
 * Accordion chevron that points right when collapsed and rotates down when
 * expanded (classic disclosure behaviour), instead of heroui's default
 * down→up rotation. Must render inside an `Accordion.Item` — it wraps
 * `Accordion.Indicator`, which reads the item's expanded state from context.
 */
export function CollapsibleIndicator(props: ComponentProps<typeof Accordion.Indicator>) {
  return <Accordion.Indicator animation={{ rotation: { value: [-90, 0] } }} {...props} />;
}
