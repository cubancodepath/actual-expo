import { randomUUID } from "@/core/platform/crypto";
import { runQuery, first } from "@/core/server/db";
import { sendMessages } from "@/core/server/sync";
import { undoable } from "@/core/server/undo";
import { Timestamp } from "@/core/crdt";
import type { PayeeRow, PayeeLocationRow } from "@/core/server/db/types";
import type { Payee, PayeeLocation, NearbyPayee, Coordinates } from "@/core/types/models";

function rowToPayee(r: PayeeRow): Payee {
  return {
    id: r.id,
    name: r.name,
    transfer_acct: r.transfer_acct,
    favorite: r.favorite === 1,
    tombstone: r.tombstone === 1,
  };
}

export async function getPayees(): Promise<Payee[]> {
  // Mirrors loot-core's getPayees(): join with accounts so transfer payees show
  // the account name. Transfer payees are listed first (transfer_acct IS NOT NULL).
  const rows = await runQuery<PayeeRow & { display_name: string }>(
    `SELECT p.id,
            COALESCE(a.name, p.name) AS display_name,
            p.transfer_acct,
            p.favorite,
            p.tombstone
     FROM payees p
     LEFT JOIN accounts a ON p.transfer_acct = a.id AND a.tombstone = 0
     WHERE p.tombstone = 0
       AND (p.transfer_acct IS NULL OR a.id IS NOT NULL)
     ORDER BY p.transfer_acct IS NULL, COALESCE(a.name, p.name) COLLATE NOCASE`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    transfer_acct: r.transfer_acct,
    favorite: r.favorite === 1,
    tombstone: r.tombstone === 1,
  }));
}

export const createPayee = undoable(async function createPayee(
  fields: Pick<Payee, "name"> & Partial<Pick<Payee, "transfer_acct" | "favorite">>,
): Promise<string> {
  const id = randomUUID();
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    transfer_acct: fields.transfer_acct ?? null,
    favorite: fields.favorite ? 1 : 0,
  };
  await sendMessages([
    ...Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column,
      value: value as string | number | null,
    })),
    // loot-core inserts a self-referencing mapping on every payee creation
    // so that payee_mapping can later be updated when payees are merged
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: id,
    },
  ]);
  return id;
});

export const updatePayee = undoable(async function updatePayee(
  id: string,
  fields: Partial<Pick<Payee, "name" | "favorite">>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.favorite !== undefined) dbFields.favorite = fields.favorite ? 1 : 0;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column,
      value: value as string | number | null,
    })),
  );
});

export const deletePayee = undoable(async function deletePayee(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "tombstone", value: 1 },
  ]);
});

/**
 * Merge one or more payees into a target payee via payee_mapping redirects.
 * Transfer payees are excluded. Merged payees are tombstoned.
 */
export const mergePayees = undoable(async function mergePayees(
  targetId: string,
  ids: string[],
): Promise<void> {
  // Validate target is not a transfer payee
  const target = await first<PayeeRow>("SELECT * FROM payees WHERE id = ? AND tombstone = 0", [
    targetId,
  ]);
  if (!target || target.transfer_acct != null) return;

  // Filter out transfer payees and the target itself
  const candidates = await runQuery<PayeeRow>(
    `SELECT * FROM payees WHERE id IN (${ids.map(() => "?").join(",")}) AND tombstone = 0`,
    ids,
  );
  const mergeIds = candidates
    .filter((p) => p.transfer_acct == null && p.id !== targetId)
    .map((p) => p.id);
  if (mergeIds.length === 0) return;

  const messages: Parameters<typeof sendMessages>[0] = [];

  for (const id of mergeIds) {
    // Find all mappings currently pointing to this payee and redirect to target
    const mappings = await runQuery<{ id: string }>(
      "SELECT id FROM payee_mapping WHERE targetId = ?",
      [id],
    );
    for (const m of mappings) {
      messages.push({
        timestamp: Timestamp.send()!,
        dataset: "payee_mapping",
        row: m.id,
        column: "targetId",
        value: targetId,
      });
    }
    // Update the payee's own mapping to point to target
    messages.push({
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: targetId,
    });
    // Tombstone the merged payee
    messages.push({
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column: "tombstone",
      value: 1,
    });
  }

  await sendMessages(messages);
});

/** Find an existing payee by name (case-insensitive). Returns the ID or null. */
export async function findPayeeByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = await first<{ id: string }>(
    `SELECT id FROM payees WHERE LOWER(name) = LOWER(?) AND tombstone = 0 LIMIT 1`,
    [trimmed],
  );
  return row?.id ?? null;
}

/** Find an existing payee by name (case-insensitive) or create a new one. */
export async function findOrCreatePayee(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = await first<{ id: string }>(
    `SELECT id FROM payees WHERE LOWER(name) = LOWER(?) AND tombstone = 0 LIMIT 1`,
    [trimmed],
  );
  if (existing) return existing.id;

  const id = randomUUID();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "name", value: trimmed },
    {
      timestamp: Timestamp.send()!,
      dataset: "payees",
      row: id,
      column: "transfer_acct",
      value: null,
    },
    { timestamp: Timestamp.send()!, dataset: "payees", row: id, column: "favorite", value: 0 },
    // Self-referencing mapping — same as loot-core's insertPayee()
    {
      timestamp: Timestamp.send()!,
      dataset: "payee_mapping",
      row: id,
      column: "targetId",
      value: id,
    },
  ]);
  return id;
}

// ---------------------------------------------------------------------------
// Payee locations (mobile feature; upstream now hosts these in payees/app.ts)
// ---------------------------------------------------------------------------

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
  const { calculateDistance } = await import("@/core/shared/location-utils");

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
