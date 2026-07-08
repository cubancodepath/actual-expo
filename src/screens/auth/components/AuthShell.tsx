import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";

/**
 * Shared layout for the auth screens (server connect / password / openid):
 * keyboard-aware scroll container and the logo + tagline header. Each screen
 * renders its own fields + action button as children. Back navigation is the
 * native transparent-header chevron set by the (public) stack layout; the top
 * padding leaves room for it.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("auth");

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-24 pb-16"
        keyboardShouldPersistTaps="handled"
      >
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
