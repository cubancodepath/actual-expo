import { LinearTransition } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { Alert, Button, Spinner, useThemeColor } from "heroui-native";
import { useOpenIdSignIn } from "./hooks/useOpenIdSignIn";
import { AuthShell } from "@/screens/auth/components/AuthShell";

WebBrowser.maybeCompleteAuthSession();

/** Step 2b: OpenID sign-in for a server resolved by the connect screen. */
export function OpenIdSignInScreen() {
  const { t } = useTranslation("auth");
  const { serverUrl } = useLocalSearchParams<{ serverUrl: string }>();
  const { loading, signIn } = useOpenIdSignIn(serverUrl);
  const accentForeground = useThemeColor("accent-foreground");

  return (
    <AuthShell>
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{t("openIdRedirect")}</Alert.Description>
        </Alert.Content>
      </Alert>

      <Button
        variant="primary"
        size="lg"
        layout={LinearTransition.springify()}
        onPress={signIn}
        isDisabled={loading}
        className="mt-4"
      >
        {loading && <Spinner size="sm" color={accentForeground} />}
        <Button.Label>{t("signInWithOpenId")}</Button.Label>
      </Button>
    </AuthShell>
  );
}
