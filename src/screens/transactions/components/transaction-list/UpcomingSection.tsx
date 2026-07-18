import { Fragment, useCallback, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Accordion, Menu, Typography } from "heroui-native";
import { deleteSchedule, postTransactionForSchedule, skipNextDate } from "@/core/domain/schedules";
import type { PreviewTransaction } from "@/core/domain/schedules";
import { useUndoStore } from "@/stores/undoStore";
import { CollapsibleIndicator } from "@/ui/CollapsibleIndicator";
import { DateHeader } from "./DateHeader";
import { PreviewRow } from "./PreviewRow";
import { PreviewRowMenu, type PreviewMenuAction } from "./PreviewRowMenu";
import type { RowRect } from "./TransactionRowMenu";

interface UpcomingSectionProps {
  previews: PreviewTransaction[];
}

type MenuTarget = { preview: PreviewTransaction; rect: RowRect };

/**
 * Collapsible "Schedules" section shown at the top of a transactions list,
 * holding the upcoming schedule previews (grouped by date, same look as the
 * real ledger). Closed by default; rendered as the list's ListHeaderComponent
 * so it scrolls with the transactions. Long-pressing a preview lifts it and
 * opens the schedule actions menu (post / skip / edit / delete).
 */
export function UpcomingSection({ previews }: UpcomingSectionProps) {
  const { t } = useTranslation(["transactions", "schedules", "common"]);
  const router = useRouter();

  // Controlled + initialised empty → collapsed on mount.
  const [expanded, setExpanded] = useState<string[]>([]);

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  // Row frames are measured in window coordinates; the anchor Menu lives inside
  // this root, so its offset from the window origin must be subtracted.
  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const measureRootOffset = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffset.current = { x, y };
    });
  }, []);

  const onLongPressRow = useCallback((preview: PreviewTransaction, rect: RowRect) => {
    setPreviewShown(false);
    setMenuTarget({ preview, rect });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    setPreviewShown(false);
  }, []);

  const liftedId = isPreviewShown ? (menuTarget?.preview.id ?? null) : null;

  const handleAction = (action: PreviewMenuAction) => {
    if (!menuTarget) return;
    const scheduleId = menuTarget.preview.scheduleId;
    closeMenu();
    switch (action) {
      case "post":
        Alert.alert(
          t("postTransactionNow", { ns: "schedules" }),
          t("postTransactionConfirm", { ns: "schedules" }),
          [
            { text: t("cancel", { ns: "common" }), style: "cancel" },
            {
              text: t("post", { ns: "schedules" }),
              onPress: async () => {
                await postTransactionForSchedule(scheduleId);
                useUndoStore.getState().showUndo(t("transactionPosted", { ns: "schedules" }));
              },
            },
          ],
        );
        break;
      case "skip":
        Alert.alert(
          t("skipNextDate", { ns: "schedules" }),
          t("skipNextDateConfirm", { ns: "schedules" }),
          [
            { text: t("cancel", { ns: "common" }), style: "cancel" },
            {
              text: t("skip", { ns: "schedules" }),
              onPress: async () => {
                await skipNextDate(scheduleId);
                useUndoStore.getState().showUndo(t("dateSkipped", { ns: "schedules" }));
              },
            },
          ],
        );
        break;
      case "view":
        router.push({ pathname: "/(auth)/schedule/[id]", params: { id: scheduleId } });
        break;
      case "delete":
        Alert.alert(
          t("deleteSchedule", { ns: "schedules" }),
          t("deleteCannotUndo", { ns: "schedules" }),
          [
            { text: t("cancel", { ns: "common" }), style: "cancel" },
            {
              text: t("delete", { ns: "common" }),
              style: "destructive",
              onPress: async () => {
                await deleteSchedule(scheduleId);
                useUndoStore.getState().showUndo(t("scheduleDeleted", { ns: "schedules" }));
              },
            },
          ],
        );
        break;
    }
  };

  return (
    <View ref={rootRef} onLayout={measureRootOffset}>
      <Accordion
        selectionMode="multiple"
        hideSeparator
        value={expanded}
        onValueChange={(v: string[]) => setExpanded(v)}
        className="mb-2"
      >
        <Accordion.Item value="upcoming">
          <Accordion.Trigger className="px-4 py-2">
            <View className="flex-1 flex-row items-center gap-2">
              <CollapsibleIndicator />
              <Typography className="text-sm font-semibold text-foreground">
                {t("schedules")}
              </Typography>
              <Typography className="text-sm text-muted">{previews.length}</Typography>
            </View>
          </Accordion.Trigger>

          <Accordion.Content className="px-0 pb-0">
            {previews.map((preview, i) => {
              // Previews come date-descending; start a new date block whenever the
              // date changes. Date headers sit on the page background and the rows
              // on bg-surface, exactly like the real ledger.
              const isNewDate = i === 0 || previews[i - 1].date !== preview.date;
              return (
                <Fragment key={preview.id}>
                  {isNewDate && <DateHeader date={preview.date} />}
                  <PreviewRow
                    preview={preview}
                    isFirst={isNewDate}
                    onLongPress={onLongPressRow}
                    isLifted={liftedId === preview.id}
                  />
                </Fragment>
              );
            })}
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>

      {menuTarget && (
        <Menu
          isDefaultOpen
          onOpenChange={(open) => {
            if (!open) closeMenu();
          }}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: menuTarget.rect.x - rootOffset.current.x,
            top: menuTarget.rect.y - rootOffset.current.y,
            width: menuTarget.rect.width,
            height: menuTarget.rect.height,
          }}
        >
          <Menu.Trigger pointerEvents="none" style={StyleSheet.absoluteFill} />
          <PreviewRowMenu
            rect={menuTarget.rect}
            onAction={handleAction}
            onPreviewLayout={() => setPreviewShown(true)}
            preview={<PreviewRow preview={menuTarget.preview} isFirst />}
          />
        </Menu>
      )}
    </View>
  );
}
