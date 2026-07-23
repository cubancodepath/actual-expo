import type { ReactNode } from "react";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";
import { fileKey } from "@/screens/files/hooks/useBudgetFiles";
import { LiftMenu, type RowRect } from "@/ui/lift-menu";
import { BudgetFileRowMenu } from "./BudgetFileRowMenu";
import type { FileAction } from "./fileActions";

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
 * `LiftMenu.Host` specialization shared by both budget-file lists (post-login +
 * in-app switcher). Mirrors TransactionRowMenuHost.
 */
export function BudgetFileRowMenuHost({
  className,
  onAction,
  children,
}: BudgetFileRowMenuHostProps) {
  return (
    <LiftMenu.Host<ReconciledBudgetFile>
      getId={fileKey}
      className={className}
      renderMenu={(file) => (
        <BudgetFileRowMenu
          file={file}
          onAction={(action) => onAction(action, file)}
          preview={<BudgetFileRow file={file} onPress={noop} showSeparator={false} />}
        />
      )}
    >
      {({ liftedId, onLongPressRow }) => children({ liftedKey: liftedId, onLongPressRow })}
    </LiftMenu.Host>
  );
}
