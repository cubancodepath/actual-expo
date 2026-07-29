import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "heroui-native";

export interface ScreenProps extends ViewProps {
  children: ReactNode;
}

/**
 * The root container for a screen: a plain flex-1 background View.
 *
 * Deliberately NOT a SafeAreaView — insets are handled where they belong, by
 * `contentInsetAdjustmentBehavior="automatic"` on the scroll view (iOS, which
 * accounts for a transparent header) and `android:pt-safe-offset-*` classes on
 * Android. Wrapping the screen instead would push content down twice.
 *
 * Ported from the HeroUI fitness example's `Screen`.
 */
export function Screen({ className, children, ...rest }: ScreenProps) {
  return (
    <View {...rest} collapsable={false} className={cn("flex-1 bg-background", className)}>
      {children}
    </View>
  );
}
