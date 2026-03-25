import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { formatCents } from "@/lib/currency";
import { cn } from "@/lib/cn";

const MAX_CENTS = 999_999_999;

type CurrencyInputProps = {
  value: number;
  onChange: (cents: number) => void;
  symbol?: string;
  autoFocus?: boolean;
  className?: string;
};

export function CurrencyInput({
  value,
  onChange,
  symbol = "$",
  autoFocus,
  className,
}: CurrencyInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const cursorOpacity = useSharedValue(0);

  useEffect(() => {
    if (focused) {
      cursorOpacity.value = withRepeat(withTiming(1, { duration: 530 }), -1, true);
    } else {
      cursorOpacity.value = 0;
    }
    return () => cancelAnimation(cursorOpacity);
  }, [focused, cursorOpacity]);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  function handleChangeText(text: string) {
    const digits = text.replace(/\D/g, "");
    const cents = Math.min(Number.parseInt(digits || "0", 10), MAX_CENTS);
    onChange(cents);
  }

  function handleKeyPress(e: { nativeEvent: { key: string } }) {
    if (e.nativeEvent.key === "Backspace") {
      onChange(Math.floor(value / 10));
    }
  }

  const display = formatCents(value);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      className={cn("items-center py-4", className)}
    >
      <View className="flex-row items-baseline">
        <Text
          className={cn("text-xl font-bold", focused ? "text-accent" : "text-muted")}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {symbol}
        </Text>
        <Text
          className={cn("text-3xl font-bold", focused ? "text-accent" : "text-foreground")}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {display}
        </Text>
        {focused && (
          <Animated.View style={cursorStyle} className="ml-0.5">
            <Text className="text-3xl font-bold text-accent">|</Text>
          </Animated.View>
        )}
      </View>

      <View
        className={cn("h-0.5 w-full mt-2 rounded-full", focused ? "bg-accent" : "bg-border-light")}
      />

      <TextInput
        ref={inputRef}
        value={String(value)}
        onChangeText={handleChangeText}
        onKeyPress={handleKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        caretHidden
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}
