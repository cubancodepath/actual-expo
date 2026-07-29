import { LinearTransition } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react-native";
import { Button, Spinner, useThemeColor } from "heroui-native";
import { usePasswordSignIn } from "./hooks/usePasswordSignIn";
import { AuthShell } from "@/screens/auth/components/AuthShell";
import { AuthField } from "@/screens/auth/components/AuthField";

/** Step 2a: password sign-in for a server resolved by the connect screen. */
export function PasswordSignInScreen() {
  const { t } = useTranslation("auth");
  const { serverUrl } = useLocalSearchParams<{ serverUrl: string }>();
  const { password, setPassword, loading, signIn } = usePasswordSignIn(serverUrl);
  const accentForeground = useThemeColor("accent-foreground");

  return (
    <AuthShell>
      <AuthField
        label={t("password")}
        icon={Lock}
        testID="password-input"
        placeholder={t("passwordPlaceholder")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoFocus
        returnKeyType="go"
        onSubmitEditing={signIn}
      />

      <Button
        variant="primary"
        size="lg"
        layout={LinearTransition.springify()}
        onPress={signIn}
        isDisabled={!password || loading}
        className="mt-4"
      >
        {loading && <Spinner size="sm" color={accentForeground} />}
        <Button.Label>{t("signIn")}</Button.Label>
      </Button>
    </AuthShell>
  );
}
