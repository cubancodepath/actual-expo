// Native implementation of the location capability, backed by expo-location.
// The only module in src/core allowed to import the native location
// dependency. Positions are cached for 60s (capability logic — transaction
// saves and nearby-payee lookups within a minute reuse the fix). In vitest
// the whole module is swapped for `./index.node.ts` via resolve.alias.
import * as Location from "expo-location";

import type { Coordinates } from "@/core/types/models";
import type { PlatformLocation } from "./types";

const CACHE_TTL = 60_000; // 1 minute

let cachedPosition: { coords: Coordinates; timestamp: number } | null = null;

export const location: PlatformLocation = {
  requestLocationPermission: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  },

  getLocationPermissionStatus: async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  },

  getCurrentPosition: async () => {
    // Check cache first
    if (cachedPosition && Date.now() - cachedPosition.timestamp < CACHE_TTL) {
      return cachedPosition.coords;
    }

    const status = await location.getLocationPermissionStatus();
    if (status !== "granted") return null;

    try {
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords: Coordinates = {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      };
      cachedPosition = { coords, timestamp: Date.now() };
      return coords;
    } catch {
      return null;
    }
  },

  clearLocationCache: () => {
    cachedPosition = null;
  },
};

export const {
  requestLocationPermission,
  getLocationPermissionStatus,
  getCurrentPosition,
  clearLocationCache,
} = location;
