import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import type { InventoryEvent } from "@/core/events/inventoryEvents";
import { isCountLineRecordedEvent } from "@/core/events/inventoryEvents";
import {
  buildProjectedBatchRecords,
  buildProjectedCountLineRecord,
  buildProjectedItemSnapshot,
  type ProjectedItemSnapshot,
} from "@/core/reducers/inventoryProjectionReducer";
import { getDb } from "@/db/localDb";
import type * as SQLite from "expo-sqlite";

type InventoryEventRow = {
  event_id: string;
  event_type: string;
  aggregate_id: string;
  session_id: string;
  payload_json: string;
  metadata_json: string;
  event_ts: number;
  sync_status: string;
  created_at: string;
  synced_at?: string | null;
  last_error?: string | null;
};

type ProjectedScanStatusRow = {
  total_qty: number;
};

type ProjectedCountLineRow = {
  event_id: string;
  server_line_id?: string | null;
  session_id: string;
  item_code: string;
  item_name: string;
  counted_qty: number;
  damaged_qty: number;
  floor_no?: string | null;
  rack_no?: string | null;
  counted_by: string;
  counted_at: string;
  sync_status: string;
  payload_json: string;
};

const nowIso = () => new Date().toISOString();

const parseInventoryEvent = (row: InventoryEventRow): InventoryEvent => ({
  id: row.event_id,
  type: row.event_type as InventoryEvent["type"],
  aggregateId: row.aggregate_id,
  payload: JSON.parse(row.payload_json),
  meta: JSON.parse(row.metadata_json),
  ts: row.event_ts,
});

const extractSerials = (event: InventoryEvent): string[] => {
  if (!isCountLineRecordedEvent(event)) {
    return [];
  }

  const serialNumbers = Array.isArray(event.payload.serial_numbers)
    ? event.payload.serial_numbers
    : [];
  const serialEntries = Array.isArray(event.payload.serial_entries)
    ? event.payload.serial_entries
        .map((entry) => entry.serial_number)
        .filter((serial): serial is string => typeof serial === "string")
    : [];

  return [...serialNumbers, ...serialEntries]
    .map((serial) => serial.trim().toUpperCase())
    .filter(Boolean);
};

const upsertItemSnapshot = async (
  db: SQLite.SQLiteDatabase,
  event: InventoryEvent
): Promise<void> => {
  if (!isCountLineRecordedEvent(event)) {
    return;
  }

  const previous = await db.getFirstAsync<ProjectedItemSnapshot>(
    `SELECT
        session_id as sessionId,
        item_code as itemCode,
        item_name as itemName,
        total_qty as totalQty,
        total_damage_qty as totalDamageQty,
        line_count as lineCount,
        updated_at as updatedAt,
        projection_version as projectionVersion
      FROM items_snapshot
      WHERE session_id = ? AND item_code = ?`,
    [event.payload.session_id, event.payload.item_code]
  );
  const nextSnapshot = buildProjectedItemSnapshot(event, previous);

  await db.runAsync(
    `INSERT OR REPLACE INTO items_snapshot (
        session_id,
        item_code,
        item_name,
        total_qty,
        total_damage_qty,
        line_count,
        updated_at,
        projection_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nextSnapshot.sessionId,
      nextSnapshot.itemCode,
      nextSnapshot.itemName,
      nextSnapshot.totalQty,
      nextSnapshot.totalDamageQty,
      nextSnapshot.lineCount,
      nextSnapshot.updatedAt,
      nextSnapshot.projectionVersion,
    ]
  );
};

const upsertBatchRecords = async (
  db: SQLite.SQLiteDatabase,
  event: InventoryEvent
): Promise<void> => {
  if (!isCountLineRecordedEvent(event)) {
    return;
  }

  const batchRecords = buildProjectedBatchRecords(event);
  if (batchRecords.length === 0) {
    return;
  }

  for (const record of batchRecords) {
    const previous = await db.getFirstAsync<{
      qty: number;
      mrp?: number | null;
    }>(
      `SELECT qty, mrp
       FROM batch_records
       WHERE session_id = ? AND item_code = ? AND batch_id = ?`,
      [record.sessionId, record.itemCode, record.batchId]
    );

    await db.runAsync(
      `INSERT OR REPLACE INTO batch_records (
          session_id,
          item_code,
          batch_id,
          qty,
          mrp,
          updated_at,
          projection_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.sessionId,
        record.itemCode,
        record.batchId,
        (previous?.qty ?? 0) + record.qty,
        record.mrp ?? previous?.mrp ?? null,
        record.updatedAt,
        record.projectionVersion,
      ]
    );
  }
};

const upsertSerialRegistry = async (
  db: SQLite.SQLiteDatabase,
  event: InventoryEvent
): Promise<void> => {
  if (!isCountLineRecordedEvent(event)) {
    return;
  }

  const serials = extractSerials(event);
  if (serials.length === 0) {
    return;
  }

  for (const serial of serials) {
    await db.runAsync(
      `INSERT INTO serial_registry (
          session_id,
          item_code,
          serial_no,
          event_id,
          created_at,
          projection_version
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        event.payload.session_id,
        event.payload.item_code,
        serial,
        event.id,
        event.payload.counted_at,
        CONTROL_PLANE_PROJECTION_VERSION,
      ]
    );
  }
};

const upsertCountLineRecord = async (
  db: SQLite.SQLiteDatabase,
  event: InventoryEvent
): Promise<void> => {
  if (!isCountLineRecordedEvent(event)) {
    return;
  }

  const projectedRecord = buildProjectedCountLineRecord(event);
  await db.runAsync(
    `INSERT OR REPLACE INTO count_line_records (
        event_id,
        server_line_id,
        session_id,
        item_code,
        item_name,
        counted_qty,
        damaged_qty,
        floor_no,
        rack_no,
        counted_by,
        counted_at,
        sync_status,
        payload_json,
        projection_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectedRecord.eventId,
      projectedRecord.serverLineId,
      projectedRecord.sessionId,
      projectedRecord.itemCode,
      projectedRecord.itemName,
      projectedRecord.countedQty,
      projectedRecord.damagedQty,
      projectedRecord.floorNo,
      projectedRecord.rackNo,
      projectedRecord.countedBy,
      projectedRecord.countedAt,
      projectedRecord.syncStatus,
      projectedRecord.payloadJson,
      projectedRecord.projectionVersion,
    ]
  );
};

const markEventApplied = async (db: SQLite.SQLiteDatabase, eventId: string): Promise<boolean> => {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO event_applied (
        event_id,
        projection_version,
        applied_at
      ) VALUES (?, ?, ?)`,
    [eventId, CONTROL_PLANE_PROJECTION_VERSION, nowIso()]
  );
  return (result.changes ?? 0) > 0;
};

const applyInventoryEvent = async (
  db: SQLite.SQLiteDatabase,
  event: InventoryEvent
): Promise<boolean> => {
  const wasApplied = await markEventApplied(db, event.id);
  if (!wasApplied) {
    return false;
  }

  await upsertCountLineRecord(db, event);
  await upsertItemSnapshot(db, event);
  await upsertBatchRecords(db, event);
  await upsertSerialRegistry(db, event);
  return true;
};

export const recordInventoryEvent = async (event: InventoryEvent): Promise<boolean> => {
  const db = await getDb();
  const createdAt = nowIso();
  let inserted = false;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO inventory_events (
          event_id,
          event_type,
          aggregate_id,
          session_id,
          payload_json,
          metadata_json,
          event_ts,
          sync_status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.type,
        event.aggregateId,
        event.meta.sessionId,
        JSON.stringify(event.payload),
        JSON.stringify(event.meta),
        event.ts,
        event.payload.sync_status,
        createdAt,
      ]
    );

    if (result.changes === 0) {
      inserted = false;
      return;
    }

    inserted = true;
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_queue (
          event_id,
          event_type,
          sync_status,
          retry_count,
          created_at
        ) VALUES (?, ?, ?, 0, ?)`,
      [event.id, event.type, event.payload.sync_status, createdAt]
    );

    await applyInventoryEvent(db, event);
  });

  return inserted;
};

export const markInventoryEventSynced = async (eventId: string): Promise<void> => {
  const db = await getDb();
  const syncedAt = nowIso();
  await db.runAsync(
    `UPDATE inventory_events
     SET sync_status = 'synced',
         synced_at = ?,
         last_error = NULL
     WHERE event_id = ?`,
    [syncedAt, eventId]
  );
  await db.runAsync(
    `UPDATE sync_queue
     SET sync_status = 'synced',
         last_error = NULL,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [syncedAt, eventId]
  );
  await db.runAsync(
    `UPDATE count_line_records
     SET sync_status = 'synced'
     WHERE event_id = ?`,
    [eventId]
  );
};

export const bindInventoryServerLineId = async (
  eventId: string,
  serverLineId: string | null
): Promise<void> => {
  if (!serverLineId) {
    return;
  }

  const db = await getDb();
  await db.runAsync(
    `UPDATE count_line_records
     SET server_line_id = ?
     WHERE event_id = ?`,
    [serverLineId, eventId]
  );
};

export const markInventoryEventRetry = async (
  eventId: string,
  errorMessage: string
): Promise<void> => {
  const db = await getDb();
  const attemptedAt = nowIso();
  await db.runAsync(
    `UPDATE inventory_events
     SET sync_status = 'pending_retry',
         last_error = ?
     WHERE event_id = ?`,
    [errorMessage, eventId]
  );
  await db.runAsync(
    `UPDATE sync_queue
     SET sync_status = 'pending_retry',
         retry_count = retry_count + 1,
         last_error = ?,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [errorMessage, attemptedAt, eventId]
  );
  await db.runAsync(
    `UPDATE count_line_records
     SET sync_status = 'pending_retry'
     WHERE event_id = ?`,
    [eventId]
  );
};

export const markInventoryEventFailed = async (
  eventId: string,
  errorMessage: string
): Promise<void> => {
  const db = await getDb();
  const attemptedAt = nowIso();
  await db.runAsync(
    `UPDATE inventory_events
     SET sync_status = 'failed',
         last_error = ?
     WHERE event_id = ?`,
    [errorMessage, eventId]
  );
  await db.runAsync(
    `UPDATE sync_queue
     SET sync_status = 'failed',
         retry_count = retry_count + 1,
         last_error = ?,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [errorMessage, attemptedAt, eventId]
  );
};

export const getPendingInventoryEvents = async (limit: number = 50): Promise<InventoryEvent[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<InventoryEventRow>(
    `SELECT
        event_id,
        event_type,
        aggregate_id,
        session_id,
        payload_json,
        metadata_json,
        event_ts,
        sync_status,
        created_at,
        synced_at,
        last_error
      FROM inventory_events
      WHERE sync_status IN ('pending', 'pending_retry')
      ORDER BY event_ts ASC
      LIMIT ?`,
    [limit]
  );
  return rows.map(parseInventoryEvent);
};

export const rebuildInventoryProjections = async (): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM event_applied");
    await db.runAsync("DELETE FROM items_snapshot");
    await db.runAsync("DELETE FROM batch_records");
    await db.runAsync("DELETE FROM serial_registry");
    await db.runAsync("DELETE FROM count_line_records");

    const rows = await db.getAllAsync<InventoryEventRow>(
      `SELECT
          event_id,
          event_type,
          aggregate_id,
          session_id,
          payload_json,
          metadata_json,
          event_ts,
          sync_status,
          created_at,
          synced_at,
          last_error
        FROM inventory_events
        WHERE sync_status != 'failed'
        ORDER BY event_ts ASC`
    );

    for (const row of rows) {
      await applyInventoryEvent(db, parseInventoryEvent(row));
    }
  });
};

const getProjectedCountLinesBySession = async (
  sessionId: string
): Promise<ProjectedCountLineRow[]> => {
  return getProjectedCountLinesBySessionIds([sessionId]);
};

export const getProjectedCountLinesBySessionIds = async (
  sessionIds: string[]
): Promise<ProjectedCountLineRow[]> => {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }
  const db = await getDb();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  return await db.getAllAsync<ProjectedCountLineRow>(
    `SELECT
        event_id,
        server_line_id,
        session_id,
        item_code,
        item_name,
        counted_qty,
        damaged_qty,
        floor_no,
        rack_no,
        counted_by,
        counted_at,
        sync_status,
        payload_json
      FROM count_line_records
      WHERE session_id IN (${placeholders})
      ORDER BY counted_at DESC`,
    uniqueIds
  );
};

const getProjectedUnsyncedCountLinesBySession = async (
  sessionId: string
): Promise<ProjectedCountLineRow[]> => {
  const db = await getDb();
  return await db.getAllAsync<ProjectedCountLineRow>(
    `SELECT
        event_id,
        server_line_id,
        session_id,
        item_code,
        item_name,
        counted_qty,
        damaged_qty,
        floor_no,
        rack_no,
        counted_by,
        counted_at,
        sync_status,
        payload_json
      FROM count_line_records
      WHERE session_id = ?
        AND sync_status != 'synced'
      ORDER BY counted_at DESC`,
    [sessionId]
  );
};

const getProjectedScanStatus = async (
  sessionId: string,
  itemCode: string
): Promise<{
  scanned: boolean;
  total_qty: number;
  locations: {
    floor_no: string | null;
    rack_no: string | null;
    counted_qty: number;
    counted_by: string;
    counted_at: string;
  }[];
}> => {
  return getProjectedScanStatusBySessionIds([sessionId], itemCode);
};

export const getProjectedScanStatusBySessionIds = async (
  sessionIds: string[],
  itemCode: string
): Promise<{
  scanned: boolean;
  total_qty: number;
  locations: {
    floor_no: string | null;
    rack_no: string | null;
    counted_qty: number;
    counted_by: string;
    counted_at: string;
  }[];
}> => {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      scanned: false,
      total_qty: 0,
      locations: [],
    };
  }
  const db = await getDb();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const total = await db.getFirstAsync<ProjectedScanStatusRow>(
    `SELECT COALESCE(SUM(counted_qty), 0) as total_qty
     FROM count_line_records
     WHERE session_id IN (${placeholders}) AND item_code = ?`,
    [...uniqueIds, itemCode]
  );
  const locations = await db.getAllAsync<{
    floor_no?: string | null;
    rack_no?: string | null;
    counted_qty: number;
    counted_by: string;
    counted_at: string;
  }>(
    `SELECT floor_no, rack_no, counted_qty, counted_by, counted_at
     FROM count_line_records
     WHERE session_id IN (${placeholders}) AND item_code = ?
     ORDER BY counted_at DESC`,
    [...uniqueIds, itemCode]
  );

  return {
    scanned: locations.length > 0,
    total_qty: total?.total_qty ?? 0,
    locations: locations.map((location) => ({
      floor_no: location.floor_no ?? null,
      rack_no: location.rack_no ?? null,
      counted_qty: location.counted_qty,
      counted_by: location.counted_by,
      counted_at: location.counted_at,
    })),
  };
};

const getProjectedSessionStats = async (
  sessionId: string
): Promise<{
  scannedItems: number;
  pendingItems: number;
  verifiedItems: number;
  lastCountedAt: string | null;
} | null> => {
  return getProjectedSessionStatsBySessionIds([sessionId]);
};

export const getProjectedSessionStatsBySessionIds = async (
  sessionIds: string[]
): Promise<{
  scannedItems: number;
  pendingItems: number;
  verifiedItems: number;
  lastCountedAt: string | null;
} | null> => {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return null;
  }
  const db = await getDb();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const row = await db.getFirstAsync<{
    scanned_items: number;
    pending_items: number;
    verified_items: number;
    last_counted_at: string | null;
  }>(
    `SELECT
        COUNT(DISTINCT item_code) as scanned_items,
        COUNT(CASE WHEN sync_status != 'synced' THEN 1 END) as pending_items,
        COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as verified_items,
        MAX(counted_at) as last_counted_at
      FROM count_line_records
      WHERE session_id IN (${placeholders})`,
    uniqueIds
  );

  if (!row || (row.scanned_items ?? 0) === 0) {
    return null;
  }

  return {
    scannedItems: row.scanned_items ?? 0,
    pendingItems: row.pending_items ?? 0,
    verifiedItems: row.verified_items ?? 0,
    lastCountedAt: row.last_counted_at ?? null,
  };
};

const hasProjectedItemActivity = async (
  sessionId: string,
  itemCode: string
): Promise<boolean> => {
  return hasProjectedItemActivityBySessionIds([sessionId], itemCode);
};

export const hasProjectedItemActivityBySessionIds = async (
  sessionIds: string[],
  itemCode: string
): Promise<boolean> => {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return false;
  }
  const db = await getDb();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM count_line_records
     WHERE session_id IN (${placeholders}) AND item_code = ?`,
    [...uniqueIds, itemCode]
  );
  return (row?.count ?? 0) > 0;
};

export const resolveProjectedServerCountLineId = async (lineId: string): Promise<string | null> => {
  if (!lineId) {
    return null;
  }

  const db = await getDb();
  const row = await db.getFirstAsync<{
    event_id: string;
    server_line_id?: string | null;
  }>(
    `SELECT event_id, server_line_id
     FROM count_line_records
     WHERE event_id = ? OR server_line_id = ?
     LIMIT 1`,
    [lineId, lineId]
  );

  if (!row) {
    return lineId;
  }

  if (row.server_line_id) {
    return row.server_line_id;
  }

  if (row.event_id === lineId) {
    return null;
  }

  return lineId;
};
