import { useEffect } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button, Dialog } from "heroui-native";
import { dismissDialog, settleDialog, useDialogStore } from "./dialogStore";
import type { DialogRequest } from "./types";
import { SurfaceLevel } from "@/ui/surface-level";

type CommonT = TFunction<"common">;
type ContentProps = React.ComponentProps<typeof Dialog.Content>;

/**
 * The single heroui `Dialog` composition for the whole app. Mounted once at the
 * root; renders whatever the imperative `dialog` service (dialogStore) has
 * queued. Screens never mount their own Portal/Overlay/Content.
 */
export function DialogHost() {
  const { t } = useTranslation("common");
  const current = useDialogStore((s) => s.current);
  const isOpen = useDialogStore((s) => s.isOpen);

  const isLocked = current?.kind === "custom" && current.opts.dismissable === false;

  // Own the Android back button while open so it routes through the same settle
  // path as the overlay (and blocks dismissal for locked custom dialogs).
  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isLocked) return true;
      dismissDialog();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, isLocked]);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLocked) dismissDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay isCloseOnPress={!isLocked} />
        {current ? renderContent(current, t) : null}
      </Dialog.Portal>
    </Dialog>
  );
}

function renderContent(current: DialogRequest, t: CommonT) {
  if (current.kind === "custom") {
    const { opts } = current;
    const content = (
      <Dialog.Content {...(opts.contentProps as ContentProps)}>
        <SurfaceLevel context="sheet">
          {opts.render({ close: (value) => settleDialog(value) })}
        </SurfaceLevel>
      </Dialog.Content>
    );
    if (opts.keyboardAvoiding) {
      return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {content}
        </KeyboardAvoidingView>
      );
    }
    return content;
  }

  return (
    <Dialog.Content>
      <SurfaceLevel context="sheet">{renderBuiltIn(current, t)}</SurfaceLevel>
    </Dialog.Content>
  );
}

function renderBuiltIn(current: DialogRequest, t: CommonT) {
  switch (current.kind) {
    case "alert": {
      const { opts } = current;
      return (
        <>
          <Header title={opts.title} message={opts.message} />
          <Button onPress={() => settleDialog(undefined)}>
            <Button.Label>{opts.okLabel ?? t("ok")}</Button.Label>
          </Button>
        </>
      );
    }
    case "confirm": {
      const { opts } = current;
      return (
        <>
          <Header title={opts.title} message={opts.message} />
          <View className="gap-2">
            <Button
              variant={opts.destructive ? "danger" : "primary"}
              onPress={() => settleDialog(true)}
            >
              <Button.Label>{opts.confirmLabel ?? t("confirm")}</Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => settleDialog(false)}>
              <Button.Label>{opts.cancelLabel ?? t("cancel")}</Button.Label>
            </Button>
          </View>
        </>
      );
    }
    case "choose": {
      const { opts } = current;
      return (
        <>
          <Header title={opts.title} message={opts.message} />
          <View className="gap-2">
            {opts.actions.map((action) => (
              <Button
                key={action.key}
                variant={action.destructive ? "danger" : "primary"}
                onPress={() => settleDialog(action.key)}
              >
                <Button.Label>{action.label}</Button.Label>
              </Button>
            ))}
            <Button variant="ghost" onPress={() => settleDialog(null)}>
              <Button.Label>{opts.cancelLabel ?? t("cancel")}</Button.Label>
            </Button>
          </View>
        </>
      );
    }
    default:
      return null;
  }
}

function Header({ title, message }: { title: string; message?: string }) {
  return (
    <View className="mb-5 gap-1.5">
      <Dialog.Title>{title}</Dialog.Title>
      {message ? <Dialog.Description>{message}</Dialog.Description> : null}
    </View>
  );
}
