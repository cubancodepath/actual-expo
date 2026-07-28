import { CloseAccountScreen } from "@/screens/accounts/CloseAccountScreen";
import { SurfaceLevel } from "@/ui/surface-level";

/** Presented as a formSheet — the account screen stays visible behind it. */
export default function CloseAccountRoute() {
  return (
    <SurfaceLevel context="sheet">
      <CloseAccountScreen />
    </SurfaceLevel>
  );
}
