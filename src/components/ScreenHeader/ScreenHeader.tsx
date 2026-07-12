import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Typography, useThemeColor } from "heroui-native";
import { ChevronLeft } from "lucide-react-native";

/**
 * iOS-style nav bar header, composed by the consumer:
 *
 * ```tsx
 * <ScreenHeader>
 *   <ScreenHeader.Back />
 *   <ScreenHeader.Title>Payee</ScreenHeader.Title>
 *   {/* optional: <ScreenHeader.Actions>…</ScreenHeader.Actions> *\/}
 * </ScreenHeader>
 * ```
 *
 * Root lays the pieces into three equal (flex-1) columns — left / center / right —
 * so the Title stays screen-centered whether or not Actions are present, without
 * absolute positioning. No safe-area padding here: these screens are pushed inside
 * the transaction modal card, which already clears the status bar.
 *
 * For a header whose frosted blur ramps up as content scrolls underneath, wrap
 * this row in {@link ScreenHeaderFloating} inside a {@link ScreenHeaderScrollArea}.
 */

export function ScreenHeaderBack({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  return (
    <Button
      variant="secondary"
      isIconOnly
      className="rounded-full"
      onPress={onPress ?? (() => router.back())}
    >
      <ChevronLeft size={32} color={foreground} />
    </Button>
  );
}

export function ScreenHeaderTitle({ children }: { children: ReactNode }) {
  return (
    <Typography numberOfLines={1} className="text-lg font-semibold text-foreground">
      {children}
    </Typography>
  );
}

export function ScreenHeaderActions({ children }: { children?: ReactNode }) {
  return <View className="flex-row items-center gap-1">{children}</View>;
}

/** Pull the child rendered from a given compound part (or undefined if absent). */
function findSlot(children: ReactNode, type: unknown): ReactNode {
  return Children.toArray(children).find(
    (c): c is ReactElement => isValidElement(c) && c.type === type,
  );
}

export function ScreenHeaderRoot({ children }: { children: ReactNode }) {
  const back = findSlot(children, ScreenHeaderBack);
  const title = findSlot(children, ScreenHeaderTitle);
  const actions = findSlot(children, ScreenHeaderActions);
  return (
    <View className="flex-row items-center px-4 py-4">
      <View className="flex-1 items-start">{back}</View>
      <View className="flex-1 items-center">{title}</View>
      <View className="flex-1 items-end">{actions}</View>
    </View>
  );
}
