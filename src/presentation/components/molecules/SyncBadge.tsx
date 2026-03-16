import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSyncStore } from "../../../stores/syncStore";
import { useTheme } from "../../providers/ThemeProvider";

export function SyncBadge() {
  const { t } = useTranslation();
  const { status, sync } = useSyncStore();
  const { colors } = useTheme();
  const [showSuccess, setShowSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "success") {
      setShowSuccess(true);
      timer.current = setTimeout(() => setShowSuccess(false), 3000);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status]);

  if (status === "syncing") {
    return (
      <View
        style={{ paddingRight: 14 }}
        accessible
        accessibilityRole="text"
        accessibilityLabel={t("a11y.syncing")}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (status === "error") {
    return (
      <Pressable
        onPress={sync}
        hitSlop={10}
        style={{ paddingRight: 14 }}
        accessibilityRole="button"
        accessibilityLabel={t("a11y.syncFailed")}
      >
        <Ionicons name="alert-circle" size={20} color={colors.negative} accessible={false} />
      </Pressable>
    );
  }

  if (showSuccess) {
    return (
      <View
        style={{ paddingRight: 14 }}
        accessible
        accessibilityRole="text"
        accessibilityLabel={t("a11y.synced")}
      >
        <Ionicons name="checkmark-circle" size={20} color={colors.positive} accessible={false} />
      </View>
    );
  }

  return null;
}
