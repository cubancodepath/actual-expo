import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
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
        contentContainerClassName="flex-grow px-6 pt-safe-offset-8 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <LoginHero />

        <Animated.View className="gap-4" entering={FadeIn.duration(250).delay(350)}>
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
            <Animated.View entering={FadeInDown.duration(200)}>
              <PasswordField
                value={login.password}
                onChange={login.handlePasswordChange}
                onSubmit={login.handlePasswordLogin}
                isInvalid={login.error?.category === "validation"}
                errorMessage={login.error?.message}
              />
            </Animated.View>
          )}

          {login.step === "openid" && (
            <Animated.View entering={FadeInDown.duration(200)}>
              <OpenIdInfo />
            </Animated.View>
          )}

          {login.error && login.error.category !== "validation" && (
            <Animated.View entering={FadeInDown.duration(200)}>
              <Alert variant="error" title={login.error.message} onDismiss={login.dismissError} />
            </Animated.View>
          )}

          <LoginActionButton
            step={login.step}
            loading={login.loading}
            disabled={login.step === "password" && !login.password}
            onProbe={login.handleProbe}
            onPasswordLogin={login.handlePasswordLogin}
            onOpenIdLogin={login.handleOpenIdLogin}
          />
        </Animated.View>

        <SecondaryLinks onLocalMode={login.handleLocalMode} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
