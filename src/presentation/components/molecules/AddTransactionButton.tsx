import { View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { GlassButton } from "../atoms/GlassButton";

interface AddTransactionButtonProps {
  accountId?: string;
  bottom?: number;
  collapsed?: SharedValue<boolean>;
}

const SIZE = 48;
const ICON_SIZE = 22;
const TIMING = { duration: 200 };

export function AddTransactionButton({
  accountId,
  bottom = 100,
  collapsed,
}: AddTransactionButtonProps) {
  const router = useRouter();
  const { colors, spacing, borderRadius: br } = useTheme();

  // Pill padding when expanded, circular padding when collapsed
  const circularPadding = (SIZE - ICON_SIZE) / 2;

  const containerStyle = useAnimatedStyle(() => {
    const isCollapsed = collapsed ? collapsed.value : false;
    return {
      borderRadius: withTiming(isCollapsed ? SIZE / 2 : br.full, TIMING),
    };
  });

  const innerStyle = useAnimatedStyle(() => {
    const isCollapsed = collapsed ? collapsed.value : false;
    return {
      paddingHorizontal: withTiming(isCollapsed ? circularPadding : spacing.lg, TIMING),
      gap: withTiming(isCollapsed ? 0 : spacing.xs, TIMING),
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const isCollapsed = collapsed ? collapsed.value : false;
    return {
      opacity: withTiming(isCollapsed ? 0 : 1, TIMING),
      width: withTiming(isCollapsed ? 0 : 90, TIMING),
      marginLeft: withTiming(isCollapsed ? 0 : 4, TIMING),
    };
  });

  return (
    <View style={{ position: "absolute", bottom, right: 20 }}>
      <GlassButton
        onPress={() =>
          router.push({
            pathname: "/(auth)/transaction/new",
            params: accountId ? { accountId } : undefined,
          })
        }
        animatedContainerStyle={containerStyle}
        animatedInnerStyle={innerStyle}
      >
        <Ionicons name="add" size={ICON_SIZE} color={colors.textPrimary} />
        <Animated.View style={[{ overflow: "hidden" }, labelStyle]}>
          <Text
            variant="body"
            color={colors.textPrimary}
            style={{ fontWeight: "600" }}
            numberOfLines={1}
          >
            Transaction
          </Text>
        </Animated.View>
      </GlassButton>
    </View>
  );
}
