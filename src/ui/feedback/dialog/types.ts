import type { ReactNode } from "react";

/** Passthrough props forwarded to heroui `Dialog.Content` for custom dialogs. */
export type DialogContentPassthrough = {
  isSwipeable?: boolean;
  className?: string;
  forceMount?: boolean;
  animation?: unknown;
};

export type AlertOptions = {
  title: string;
  message?: string;
  /** Defaults to the translated `common:ok`. */
  okLabel?: string;
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Defaults to `common:confirm`. */
  confirmLabel?: string;
  /** Defaults to `common:cancel`. */
  cancelLabel?: string;
  /** Renders the confirm button with the danger variant. */
  destructive?: boolean;
};

export type ChooseAction<K extends string = string> = {
  key: K;
  label: string;
  destructive?: boolean;
};

export type ChooseOptions<K extends string = string> = {
  title: string;
  message?: string;
  actions: ChooseAction<K>[];
  /** Defaults to `common:cancel`. */
  cancelLabel?: string;
};

export type CustomOptions<T = void> = {
  /**
   * Render the dialog body. Call `close(value)` to resolve the promise and
   * dismiss. Use heroui parts (`Dialog.Title`, `Dialog.Description`,
   * `Dialog.Close`) directly — they work inside the host's `Dialog` context.
   *
   * The render runs outside the calling screen's tree, so it captures values by
   * closure at call time. For reactive content, pass a self-contained component
   * with its own state/hooks rather than JSX that reads screen variables.
   */
  render: (ctx: { close: (value?: T) => void }) => ReactNode;
  /** Whether overlay press / Android back dismiss the dialog. Default `true`. */
  dismissable?: boolean;
  /** Wrap the body in a `KeyboardAvoidingView` (iOS) for forms. */
  keyboardAvoiding?: boolean;
  /** Props forwarded to heroui `Dialog.Content`. */
  contentProps?: DialogContentPassthrough;
};

export type DialogRequest =
  | { id: number; kind: "alert"; opts: AlertOptions; resolve: (value: void) => void }
  | { id: number; kind: "confirm"; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: "choose"; opts: ChooseOptions; resolve: (value: string | null) => void }
  | { id: number; kind: "custom"; opts: CustomOptions<unknown>; resolve: (value: unknown) => void };
