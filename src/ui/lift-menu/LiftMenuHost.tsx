import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Menu } from "heroui-native";
import { LiftMenuContext } from "./context";
import type { RowRect } from "./types";

export interface LiftMenuHostRenderProps<T> {
  /** Item whose floating preview is up — that row hides itself. Null until the clone lays out. */
  liftedId: string | null;
  /** Wire to each row's long-press to open the menu on it. */
  onLongPressRow: (item: T, rect: RowRect) => void;
}

export interface LiftMenuHostProps<T> {
  /** Stable key for an item; matched against `liftedId` by the rows. */
  getId: (item: T) => string;
  /** Fired when a long-press opens the menu — e.g. to cancel an in-progress edit. */
  onOpen?: (item: T) => void;
  /** The menu for the lifted item: a `LiftMenu.Content` with `Menu.Item` JSX. */
  renderMenu: (item: T) => ReactNode;
  className?: string;
  children: (props: LiftMenuHostRenderProps<T>) => ReactNode;
}

/**
 * Root view + single long-press "lift" menu for a list of rows. One menu for
 * the whole list, mounted only while a row is long-pressed: `isDefaultOpen`
 * makes the phantom `<Menu>` measure its trigger and open on mount, so the
 * popover anchors to the pressed row's frame without every row owning a Menu.
 * The whole item is stored so the floating preview renders even after the live
 * row is recycled off-screen by a virtualizer.
 *
 * The host can live inside a modal card, whose root is offset from the window
 * origin. Row frames are measured in window coordinates, so anchoring the
 * phantom Menu inside the root subtracts that offset; the portal (overlay +
 * preview) stays in window space.
 */
export function LiftMenuHost<T>({
  getId,
  onOpen,
  renderMenu,
  className,
  children,
}: LiftMenuHostProps<T>) {
  const [target, setTarget] = useState<{ item: T; rect: RowRect } | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const measureRootOffset = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffset.current = { x, y };
    });
  }, []);

  // Refs keep `onLongPressRow` stable so memoised rows don't re-render when
  // the screen re-creates its callbacks.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const onLongPressRow = useCallback((item: T, rect: RowRect) => {
    onOpenRef.current?.(item);
    setPreviewShown(false);
    setTarget({ item, rect });
  }, []);

  const closeMenu = useCallback(() => {
    setTarget(null);
    setPreviewShown(false);
  }, []);

  const liftedId = isPreviewShown && target ? getId(target.item) : null;

  const contextValue = useMemo(
    () =>
      target
        ? {
            item: target.item as unknown,
            rect: target.rect,
            onPreviewLayout: () => setPreviewShown(true),
          }
        : null,
    [target],
  );

  return (
    <View ref={rootRef} onLayout={measureRootOffset} className={className}>
      {children({ liftedId, onLongPressRow })}

      {target && contextValue ? (
        <Menu
          isDefaultOpen
          onOpenChange={(open) => {
            if (!open) closeMenu();
          }}
          pointerEvents="none" // purely a measuring anchor; never takes touches
          style={{
            position: "absolute",
            left: target.rect.x - rootOffset.current.x,
            top: target.rect.y - rootOffset.current.y,
            width: target.rect.width,
            height: target.rect.height,
          }}
        >
          <Menu.Trigger pointerEvents="none" style={StyleSheet.absoluteFill} />
          <LiftMenuContext value={contextValue}>{renderMenu(target.item)}</LiftMenuContext>
        </Menu>
      ) : null}
    </View>
  );
}
