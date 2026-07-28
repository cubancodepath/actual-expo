import { createContext, use, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "heroui-native";
import {
  SURFACE_LEVELS,
  type SurfaceContext,
  type SurfaceLevelClasses,
} from "./surface-level.tokens";

export { SURFACE_LEVELS };
export type { SurfaceContext, SurfaceLevelClasses };

const SurfaceLevelContext = createContext<SurfaceContext>("screen");

/**
 * Declares the elevation context for a subtree. Set it ONCE, where the
 * presentation is decided — a sheet screen's root, the `_layout` of a stack
 * that is itself presented as a modal, or immediately inside a
 * `BottomSheet.Content` / `Dialog.Content` / `Popover.Content`.
 *
 * Never set it per-card: the point is that a card doesn't need to know where
 * it is being rendered.
 */
export function SurfaceLevel({
  context,
  children,
}: {
  context: SurfaceContext;
  children: ReactNode;
}) {
  return <SurfaceLevelContext value={context}>{children}</SurfaceLevelContext>;
}

/**
 * Elevation-aware class names and heroui variants for the current context.
 * Defaults to `"screen"` when no provider is above — so a regular screen, and
 * any component not yet migrated, keeps behaving exactly as it does today.
 */
export function useSurfaceLevel(): SurfaceLevelClasses {
  return SURFACE_LEVELS[use(SurfaceLevelContext)];
}

/**
 * A screen/sheet root: declares the elevation context AND paints its canvas.
 *
 * Use this for the root `<View className="flex-1 …">` of a screen presented as
 * a sheet, so the canvas class and the context it implies can't drift apart —
 * a root that says `bg-overlay` while its children still think they're on a
 * screen is the exact bug this module exists to prevent.
 */
export function SurfaceCanvas({
  context,
  className,
  children,
  ...rest
}: ViewProps & { context: SurfaceContext; children?: ReactNode }) {
  return (
    <SurfaceLevel context={context}>
      <View className={cn(SURFACE_LEVELS[context].canvas, className)} {...rest}>
        {children}
      </View>
    </SurfaceLevel>
  );
}
