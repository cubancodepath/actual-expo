import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "@/stores/prefsStore";
import { Button } from "@/ui";

type SecondaryLinksProps = {
  onLocalMode: () => void;
};

export function SecondaryLinks({ onLocalMode }: SecondaryLinksProps) {
  const { t } = useTranslation("auth");
  const router = useRouter();

  return (
    <View className="items-center mt-8 gap-3">
      <Button variant="ghost" onPress={onLocalMode}>
        {t("useWithoutServer")}
      </Button>

      {__DEV__ && (
        <>
          <Button
            variant="tertiary"
            size="sm"
            onPress={() => usePrefsStore.getState().setPrefs({ hasSeenOnboarding: false })}
          >
            {t("devReplayOnboarding")}
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            onPress={() => router.push("/(public)/design-system")}
          >
            Design System
          </Button>
        </>
      )}
    </View>
  );
}
