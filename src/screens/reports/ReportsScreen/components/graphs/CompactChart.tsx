import { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

export type ChartSize = { width: number; height: number };

/**
 * Measured container for the heroui-native-pro / victory-native charts used in
 * report cards. It measures its slot and hands the size to the render child so
 * charts can use victory-native's fixed-size layout mode (`explicitSize`), which
 * the Pro chart types require alongside `orientation`. Renders nothing until the
 * first layout pass produces a non-zero size.
 */
export function CompactChart({
  children,
  className = "flex-1",
}: {
  children: (size: ChartSize) => ReactNode;
  className?: string;
}) {
  const [size, setSize] = useState<ChartSize | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  return (
    <View className={className} onLayout={onLayout}>
      {size && size.width > 0 && size.height > 0 ? children(size) : null}
    </View>
  );
}
