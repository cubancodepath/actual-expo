import { useCallback, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Menu } from "heroui-native";
import { BudgetFileRow, type RowRect } from "@/ui/BudgetFileRow";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";
import { fileKey } from "@/screens/files/hooks/useBudgetFiles";
import { BudgetFileRowMenu } from "./BudgetFileRowMenu";
import type { FileAction } from "./fileActions";

interface MenuTarget {
  file: ReconciledBudgetFile;
  /** The row's window frame, measured at long-press. */
  rect: RowRect;
}

const noop = () => {};

interface RenderProps {
  /** Key of the row whose floating preview is up — that row hides itself. */
  liftedKey: string | null;
  /** Wire to each row's `onLongPress` to open the menu on it. */
  onLongPressRow: (file: ReconciledBudgetFile, rect: RowRect) => void;
}

interface BudgetFileRowMenuHostProps {
  className?: string;
  /** Runs the chosen action for the file (confirm dialog / download live in the screen). */
  onAction: (action: FileAction, file: ReconciledBudgetFile) => void;
  children: (props: RenderProps) => ReactNode;
}

/**
 * Root view + single long-press "lift" menu shared by both budget-file lists
 * (post-login + in-app switcher). One menu for the whole list, mounted only while
 * a row is long-pressed; a clone of the row is floated so it survives the live
 * row unmounting. Mirrors TransactionRowMenuHost.
 */
export function BudgetFileRowMenuHost({
  className,
  onAction,
  children,
}: BudgetFileRowMenuHostProps) {
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  // The host can live inside a modal card offset from the window origin. Row
  // frames are window-space, so the phantom Menu anchor subtracts that offset.
  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const measureRootOffset = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffset.current = { x, y };
    });
  }, []);

  const onLongPressRow = useCallback((file: ReconciledBudgetFile, rect: RowRect) => {
    setPreviewShown(false);
    setMenuTarget({ file, rect });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    setPreviewShown(false);
  }, []);

  const liftedKey = isPreviewShown && menuTarget ? fileKey(menuTarget.file) : null;

  const handleMenuAction = (action: FileAction) => {
    if (!menuTarget) return;
    const file = menuTarget.file;
    closeMenu();
    onAction(action, file);
  };

  return (
    <View ref={rootRef} onLayout={measureRootOffset} className={className}>
      {children({ liftedKey, onLongPressRow })}

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
          <BudgetFileRowMenu
            rect={menuTarget.rect}
            file={menuTarget.file}
            onAction={handleMenuAction}
            onPreviewLayout={() => setPreviewShown(true)}
            preview={<BudgetFileRow file={menuTarget.file} onPress={noop} showSeparator={false} />}
          />
        </Menu>
      )}
    </View>
  );
}
