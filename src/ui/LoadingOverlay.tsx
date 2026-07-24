import { Modal, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import { Spinner, Typography, useThemeColor } from "heroui-native";

type LoadingOverlayProps = {
  visible: boolean;
  /** Optional override; defaults to the generic `common:justAMoment`. */
  message?: string;
  /**
   * Optional secondary line under the message (e.g. "12/40"). Text only — a
   * JS-driven progress bar would stall during the synchronous blocks this
   * overlay exists to cover, while text updates land between work chunks.
   */
  progressText?: string;
  /**
   * When `true` (default) the overlay renders through a native `Modal` so it
   * covers the entire screen regardless of where it sits in the tree. Set it
   * `false` for an overlay rendered at the app ROOT (a full-screen sibling above
   * the navigator): a plain absolute view then covers everything AND composes
   * with native modals — crucial when another native `Modal` may mount/unmount
   * underneath, since two overlapping native modals can leave one stuck.
   */
  asModal?: boolean;
};

/**
 * Full-screen blocking HUD for slow, non-cancellable operations (opening a
 * budget, enabling encryption, resetting sync, …). A frosted-blur backdrop (same
 * material as the ScreenHeader) fades in and swallows touches. The label is
 * intentionally generic — same overlay everywhere.
 */
export function LoadingOverlay({
  visible,
  message,
  progressText,
  asModal = true,
}: LoadingOverlayProps) {
  const { t } = useTranslation("common");
  const accent = useThemeColor("accent");

  const content = (
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
      {progressText ? (
        <Typography type="body-sm" className="mt-1 text-center text-muted">
          {progressText}
        </Typography>
      ) : null}
    </View>
  );

  if (!asModal) {
    // Plain root overlay — no native Modal, so it never conflicts with the
    // picker screens' own Modal as they mount/unmount across a budget switch.
    if (!visible) return null;
    return <View style={StyleSheet.absoluteFill}>{content}</View>;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      {content}
    </Modal>
  );
}
