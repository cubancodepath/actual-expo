import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import {
  FolderOpen,
  Languages,
  Link as LinkIcon,
  Palette,
  PlusCircle,
  Server,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Unplug,
  X,
} from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useSyncStore } from "@/stores/syncStore";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag, loadClock } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { clearLocalData } from "@/core/db";
import { closeBudget } from "@/services/budgetfiles";
import { getServerInfo } from "@/core/server/server-info/serverInfo.api";
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
  const [muted, danger, foreground] = useThemeColor(["muted", "danger", "foreground"]);

  const serverUrl = useSessionStore((s) => s.serverUrl);
  const { budgetName, lastSyncedTimestamp, isLocalOnly } = useBudgetContextStore();
  const lastSync = useSyncStore((s) => s.lastSync);
  const [, setLoggingOut] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const serverInfoQuery = useQuery({
    queryKey: ["server-info", serverUrl],
    queryFn: () => getServerInfo(serverUrl),
    enabled: !!serverUrl && !isLocalOnly,
    staleTime: 1000 * 60 * 60,
  });
  const serverVersion = serverInfoQuery.data?.version;
  // Mirror upstream's ServerContext: `v${version}` or "N/A" (v prefix + fallback live
  // in the value, not the label). Client version always has the v prefix.
  const clientVersionDisplay = `v${appVersion}`;
  const serverVersionDisplay =
    serverVersion && serverVersion !== "0.0.0" ? `v${serverVersion}` : "N/A";

  const mutedIcon = (Icon: typeof Server) => <Icon size={ICON_SIZE} color={muted} />;

  // `lastSyncedTimestamp` is an HLC timestamp (`<ISO>-<counter>-<node>`), not a plain
  // ISO string — parse it via Timestamp to get the millis before formatting.
  const persistedSync = lastSyncedTimestamp ? Timestamp.parse(lastSyncedTimestamp) : null;
  const lastSyncedText = lastSync
    ? lastSync.toLocaleString()
    : persistedSync
      ? new Date(persistedSync.millis()).toLocaleString()
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
      await useSessionStore.getState().signOut();
      await clearLocalData();
      await loadClock();
    } finally {
      clearSwitchingFlag();
      setLoggingOut(false);
    }
  }

  async function handleConnectToServer() {
    // signOut() first so hasToken flips false in the same commit that clears the budget
    // context — otherwise the (files) guard briefly routes to the file list.
    await useSessionStore.getState().signOut();
    await closeBudget();
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
      // signOut() first: it batches hasToken=false + budget-context reset into one commit
      // → routes straight to login. closeBudget() then closes the DB after (auth) unmounts.
      await useSessionStore.getState().signOut();
      await closeBudget();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        {/* Current Budget */}
        <View className="mb-6">
          <Typography className="ml-2 text-sm font-medium text-muted">
            {t("currentBudget")}
          </Typography>
          <Typography className="mb-2 ml-2 text-lg font-bold text-foreground">
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
            <ListGroup>
              <ValueRow icon={mutedIcon(LinkIcon)} label={t("url")} value={serverUrl} />
              <Separator className="mx-4" />
              <ActionRow
                icon={<Unplug size={ICON_SIZE} color={danger} />}
                title={t("disconnectFromServer")}
                titleClassName="text-danger"
                onPress={handleLogout}
              />
            </ListGroup>
          </View>
        )}

        {/* Subtle build/sync footer */}
        <View className="mt-2 items-center">
          <Typography className="text-xs text-muted">
            {t("clientVersion", { version: clientVersionDisplay })}
          </Typography>
          {!isLocalOnly ? (
            <Typography className="text-xs text-muted">
              {t("serverVersion", { version: serverVersionDisplay })}
            </Typography>
          ) : null}
          {!isLocalOnly ? (
            <Typography className="text-xs text-muted">
              {t("appLastSynced", { date: lastSyncedText })}
            </Typography>
          ) : null}
        </View>
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
