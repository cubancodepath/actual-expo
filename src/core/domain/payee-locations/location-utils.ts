/**
 * Pure utility functions for location calculations and formatting.
 * Ported from actual/packages/loot-core/src/shared/location-utils.ts
 */

import type { Coordinates } from "./types";

const METERS_PER_FOOT = 0.3048;
const FEET_PER_MILE = 5280;

/**
 * Calculate the distance between two geographic coordinates using the Haversine formula.
 * @returns Distance in meters
 */
export function calculateDistance(pos1: Coordinates, pos2: Coordinates): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (pos1.latitude * Math.PI) / 180;
  const phi2 = (pos2.latitude * Math.PI) / 180;
  const deltaPhi = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
  const deltaLambda = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Format a distance in meters to a human-readable string (imperial).
 * - Under 1000 ft → "X ft"
 * - 1000 ft and above → "X.X mi"
 */
export function formatDistance(meters: number): string {
  const feet = meters / METERS_PER_FOOT;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = feet / FEET_PER_MILE;
  return `${miles.toFixed(1)} mi`;
}
