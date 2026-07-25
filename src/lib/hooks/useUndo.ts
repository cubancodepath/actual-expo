import { useToast } from "heroui-native";
import { useTranslation } from "react-i18next";
import { useUndoStore } from "@/stores/undoStore";

/**
 * Undo/redo surface for the UI, mirroring upstream desktop-client's `useUndo`
 * (`{ undo, redo, showUndoNotification, showRedoNotification }`). The engine
 * lives in `@/core/server/undo` and the reactive state in `undoStore`; this
 * hook renders the notification via HeroUI Native's `Toast` and wires its
 * action button back to undo/redo.
 *
 * `showUndoNotification(message)` is the call sites' replacement for the old
 * `undoStore.showUndo(message)`.
 */
export function useUndo() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);

  const showUndoNotification = (message: string) => {
    // Keep the shake-to-undo label in sync (shake reads store.lastAction).
    useUndoStore.getState().recordAction(message);
    toast.show({
      placement: "bottom",
      label: message,
      actionLabel: t("undo"),
      onActionPress: ({ hide }) => {
        hide();
        undo();
      },
    });
  };

  const showRedoNotification = (message: string) => {
    toast.show({
      placement: "bottom",
      label: message,
      actionLabel: t("redo"),
      onActionPress: ({ hide }) => {
        hide();
        redo();
      },
    });
  };

  return { undo, redo, showUndoNotification, showRedoNotification };
}
