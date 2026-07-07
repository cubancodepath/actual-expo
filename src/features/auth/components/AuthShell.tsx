import type { ReactNode } from "react";
import { useCallback } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";

const StyledIonicons = withUniwind(Ionicons);

type AuthShellProps = {
  children: ReactNode;
  /** When provided, renders a "Change server" back affordance above the header. */
  onBack?: () => void;
};

/**
 * Shared layout for the auth screens (server connect / password / openid):
 * keyboard-aware scroll container, fade-in on focus, and the logo + tagline
 * header. Each screen renders its own single field + action button as children.
 */
export function AuthShell({ children, onBack }: AuthShellProps) {
  const { t } = useTranslation("auth");
  const contentOpacity = useSharedValue(0);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useFocusEffect(
    useCallback(() => {
      contentOpacity.value = withTiming(1, { duration: 200 });
    }, [contentOpacity]),
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-24 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={contentAnimStyle}>
          <View className="items-center mb-16">
            <Image
              source={require("../../../../assets/splash-icon.png")}
              resizeMode="contain"
              style={{ width: 100, height: 100 }}
              className="mb-2"
            />
            <Typography.Heading type="h1" className="tracking-tighter mb-1">
              {Constants.expoConfig?.name ?? "Actual"}
            </Typography.Heading>
            <Typography type="body-sm" color="muted">
              {t("tagline")}
            </Typography>
          </View>

          <View className="gap-2">{children}</View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
