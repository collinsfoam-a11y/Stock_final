import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import type { SessionEvent } from "@/core/events/sessionEvents";
import {
  applySessionEventToSnapshot,
  buildSessionLocationKey,
  isProjectedSessionActive,
  type ProjectedSessionSnapshot,
} from "@/core/reducers/sessionProjectionReducer";
import { getDb } from "@/db/localDb";

type SessionEventRow = {
  event_id: string;
  event_type: string;
  local_session_id: string;
  payload_json: string;
  metadata_json: string;
  event_ts: number;
  sync_status: string;
  created_at: string;
  synced_at?: string | null;
  last_error?: string | null;
};

type SessionSnapshotRow = {
  local_session_id: string;
  server_session_id?: string | null;
  warehouse: string;
  location_type?: string | null;
  location_name?: string | null;
  rack_no?: string | null;
  location_key: string;
  status: string;
  type: string;
  staff_user: string;
  staff_name: string;
  started_at: string;
  closed_at?: string | null;
  reconciled_at?: string | null;
  completed_at?: string | null;
  finalized_at?: string | null;
  finalization_status?: string | null;
  notes?: string | null;
  last_heartbeat?: string | null;
  updated_at: string;
  sync_status: string;
  projection_version: string;
};

const nowIso = () => new Date().toISOString();

const toSnapshot = (row: SessionSnapshotRow): ProjectedSessionSnapshot => ({
  localSessionId: row.local_session_id,
  serverSessionId: row.server_session_id ?? null,
  warehouse: row.warehouse,
  locationType: row.location_type ?? null,
  locationName: row.location_name ?? null,
  rackNo: row.rack_no ?? null,
  locationKey: row.location_key,
  status: row.status,
  type: row.type,
  staffUser: row.staff_user,
  staffName: row.staff_name,
  startedAt: row.started_at,
  closedAt: row.closed_at ?? null,
  reconciledAt: row.reconciled_at ?? null,
  completedAt: row.completed_at ?? null,
  finalizedAt: row.finalized_at ?? null,
  finalizationStatus: row.finalization_status ?? null,
  notes: row.notes ?? null,
  lastHeartbeat: row.last_heartbeat ?? null,
  updatedAt: row.updated_at,
  syncStatus: row.sync_status,
  projectionVersion: row.projection_version,
});

const parseSessionEvent = (row: SessionEventRow): SessionEvent =>
  (({
    id: row.event_id,
    type: row.event_type as SessionEvent["type"],
    aggregateId: row.local_session_id,
    payload: JSON.parse(row.payload_json),
    meta: JSON.parse(row.metadata_json),
    ts: row.event_ts
  }) as SessionEvent);

const getSnapshotByLocalId = async (
  localSessionId: string
): Promise<ProjectedSessionSnapshot | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionSnapshotRow>(
    `SELECT
        local_session_id,
        server_session_id,
        warehouse,
        location_type,
        location_name,
        rack_no,
        location_key,
        status,
        type,
        staff_user,
        staff_name,
        started_at,
        closed_at,
        reconciled_at,
        completed_at,
        finalized_at,
        finalization_status,
        notes,
        last_heartbeat,
        updated_at,
        sync_status,
        projection_version
      FROM session_snapshots
      WHERE local_session_id = ?`,
    [localSessionId]
  );
  return row ? toSnapshot(row) : null;
};

const getSnapshotByAnyId = async (sessionId: string): Promise<ProjectedSessionSnapshot | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionSnapshotRow>(
    `SELECT
        local_session_id,
        server_session_id,
        warehouse,
        location_type,
        location_name,
        rack_no,
        location_key,
        status,
        type,
        staff_user,
        staff_name,
        started_at,
        closed_at,
        reconciled_at,
        completed_at,
        finalized_at,
        finalization_status,
        notes,
        last_heartbeat,
        updated_at,
        sync_status,
        projection_version
      FROM session_snapshots
      WHERE local_session_id = ? OR server_session_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [sessionId, sessionId]
  );
  return row ? toSnapshot(row) : null;
};

const upsertSessionSnapshot = async (
  db: Awaited<ReturnType<typeof getDb>>,
  snapshot: ProjectedSessionSnapshot
) => {
  await db.runAsync(
    `INSERT OR REPLACE INTO session_snapshots (
        local_session_id,
        server_session_id,
        warehouse,
        location_type,
        location_name,
        rack_no,
        location_key,
        status,
        type,
        staff_user,
        staff_name,
        started_at,
        closed_at,
        reconciled_at,
        completed_at,
        finalized_at,
        finalization_status,
        notes,
        last_heartbeat,
        updated_at,
        sync_status,
        projection_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.localSessionId,
      snapshot.serverSessionId,
      snapshot.warehouse,
      snapshot.locationType,
      snapshot.locationName,
      snapshot.rackNo,
      snapshot.locationKey,
      snapshot.status,
      snapshot.type,
      snapshot.staffUser,
      snapshot.staffName,
      snapshot.startedAt,
      snapshot.closedAt,
      snapshot.reconciledAt,
      snapshot.completedAt,
      snapshot.finalizedAt,
      snapshot.finalizationStatus,
      snapshot.notes,
      snapshot.lastHeartbeat,
      snapshot.updatedAt,
      snapshot.syncStatus,
      snapshot.projectionVersion,
    ]
  );
};

const markSessionEventApplied = async (
  db: Awaited<ReturnType<typeof getDb>>,
  eventId: string
): Promise<boolean> => {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO session_event_applied (
        event_id,
        projection_version,
        applied_at
      ) VALUES (?, ?, ?)`,
    [eventId, CONTROL_PLANE_PROJECTION_VERSION, nowIso()]
  );
  return (result.changes ?? 0) > 0;
};

const applySessionEvent = async (
  db: Awaited<ReturnType<typeof getDb>>,
  event: SessionEvent
): Promise<boolean> => {
  const wasApplied = await markSessionEventApplied(db, event.id);
  if (!wasApplied) {
    return false;
  }

  const previous = await db.getFirstAsync<SessionSnapshotRow>(
    `SELECT
        local_session_id,
        server_session_id,
        warehouse,
        location_type,
        location_name,
        rack_no,
        location_key,
        status,
        type,
        staff_user,
        staff_name,
        started_at,
        closed_at,
        reconciled_at,
        completed_at,
        finalized_at,
        finalization_status,
        notes,
        last_heartbeat,
        updated_at,
        sync_status,
        projection_version
      FROM session_snapshots
      WHERE local_session_id = ?`,
    [event.aggregateId]
  );
  const nextSnapshot = applySessionEventToSnapshot(event, previous ? toSnapshot(previous) : null);
  await upsertSessionSnapshot(db, nextSnapshot);
  return true;
};

const refreshSnapshotSyncStatus = async (localSessionId: string): Promise<void> => {
  const db = await getDb();
  const latest = await db.getFirstAsync<{ sync_status: string }>(
    `SELECT sync_status
     FROM session_events
     WHERE local_session_id = ?
       AND sync_status != 'failed'
     ORDER BY event_ts DESC
     LIMIT 1`,
    [localSessionId]
  );
  if (!latest) {
    return;
  }
  await db.runAsync(
    `UPDATE session_snapshots
     SET sync_status = ?
     WHERE local_session_id = ?`,
    [latest.sync_status, localSessionId]
  );
};

export const recordSessionEvent = async (event: SessionEvent): Promise<boolean> => {
  const db = await getDb();
  const createdAt = nowIso();
  let inserted = false;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO session_events (
          event_id,
          event_type,
          local_session_id,
          payload_json,
          metadata_json,
          event_ts,
          sync_status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.type,
        event.aggregateId,
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
      `INSERT OR IGNORE INTO session_sync_queue (
          event_id,
          event_type,
          local_session_id,
          sync_status,
          retry_count,
          created_at
        ) VALUES (?, ?, ?, ?, 0, ?)`,
      [event.id, event.type, event.aggregateId, event.payload.sync_status, createdAt]
    );

    await applySessionEvent(db, event);
  });

  return inserted;
};

export const markSessionEventSynced = async (eventId: string): Promise<void> => {
  const db = await getDb();
  const syncedAt = nowIso();
  const row = await db.getFirstAsync<{ local_session_id: string }>(
    `SELECT local_session_id FROM session_events WHERE event_id = ?`,
    [eventId]
  );
  await db.runAsync(
    `UPDATE session_events
     SET sync_status = 'synced',
         synced_at = ?,
         last_error = NULL
     WHERE event_id = ?`,
    [syncedAt, eventId]
  );
  await db.runAsync(
    `UPDATE session_sync_queue
     SET sync_status = 'synced',
         last_error = NULL,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [syncedAt, eventId]
  );
  if (row?.local_session_id) {
    await refreshSnapshotSyncStatus(row.local_session_id);
  }
};

export const markSessionEventRetry = async (
  eventId: string,
  errorMessage: string
): Promise<void> => {
  const db = await getDb();
  const attemptedAt = nowIso();
  const row = await db.getFirstAsync<{ local_session_id: string }>(
    `SELECT local_session_id FROM session_events WHERE event_id = ?`,
    [eventId]
  );
  await db.runAsync(
    `UPDATE session_events
     SET sync_status = 'pending_retry',
         last_error = ?
     WHERE event_id = ?`,
    [errorMessage, eventId]
  );
  await db.runAsync(
    `UPDATE session_sync_queue
     SET sync_status = 'pending_retry',
         retry_count = retry_count + 1,
         last_error = ?,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [errorMessage, attemptedAt, eventId]
  );
  if (row?.local_session_id) {
    await refreshSnapshotSyncStatus(row.local_session_id);
  }
};

export const markSessionEventFailed = async (
  eventId: string,
  errorMessage: string
): Promise<void> => {
  const db = await getDb();
  const attemptedAt = nowIso();
  await db.runAsync(
    `UPDATE session_events
     SET sync_status = 'failed',
         last_error = ?
     WHERE event_id = ?`,
    [errorMessage, eventId]
  );
  await db.runAsync(
    `UPDATE session_sync_queue
     SET sync_status = 'failed',
         retry_count = retry_count + 1,
         last_error = ?,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [errorMessage, attemptedAt, eventId]
  );
};

export const rebuildSessionProjections = async (): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM session_event_applied");
    await db.runAsync("DELETE FROM session_snapshots");

    const rows = await db.getAllAsync<SessionEventRow>(
      `SELECT
          event_id,
          event_type,
          local_session_id,
          payload_json,
          metadata_json,
          event_ts,
          sync_status,
          created_at,
          synced_at,
          last_error
        FROM session_events
        WHERE sync_status != 'failed'
        ORDER BY event_ts ASC`
    );

    for (const row of rows) {
      await applySessionEvent(db, parseSessionEvent(row));
    }
  });
};

export const getPendingSessionEvents = async (limit: number = 50): Promise<SessionEvent[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionEventRow>(
    `SELECT
        event_id,
        event_type,
        local_session_id,
        payload_json,
        metadata_json,
        event_ts,
        sync_status,
        created_at,
        synced_at,
        last_error
      FROM session_events
      WHERE sync_status IN ('pending', 'pending_retry')
      ORDER BY event_ts ASC
      LIMIT ?`,
    [limit]
  );
  return rows.map(parseSessionEvent);
};

export const getProjectedSessionById = async (
  sessionId: string
): Promise<ProjectedSessionSnapshot | null> => getSnapshotByAnyId(sessionId);

export const getProjectedSessions = async (): Promise<ProjectedSessionSnapshot[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionSnapshotRow>(
    `SELECT
        local_session_id,
        server_session_id,
        warehouse,
        location_type,
        location_name,
        rack_no,
        location_key,
        status,
        type,
        staff_user,
        staff_name,
        started_at,
        closed_at,
        reconciled_at,
        completed_at,
        finalized_at,
        finalization_status,
        notes,
        last_heartbeat,
        updated_at,
        sync_status,
        projection_version
      FROM session_snapshots
      ORDER BY updated_at DESC`
  );
  return rows.map(toSnapshot);
};

export const resolveLocalSessionId = async (sessionId: string): Promise<string> => {
  const snapshot = await getSnapshotByAnyId(sessionId);
  return snapshot?.localSessionId || sessionId;
};

export const resolveProjectionSessionIds = async (sessionId: string): Promise<string[]> => {
  const snapshot = await getSnapshotByAnyId(sessionId);
  if (!snapshot) {
    return [sessionId];
  }
  return [snapshot.localSessionId];
};

export const resolveServerSessionId = async (sessionId: string): Promise<string | null> => {
  const snapshot = await getSnapshotByAnyId(sessionId);
  if (!snapshot) {
    return sessionId.startsWith("offline_") ? null : sessionId;
  }
  return (
    snapshot.serverSessionId || (snapshot.localSessionId.startsWith("offline_") ? null : sessionId)
  );
};

export const bindServerSessionId = async (
  localSessionId: string,
  serverSession: {
    id?: string;
    _id?: string;
    session_id?: string;
    warehouse?: string;
    status?: string;
    type?: string;
    staff_user?: string;
    staff_name?: string;
    started_at?: string;
    location_type?: string | null;
    location_name?: string | null;
    rack_no?: string | null;
    finalization_status?: string | null;
    finalized_at?: string | null;
    notes?: string | null;
    last_heartbeat?: string | null;
  }
): Promise<void> => {
  const db = await getDb();
  const snapshot = await getSnapshotByLocalId(localSessionId);
  if (!snapshot) {
    return;
  }

  const serverSessionId =
    serverSession.id || serverSession._id || serverSession.session_id || snapshot.serverSessionId;
  const nextSnapshot: ProjectedSessionSnapshot = {
    ...snapshot,
    serverSessionId: serverSessionId ?? null,
    warehouse: serverSession.warehouse || snapshot.warehouse,
    status: serverSession.status || snapshot.status,
    type: serverSession.type || snapshot.type,
    staffUser: serverSession.staff_user || snapshot.staffUser,
    staffName: serverSession.staff_name || snapshot.staffName,
    startedAt: serverSession.started_at || snapshot.startedAt,
    locationType: serverSession.location_type ?? snapshot.locationType,
    locationName: serverSession.location_name ?? snapshot.locationName,
    rackNo: serverSession.rack_no ?? snapshot.rackNo,
    locationKey: buildSessionLocationKey({
      warehouse: serverSession.warehouse || snapshot.warehouse,
      locationType: serverSession.location_type ?? snapshot.locationType,
      locationName: serverSession.location_name ?? snapshot.locationName,
      rackNo: serverSession.rack_no ?? snapshot.rackNo,
    }),
    finalizationStatus: serverSession.finalization_status ?? snapshot.finalizationStatus,
    finalizedAt: serverSession.finalized_at ?? snapshot.finalizedAt,
    notes: serverSession.notes ?? snapshot.notes,
    lastHeartbeat: serverSession.last_heartbeat ?? snapshot.lastHeartbeat,
    updatedAt: nowIso(),
    syncStatus: "synced",
    projectionVersion: CONTROL_PLANE_PROJECTION_VERSION,
  };

  await upsertSessionSnapshot(db, nextSnapshot);
};

export const findActiveProjectedSessionForLocation = async (
  locationKey: string
): Promise<ProjectedSessionSnapshot | null> => {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionSnapshotRow>(
    `SELECT
        local_session_id,
        server_session_id,
        warehouse,
        location_type,
        location_name,
        rack_no,
        location_key,
        status,
        type,
        staff_user,
        staff_name,
        started_at,
        closed_at,
        reconciled_at,
        completed_at,
        finalized_at,
        finalization_status,
        notes,
        last_heartbeat,
        updated_at,
        sync_status,
        projection_version
      FROM session_snapshots
      WHERE location_key = ?
      ORDER BY updated_at DESC`,
    [locationKey]
  );
  const active = rows.map(toSnapshot).find(isProjectedSessionActive);
  return active || null;
};

export { buildSessionLocationKey };
