import { useState, type ReactNode } from "react";
import { View } from "react-native";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import {
  Bug,
  FileText,
  FolderOpen,
  Languages,
  Link as LinkIcon,
  ListFilter,
  LogOut,
  Palette,
  PlusCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useSyncStore } from "@/stores/syncStore";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag, loadClock, repairSync } from "@/core/sync";
import { clearLocalData } from "@/core/db";
import { closeBudget } from "@/services/budgetfiles";
import { logout } from "@/services/authService";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";
import { dialog } from "@/ui/feedback/dialog/dialogStore";

const ICON_SIZE = 20;

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/** A short muted section label above a ListGroup card. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <Typography className="mb-2 ml-2 text-sm font-medium text-muted">{children}</Typography>;
}

/** Navigation row: leading icon, title, trailing chevron. */
function NavRow({ icon, title, onPress }: { icon: ReactNode; title: string; onPress: () => void }) {
  return (
    <ListGroup.Item onPress={onPress}>
      <ListGroup.ItemPrefix>{icon}</ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{title}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix />
    </ListGroup.Item>
  );
}

/** Read-only (or tap-to-retry) label + value row. */
function ValueRow({
  icon,
  label,
  value,
  valueColor,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
}) {
  return (
    <ListGroup.Item disabled={!onPress} onPress={onPress}>
      <ListGroup.ItemPrefix>{icon}</ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Typography
          numberOfLines={1}
          className="text-sm text-muted"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value || "—"}
        </Typography>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

/** Action row (no chevron): leading icon + title, optionally colored/destructive. */
function ActionRow({
  icon,
  title,
  titleClassName,
  onPress,
  disabled,
  description,
}: {
  icon: ReactNode;
  title: string;
  titleClassName?: string;
  onPress?: () => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <ListGroup.Item disabled={disabled} onPress={disabled ? undefined : onPress}>
      <ListGroup.ItemPrefix>{icon}</ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle className={titleClassName}>{title}</ListGroup.ItemTitle>
        {description ? <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription> : null}
      </ListGroup.ItemContent>
    </ListGroup.Item>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Settings home: budget shortcuts, app preferences, and the server / local-only
 * mode section. HeroUI replacement for the legacy `app/(auth)/settings/index`.
 */
export function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  // Cross-namespace error lookup — the typed `tc` can't express the
  // `errors:<code>` key, so cast to a plain string lookup (matches upstream).
  const tErr = (code: string) => (tc as unknown as (key: string) => string)(`errors:${code}`);
  const [muted, danger, foreground] = useThemeColor(["muted", "danger", "foreground"]);

  const serverUrl = useSessionStore((s) => s.serverUrl);
  const { fileId, groupId, encryptKeyId, budgetName, lastSyncedTimestamp, isLocalOnly } =
    useBudgetContextStore();
  const lastSync = useSyncStore((s) => s.lastSync);
  const syncStatus = useSyncStore((s) => s.status);
  const syncNow = useSyncStore((s) => s.sync);
  const [, setLoggingOut] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const mutedIcon = (Icon: typeof Server) => <Icon size={ICON_SIZE} color={muted} />;

  const lastSyncText =
    syncStatus === "syncing"
      ? t("syncing")
      : syncStatus === "error"
        ? t("syncFailedTapToRetry")
        : lastSync
          ? lastSync.toLocaleTimeString()
          : lastSyncedTimestamp
            ? lastSyncedTimestamp.slice(0, 16)
            : tc("never");

  async function handleDeleteLocal() {
    const ok = await dialog.confirm({
      title: t("deleteAllData"),
      message: t("deleteAllDataMessage"),
      confirmLabel: tc("delete"),
      destructive: true,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      resetSyncState();
      resetAllStores();
      await logout();
      await clearLocalData();
      await loadClock();
    } finally {
      clearSwitchingFlag();
      setLoggingOut(false);
    }
  }

  async function handleConnectToServer() {
    await closeBudget();
    await logout();
  }

  async function handleLogout() {
    const ok = await dialog.confirm({
      title: t("disconnectTitle"),
      message: t("disconnectMessage"),
      confirmLabel: tc("disconnect"),
      destructive: true,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      await closeBudget();
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleRepairSync() {
    const ok = await dialog.confirm({
      title: t("repairSyncTitle"),
      message: t("repairSyncMessage"),
      confirmLabel: t("repairSyncConfirm"),
    });
    if (!ok) return;
    setRepairing(true);
    try {
      await repairSync();
      await useSyncStore.getState().sync({ force: true });
      // sync() never rejects — read the badge state it recorded.
      const { status, lastErrorCode } = useSyncStore.getState();
      if (status === "error" && lastErrorCode) {
        await dialog.alert({ title: tc("error"), message: tErr(lastErrorCode) });
      }
    } catch (e) {
      emitErrorEvent(e);
      await dialog.alert({ title: tc("error"), message: tErr(toErrorCode(e)) });
    } finally {
      setRepairing(false);
    }
  }

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        {/* Current Budget */}
        <View className="mb-6">
          <SectionLabel>{t("currentBudget")}</SectionLabel>
          <Typography className="mb-3 ml-2 text-2xl font-bold text-foreground">
            {budgetName || t("defaultBudgetName")}
          </Typography>
          <ListGroup>
            <NavRow
              icon={mutedIcon(SlidersHorizontal)}
              title={t("budgetSettings")}
              onPress={() => router.push("/(auth)/settings/budget")}
            />
            <Separator className="mx-4" />
            <NavRow
              icon={mutedIcon(PlusCircle)}
              title={t("newBudget")}
              onPress={() => router.push("/(auth)/new-budget")}
            />
            <Separator className="mx-4" />
            <NavRow
              icon={mutedIcon(FolderOpen)}
              title={t("openBudget")}
              onPress={() => router.push("/(auth)/change-budget")}
            />
          </ListGroup>
        </View>

        {/* Budget Data */}
        <View className="mb-6">
          <SectionLabel>{t("budgetData")}</SectionLabel>
          <ListGroup>
            <NavRow
              icon={mutedIcon(Users)}
              title={t("payees")}
              onPress={() => router.push("/(auth)/settings/payees")}
            />
            <Separator className="mx-4" />
            <NavRow
              icon={mutedIcon(ListFilter)}
              title={t("rules")}
              onPress={() => router.push("/(auth)/settings/rules")}
            />
          </ListGroup>
        </View>

        {/* App */}
        <View className="mb-6">
          <SectionLabel>{t("app")}</SectionLabel>
          <ListGroup>
            <NavRow
              icon={mutedIcon(Palette)}
              title={t("display")}
              onPress={() => router.push("/(auth)/settings/display")}
            />
            <Separator className="mx-4" />
            <NavRow
              icon={mutedIcon(Languages)}
              title={t("language")}
              onPress={() => router.push("/(auth)/settings/language")}
            />
          </ListGroup>
        </View>

        {/* Server / Mode */}
        {isLocalOnly ? (
          <View className="mb-6">
            <SectionLabel>{t("mode")}</SectionLabel>
            <ListGroup>
              <ActionRow
                icon={mutedIcon(Smartphone)}
                title={t("localOnly")}
                description={t("localOnlyDescription")}
                disabled
              />
              <Separator className="mx-4" />
              <NavRow
                icon={mutedIcon(Server)}
                title={t("connectToServer")}
                onPress={handleConnectToServer}
              />
              <Separator className="mx-4" />
              <ActionRow
                icon={<Trash2 size={ICON_SIZE} color={danger} />}
                title={t("deleteAllData")}
                titleClassName="text-danger"
                onPress={handleDeleteLocal}
              />
            </ListGroup>
          </View>
        ) : (
          <View className="mb-6">
            <SectionLabel>{t("server")}</SectionLabel>
            <ListGroup className="mb-3">
              <ValueRow icon={mutedIcon(LinkIcon)} label={t("url")} value={serverUrl} />
              <Separator className="mx-4" />
              <ValueRow
                icon={mutedIcon(RefreshCw)}
                label={t("lastSync")}
                value={lastSyncText}
                valueColor={syncStatus === "error" ? danger : undefined}
                onPress={syncStatus === "error" ? () => syncNow() : undefined}
              />
              <Separator className="mx-4" />
              <ValueRow
                icon={mutedIcon(FileText)}
                label={t("fileId")}
                value={fileId ? `${fileId.slice(0, 8)}…` : ""}
              />
              <Separator className="mx-4" />
              <ValueRow
                icon={mutedIcon(Users)}
                label={t("groupId")}
                value={groupId ? `${groupId.slice(0, 8)}…` : ""}
              />
              {encryptKeyId ? (
                <>
                  <Separator className="mx-4" />
                  <ValueRow
                    icon={mutedIcon(ShieldCheck)}
                    label={t("encryption")}
                    value={`${encryptKeyId.slice(0, 8)}…`}
                  />
                </>
              ) : null}
            </ListGroup>
            <ListGroup>
              <ActionRow
                icon={mutedIcon(RefreshCw)}
                title={t("repairSync")}
                onPress={handleRepairSync}
                disabled={repairing}
              />
              <Separator className="mx-4" />
              <ActionRow
                icon={<LogOut size={ICON_SIZE} color={danger} />}
                title={t("disconnectFromServer")}
                titleClassName="text-danger"
                onPress={handleLogout}
              />
            </ListGroup>
          </View>
        )}

        {/* Debug: Sentry test */}
        {__DEV__ ? (
          <View className="mb-6">
            <SectionLabel>Debug</SectionLabel>
            <ListGroup>
              <ActionRow
                icon={<Bug size={ICON_SIZE} color={danger} />}
                title="Test Sentry Error"
                onPress={async () => {
                  Sentry.captureException(new Error("Test error from Settings"));
                  await dialog.alert({
                    title: "Sentry",
                    message: "Test error sent! Check your Sentry dashboard.",
                  });
                }}
              />
            </ListGroup>
          </View>
        ) : null}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back>
            <Button
              variant="secondary"
              isIconOnly
              className="rounded-full"
              onPress={() => router.dismissAll()}
            >
              <X size={24} color={foreground} />
            </Button>
          </ScreenHeader.Back>
          <ScreenHeader.Title>{t("title")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
