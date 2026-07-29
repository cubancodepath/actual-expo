import { Button } from "heroui-native";
import type { HeaderAction } from "./types";

/**
 * Renders a {@link HeaderAction} as an RN view, for platforms without native
 * bar button items.
 *
 * `ghost` on purpose: a header action is borderless text (or a glyph) in the
 * header's own tint, not a filled CTA. `sm` keeps it inside the bar's height —
 * heroui's default `md` is 48pt against a 44pt bar.
 */
export function renderHeaderAction(action: HeaderAction, tintColor?: string) {
  const Icon = action.icon?.lucide;
  // The action's own colour wins; the header's tint is the fallback.
  const color = action.tintColor ?? tintColor;

  return (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly={Icon != null}
      className={Icon ? "rounded-full" : undefined}
      isDisabled={action.disabled}
      onPress={action.onPress}
      accessibilityLabel={action.label}
    >
      {Icon ? (
        <Icon size={22} color={color} />
      ) : (
        <Button.Label
          style={color ? { color } : undefined}
          className={action.emphasis === "done" ? "font-semibold" : undefined}
        >
          {action.label}
        </Button.Label>
      )}
    </Button>
  );
}
