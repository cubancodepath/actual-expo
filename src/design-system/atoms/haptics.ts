import * as Haptics from "expo-haptics";

export type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error";

const impactMap = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

const notificationMap = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const;

export function triggerHaptic(type: HapticType) {
  if (process.env.EXPO_OS !== "ios") return;

  if (type in impactMap) {
    Haptics.impactAsync(impactMap[type as keyof typeof impactMap]);
  } else {
    Haptics.notificationAsync(notificationMap[type as keyof typeof notificationMap]);
  }
}
