import { Fragment } from "react";
import { View } from "react-native";
import { ListGroup, Separator, Switch, Typography, useThemeColor } from "heroui-native";
import { ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { promptToEnableEncryption } from "@/ui/feedback/EncryptionPasswordPrompt";
import { useMetadataPref } from "@/lib/hooks/useMetadataPref";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

/**
 * Encryption group — mirrors upstream's `settings/Encryption.tsx` states,
 * adapted to mobile (no "missing crypto API" state — @noble is always
 * available). A Switch enables encryption; once on, "Generate New Key" re-keys.
 * Always visible; the switch is disabled without a server.
 */
export function EncryptionGroup() {
  const { t } = useTranslation("settings");
  const muted = useThemeColor("muted");

  const [encryptKeyId] = useMetadataPref("encryptKeyId");
  const serverUrl = useSessionStore((s) => s.serverUrl);
  const token = useSessionStore((s) => s.token);
  const isLocalOnly = useBudgetContextStore((s) => s.isLocalOnly);
  const fileId = useBudgetContextStore((s) => s.fileId);

  const isEncrypted = !!encryptKeyId;
  const canEncrypt = !!serverUrl && !!token && !isLocalOnly && !!fileId;

  const note = isEncrypted
    ? t("encryptionEnabled")
    : canEncrypt
      ? t("encryptionNotEnabled")
      : t("encryptionNoServer");

  const handleToggle = (next: boolean) => {
    // Only enabling is actionable — encryption can't be disabled (upstream). The
    // switch is controlled by `isEncrypted`, so an off-toggle just snaps back.
    if (next && !isEncrypted) void promptToEnableEncryption();
  };

  return (
    <>
      <ListGroup>
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t("enableEncryption")}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <Switch
              isSelected={isEncrypted}
              isDisabled={!isEncrypted && !canEncrypt}
              onSelectedChange={handleToggle}
            />
          </ListGroup.ItemSuffix>
        </ListGroup.Item>

        {isEncrypted && (
          <Fragment>
            <Separator className="mx-4" />
            <ListGroup.Item onPress={() => void promptToEnableEncryption()}>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t("generateNewKey")}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <View className="flex-row items-center">
                  <ChevronRight size={18} color={muted} />
                </View>
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </Fragment>
        )}
      </ListGroup>

      <Typography className="mt-3 ml-2 text-sm text-muted">{note}</Typography>
    </>
  );
}
