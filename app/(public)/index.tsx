import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Card } from "@/ui";
import { Alert } from "@/ui/molecules";
import {
  useLogin,
  LoginHero,
  ServerUrlField,
  PasswordField,
  OpenIdInfo,
  LoginActionButton,
  SecondaryLinks,
} from "@/features/login";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const login = useLogin();

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-20 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <LoginHero />

        <Card className="p-5 gap-4">
          <ServerUrlField
            value={login.serverUrl}
            onChange={login.handleServerUrlChange}
            onSubmit={login.handleProbe}
            isLocked={login.isLocked}
            onChangeServer={login.handleChangeServer}
            isInvalid={login.step === "idle" && login.error?.category === "validation"}
            errorMessage={login.error?.message}
          />

          {login.step === "password" && (
            <PasswordField
              value={login.password}
              onChange={login.handlePasswordChange}
              onSubmit={login.handlePasswordLogin}
              isInvalid={login.error?.category === "validation"}
              errorMessage={login.error?.message}
            />
          )}

          {login.step === "openid" && <OpenIdInfo />}

          {login.error && login.error.category !== "validation" && (
            <Alert variant="error" title={login.error.message} onDismiss={login.dismissError} />
          )}

          <LoginActionButton
            step={login.step}
            loading={login.loading}
            disabled={login.step === "password" && !login.password}
            onProbe={login.handleProbe}
            onPasswordLogin={login.handlePasswordLogin}
            onOpenIdLogin={login.handleOpenIdLogin}
          />
        </Card>

        <SecondaryLinks onLocalMode={login.handleLocalMode} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
