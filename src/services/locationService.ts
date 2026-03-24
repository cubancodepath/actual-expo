import * as Location from "expo-location";
import type { Coordinates } from "@core/payee-locations/types";

const CACHE_TTL = 60_000; // 1 minute

let cachedPosition: { coords: Coordinates; timestamp: number } | null = null;

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function getLocationPermissionStatus(): Promise<
  "granted" | "denied" | "undetermined"
> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function getCurrentPosition(): Promise<Coordinates | null> {
  // Check cache first
  if (cachedPosition && Date.now() - cachedPosition.timestamp < CACHE_TTL) {
    return cachedPosition.coords;
  }

  const status = await getLocationPermissionStatus();
  if (status !== "granted") return null;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coords: Coordinates = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
    cachedPosition = { coords, timestamp: Date.now() };
    return coords;
  } catch {
    return null;
  }
}

export function clearLocationCache(): void {
  cachedPosition = null;
}
