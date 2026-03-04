import { Pressable, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";

const baseStyle: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 12,
  paddingHorizontal: 14,
};

interface AddTransactionButtonProps {
  accountId?: string;
  bottom?: number;
  collapsed?: SharedValue<boolean>;
}

const TIMING = { duration: 200 };

export function AddTransactionButton({ accountId, bottom = 100, collapsed }: AddTransactionButtonProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const glass = isLiquidGlassAvailable();

  const labelStyle = useAnimatedStyle(() => {
    const isCollapsed = collapsed ? collapsed.value : false;
    return {
      opacity: withTiming(isCollapsed ? 0 : 1, TIMING),
      width: withTiming(isCollapsed ? 0 : 90, TIMING),
      marginLeft: withTiming(isCollapsed ? 0 : 4, TIMING),
    };
  });

  const content = (
    <>
      <Ionicons name="add" size={22} color={colors.textPrimary} />
      <Animated.View style={[{ overflow: "hidden" }, labelStyle]}>
        <Text variant="body" color={colors.textPrimary} style={{ fontWeight: "600" }} numberOfLines={1}>
          Transaction
        </Text>
      </Animated.View>
    </>
  );

  return (
    <View
      style={{
        position: "absolute",
        bottom,
        right: 20,
        borderRadius: 50,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => router.push({ pathname: "/(auth)/transaction/new", params: accountId ? { accountId } : undefined })}
      >
        {glass ? (
          <GlassView isInteractive style={{ borderRadius: 50, ...baseStyle }}>
            {content}
          </GlassView>
        ) : (
          <BlurView tint="systemChromeMaterial" intensity={100} style={baseStyle}>
            {content}
          </BlurView>
        )}
      </Pressable>
    </View>
  );
}
