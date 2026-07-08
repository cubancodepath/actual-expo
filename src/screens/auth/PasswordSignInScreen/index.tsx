import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useTranslation } from "react-i18next";
import { Button, Input, Spinner, Typography, useThemeColor } from "heroui-native";
import { usePasswordSignIn } from "./hooks/usePasswordSignIn";
import { AuthShell } from "@/screens/auth/components/AuthShell";

const StyledIonicons = withUniwind(Ionicons);

/** Step 2a: password sign-in for a server resolved by the connect screen. */
export function PasswordSignInScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { serverUrl } = useLocalSearchParams<{ serverUrl: string }>();
  const { password, setPassword, loading, signIn } = usePasswordSignIn(serverUrl);
  const accentForeground = useThemeColor("accent-foreground");

  return (
    <AuthShell onBack={() => router.back()}>
      <Typography
        type="body-xs"
        weight="semibold"
        color="muted"
        className="uppercase tracking-wide mt-2 ml-1"
      >
        {t("password")}
      </Typography>
      <View className="flex-row items-center">
        <Input
          testID="password-input"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={signIn}
          className="flex-1 pl-10"
        />
        <StyledIonicons
          name="lock-closed-outline"
          size={16}
          className="absolute left-3.5 text-muted"
          pointerEvents="none"
        />
      </View>

      <Button
        variant="primary"
        size="lg"
        onPress={signIn}
        isDisabled={!password || loading}
        isIconOnly={loading}
        className="mt-4"
      >
        {loading ? (
          <Spinner color={accentForeground} />
        ) : (
          <Button.Label>{t("signIn")}</Button.Label>
        )}
      </Button>
    </AuthShell>
  );
}
