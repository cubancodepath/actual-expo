import { Alert, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSelector } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Input,
  Label,
  Spinner,
  TextArea,
  TextField,
  Typography,
  useThemeColor,
} from "heroui-native";
import { ArchiveRestore, Trash2, X } from "lucide-react-native";
import { updateAccount } from "@/core/domain/accounts";
import { getNote } from "@/core/domain/notes";
import type { Account } from "@/core/types/models";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useAccountSettingsForm } from "./hooks/useAccountSettingsForm";

/** Edit-account modal: rename, notes, and a close/reopen action. */
export function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === id);
  const accent = useThemeColor("accent");

  // Account notes live in the shared `notes` table, keyed `account-<id>`.
  const noteQuery = useQuery({
    queryKey: ["account-note", id],
    queryFn: () => getNote(`account-${id}`),
    enabled: !!id,
  });

  if (!account || noteQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner color={accent} />
      </View>
    );
  }
  return <AccountSettingsForm account={account} initialNote={noteQuery.data ?? ""} />;
}

/** The form itself — mounted once account + note have loaded so they seed the form. */
function AccountSettingsForm({ account, initialNote }: { account: Account; initialNote: string }) {
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
  const { form, submit, isSaving } = useAccountSettingsForm(account, initialNote);

  const values = useSelector(form.store, (s) => s.values);
  const canSubmit = useSelector(form.store, (s) => s.canSubmit);
  const hasChanges =
    values.name.trim() !== account.name || values.notes.trim() !== initialNote.trim();

  function handleCloseReopen() {
    if (account.closed) {
      Alert.alert(t("settings.reopenAccountTitle"), t("settings.reopenAccountMessage"), [
        { text: tc("cancel"), style: "cancel" },
        {
          text: t("settings.reopen"),
          onPress: () => {
            updateAccount(account.id, { closed: false }).catch(emitErrorEvent);
          },
        },
      ]);
    } else {
      router.push({ pathname: "/(auth)/account/close", params: { id: account.id } });
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader>
        <ScreenHeader.Back>
          <Button
            variant="secondary"
            isIconOnly
            className="rounded-full"
            onPress={() => router.back()}
          >
            <X size={24} color={foreground} />
          </Button>
        </ScreenHeader.Back>
        <ScreenHeader.Title>{t("settings.title")}</ScreenHeader.Title>
      </ScreenHeader>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="gap-4 px-4 pt-2 pb-6"
      >
        <TextField>
          <Label>{t("settings.accountNameLabel")}</Label>
          <Input
            value={values.name}
            onChangeText={(txt) => form.setFieldValue("name", txt)}
            placeholder={t("settings.accountNamePlaceholder")}
            returnKeyType="done"
          />
        </TextField>

        <View>
          <Typography className="mb-2 ml-2 text-sm font-medium text-muted">
            {t("settings.notesLabel")}
          </Typography>
          <TextArea
            value={values.notes}
            onChangeText={(txt) => form.setFieldValue("notes", txt)}
            placeholder={t("settings.notesPlaceholder")}
            className="h-24"
          />
        </View>

        <Button
          className="mt-2"
          onPress={submit}
          isDisabled={!canSubmit || !hasChanges || isSaving}
        >
          {isSaving ? <Spinner /> : <Button.Label>{tc("save")}</Button.Label>}
        </Button>

        <Button variant="ghost" onPress={handleCloseReopen}>
          {account.closed ? (
            <ArchiveRestore size={18} color={foreground} />
          ) : (
            <Trash2 size={18} color={danger} />
          )}
          <Button.Label style={account.closed ? undefined : { color: danger }}>
            {account.closed ? t("contextMenu.reopenAccount") : t("contextMenu.closeAccount")}
          </Button.Label>
        </Button>
      </ScrollView>
    </View>
  );
}
