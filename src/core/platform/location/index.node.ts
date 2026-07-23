// Node/test implementation of the location capability: permission denied,
// no position. Replaces the per-test `vi.mock("expo-location")` boilerplate —
// transaction-save tests just see "no location available", which is the
// behavior they want.
//
// Selected by the vitest resolve.alias for `@/core/platform/location`.
import type { PlatformLocation } from "./types";

export const location: PlatformLocation = {
  requestLocationPermission: async () => false,
  getLocationPermissionStatus: async () => "denied",
  getCurrentPosition: async () => null,
  clearLocationCache: () => {},
};

export const {
  requestLocationPermission,
  getLocationPermissionStatus,
  getCurrentPosition,
  clearLocationCache,
} = location;
