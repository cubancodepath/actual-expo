import { Pressable, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";

const innerStyle: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 12,
  paddingHorizontal: 20,
  gap: 6,
};

const iconStyle: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
};

interface AddTransactionButtonProps {
  iconOnly?: boolean;
}

export function AddTransactionButton({ iconOnly }: AddTransactionButtonProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const glass = isLiquidGlassAvailable();

  const content = iconOnly ? (
    <Ionicons name="add" size={22} color={colors.textPrimary} />
  ) : (
    <>
      <Ionicons name="add" size={20} color={colors.textPrimary} />
      <Text variant="body" color={colors.textPrimary} style={{ fontWeight: "600" }}>
        Transaction
      </Text>
    </>
  );

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(auth)/transaction/new" })}
      style={{
        position: "absolute",
        bottom: 100,
        right: 20,
        borderRadius: 50,
        overflow: "hidden",
      }}
    >
      {glass ? (
        <GlassView isInteractive style={{ borderRadius: 50, ...(iconOnly ? iconStyle : innerStyle) }}>
          {content}
        </GlassView>
      ) : (
        <BlurView tint="systemChromeMaterial" intensity={100} style={iconOnly ? iconStyle : innerStyle}>
          {content}
        </BlurView>
      )}
    </Pressable>
  );
}
