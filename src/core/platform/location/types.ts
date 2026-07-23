// Platform capability contract: geolocation. Mobile-specific seam (no
// upstream loot-core equivalent) used by payee-location suggestions. Each
// target ships an object conforming to this interface (index.ts = native
// expo-location, index.node.ts = permission-denied Node/test implementation).
import type { Coordinates } from "@/core/types/models";

export type LocationPermissionStatus = "granted" | "denied" | "undetermined";

export interface PlatformLocation {
  requestLocationPermission(): Promise<boolean>;
  getLocationPermissionStatus(): Promise<LocationPermissionStatus>;
  getCurrentPosition(): Promise<Coordinates | null>;
  clearLocationCache(): void;
}
