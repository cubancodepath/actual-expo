import { MoveTransactionScreen } from "@/screens/transactions/MoveTransactionScreen";
import { SurfaceLevel } from "@/ui/surface-level";

/** Presented as a card modal — the screen floats over the visible list. */
export default function TransactionMoveRoute() {
  return (
    <SurfaceLevel context="sheet">
      <MoveTransactionScreen />
    </SurfaceLevel>
  );
}
