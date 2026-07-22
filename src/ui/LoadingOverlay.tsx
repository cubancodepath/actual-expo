import { Modal, StyleSheet, View } from "react-native";
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
 * budget, enabling encryption, resetting sync, …). Rendered through a native
 * `Modal` so it covers the **entire** screen regardless of where it sits in the
 * tree (a plain `absolute inset-0` would only cover its nearest container). A
 * frosted-blur backdrop (same material as the ScreenHeader) fades in and
 * swallows touches. The label is intentionally generic — same overlay everywhere.
 */
export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const { t } = useTranslation("common");
  const accent = useThemeColor("accent");

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View className="flex-1 items-center justify-center" pointerEvents="box-only">
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
      </View>
    </Modal>
  );
}
