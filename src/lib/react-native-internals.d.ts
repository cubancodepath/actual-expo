/**
 * Types for the React Native internals we reach into.
 *
 * RN ships these as untyped Flow source, so a deep import lands as `any`
 * under `noImplicitAny`. Declaring the slice we use keeps the call sites
 * type-safe and documents exactly what we depend on.
 */
declare module "react-native/Libraries/Lists/VirtualizedListContext" {
  import type { ComponentType, ReactNode } from "react";

  /**
   * Clears the surrounding VirtualizedList context for its subtree, so lists
   * rendered through a portal (a sheet, a modal) aren't mistaken for lists
   * nested inside the scroll view that declared them.
   */
  export const VirtualizedListContextResetter: ComponentType<{ children: ReactNode }>;
}
