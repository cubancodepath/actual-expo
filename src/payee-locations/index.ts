import { randomUUID } from "expo-crypto";
import { runQuery, first } from "../db";
import { sendMessages } from "../sync";
import { Timestamp } from "../crdt";
import type { PayeeLocationRow } from "../db/types";
import type { PayeeLocation, NearbyPayee, Coordinates } from "./types";

const DEFAULT_MAX_DISTANCE_METERS = 500;

function rowToPayeeLocation(r: PayeeLocationRow): PayeeLocation {
  return {
    id: r.id,
    payee_id: r.payee_id,
    latitude: r.latitude,
    longitude: r.longitude,
    created_at: r.created_at,
    tombstone: r.tombstone === 1,
  };
}

export async function getLocationsForPayee(payeeId: string): Promise<PayeeLocation[]> {
  const rows = await runQuery<PayeeLocationRow>(
    `SELECT * FROM payee_locations
     WHERE payee_id = ? AND tombstone = 0
     ORDER BY created_at DESC`,
    [payeeId],
  );
  return rows.map(rowToPayeeLocation);
}

export async function createPayeeLocation(payeeId: string, coords: Coordinates): Promise<string> {
  if (coords.latitude < -90 || coords.latitude > 90) {
    throw new Error(`Invalid latitude: ${coords.latitude}`);
  }
  if (coords.longitude < -180 || coords.longitude > 180) {
    throw new Error(`Invalid longitude: ${coords.longitude}`);
  }

  const id = randomUUID();
  const now = Date.now();

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_locations",
      row: id,
      column: "payee_id",
      value: payeeId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_locations",
      row: id,
      column: "latitude",
      value: coords.latitude,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_locations",
      row: id,
      column: "longitude",
      value: coords.longitude,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_locations",
      row: id,
      column: "created_at",
      value: now,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_locations",
      row: id,
      column: "tombstone",
      value: 0,
    },
  ]);

  return id;
}

export async function deletePayeeLocation(id: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_locations",
      row: id,
      column: "tombstone",
      value: 1,
    },
  ]);
}

/**
 * Find nearby payees within a radius using the Haversine formula.
 * Uses a bounding-box pre-filter for performance, then precise distance calculation.
 * Returns one result per payee (closest location), sorted by distance.
 */
export async function getNearbyPayees(
  coords: Coordinates,
  radiusMeters: number = DEFAULT_MAX_DISTANCE_METERS,
): Promise<NearbyPayee[]> {
  // Bounding box pre-filter: ~111,320 meters per degree of latitude
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((coords.latitude * Math.PI) / 180));

  const minLat = coords.latitude - latDelta;
  const maxLat = coords.latitude + latDelta;
  const minLng = coords.longitude - lngDelta;
  const maxLng = coords.longitude + lngDelta;

  type NearbyRow = {
    location_id: string;
    payee_id: string;
    payee_name: string;
    latitude: number;
    longitude: number;
  };

  // Pre-filter with bounding box, then we calculate precise distance in JS
  const rows = await runQuery<NearbyRow>(
    `SELECT pl.id AS location_id, pl.payee_id, p.name AS payee_name,
            pl.latitude, pl.longitude
     FROM payee_locations pl
     JOIN payees p ON p.id = pl.payee_id AND p.tombstone = 0
     WHERE pl.tombstone = 0
       AND pl.latitude BETWEEN ? AND ?
       AND pl.longitude BETWEEN ? AND ?
       AND p.transfer_acct IS NULL`,
    [minLat, maxLat, minLng, maxLng],
  );

  // Calculate precise distance and filter by radius
  const { calculateDistance } = await import("./location-utils");

  const withDistance = rows
    .map((r) => ({
      ...r,
      distance: calculateDistance(coords, { latitude: r.latitude, longitude: r.longitude }),
    }))
    .filter((r) => r.distance <= radiusMeters);

  // Keep only the closest location per payee
  const byPayee = new Map<string, (typeof withDistance)[0]>();
  for (const r of withDistance) {
    const existing = byPayee.get(r.payee_id);
    if (!existing || r.distance < existing.distance) {
      byPayee.set(r.payee_id, r);
    }
  }

  return [...byPayee.values()]
    .sort((a, b) => a.distance - b.distance)
    .map((r) => ({
      payee_id: r.payee_id,
      payee_name: r.payee_name,
      distance: r.distance,
      location_id: r.location_id,
    }));
}
