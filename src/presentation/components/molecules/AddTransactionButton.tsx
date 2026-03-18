import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useTheme } from "../../providers/ThemeProvider";
import { Icon } from "../atoms/Icon";
import { Text } from "../atoms/Text";

const glass = isLiquidGlassAvailable();

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

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

  function handlePress() {
    router.push({
      pathname: "/(auth)/transaction/new",
      params: accountId ? { accountId } : undefined,
    });
  }

  const content = (
    <>
      <Icon name="add" size={ICON_SIZE} color={colors.textPrimary} />
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
    </>
  );

  const baseInner = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: SIZE,
  };

  return (
    <View style={{ position: "absolute", bottom, right: 20 }}>
      <Animated.View style={[{ overflow: "hidden" }, containerStyle]}>
        <Pressable onPress={handlePress}>
          {glass ? (
            <AnimatedGlassView isInteractive style={[{ ...baseInner }, innerStyle]}>
              {content}
            </AnimatedGlassView>
          ) : (
            <AnimatedBlurView
              tint="systemChromeMaterial"
              intensity={100}
              style={[baseInner, innerStyle]}
            >
              {content}
            </AnimatedBlurView>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
