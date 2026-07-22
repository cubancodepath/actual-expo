import { StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import { Spinner, Typography, useThemeColor } from "heroui-native";

type LoadingOverlayProps = {
  visible: boolean;
  /** Optional override; defaults to the generic `common:justAMoment`. */
  message?: string;
};

/**
 * Full-screen blocking HUD for slow, non-cancellable operations (opening a
 * budget, enabling encryption, unlocking, …). A frosted-blur backdrop (same
 * material as the ScreenHeader) fades in over the content and swallows touches
 * so nothing underneath is interactive. The label is intentionally generic —
 * it's the same overlay everywhere.
 */
export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const { t } = useTranslation("common");
  const accent = useThemeColor("accent");

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      className="absolute inset-0 z-50 items-center justify-center"
      pointerEvents="box-only"
    >
      <BlurView
        tint="systemChromeMaterial"
        intensity={60}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <Spinner size="lg" color={accent} />
      <Typography type="body" weight="semibold" className="mt-4 text-center">
        {message ?? t("justAMoment")}
      </Typography>
    </Animated.View>
  );
}
