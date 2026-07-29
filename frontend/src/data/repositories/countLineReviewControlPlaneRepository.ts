import { CONTROL_PLANE_PROJECTION_VERSION } from "@/core/config/controlPlaneFlags";
import type { CountLineReviewEvent } from "@/core/events/countLineReviewEvents";
import { applyCountLineReviewEventToSnapshot } from "@/core/reducers/countLineReviewProjectionReducer";
import type { ProjectedCountLineReviewSnapshot } from "@/core/reducers/countLineReviewProjectionReducer";
import { getDb } from "@/db/localDb";

type CountLineReviewEventRow = {
  event_id: string;
  event_type: string;
  line_id: string;
  session_id?: string | null;
  payload_json: string;
  metadata_json: string;
  event_ts: number;
  sync_status: string;
  created_at: string;
  synced_at?: string | null;
  last_error?: string | null;
};

type CountLineReviewProjectionRow = {
  line_id: string;
  session_id?: string | null;
  status?: string | null;
  approval_status?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  approval_note?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  assigned_to?: string | null;
  verified?: number | null;
  verified_by?: string | null;
  verified_at?: string | null;
  blind_recount_required: number;
  dual_verification_required: number;
  original_count_hidden: number;
  updated_at: string;
  sync_status: string;
  projection_version: string;
};

const nowIso = () => new Date().toISOString();

const parseReviewEvent = (row: CountLineReviewEventRow): CountLineReviewEvent =>
  (({
    id: row.event_id,
    type: row.event_type as CountLineReviewEvent["type"],
    aggregateId: row.line_id,
    payload: JSON.parse(row.payload_json),
    meta: JSON.parse(row.metadata_json),
    ts: row.event_ts
  }) as CountLineReviewEvent);

const toProjectedSnapshot = (
  row: CountLineReviewProjectionRow
): ProjectedCountLineReviewSnapshot => ({
  lineId: row.line_id,
  sessionId: row.session_id ?? null,
  status: row.status ?? null,
  approvalStatus: row.approval_status ?? null,
  approvedBy: row.approved_by ?? null,
  approvedAt: row.approved_at ?? null,
  approvalNote: row.approval_note ?? null,
  rejectedBy: row.rejected_by ?? null,
  rejectedAt: row.rejected_at ?? null,
  rejectionReason: row.rejection_reason ?? null,
  assignedTo: row.assigned_to ?? null,
  verified: row.verified === null || row.verified === undefined ? null : Boolean(row.verified),
  verifiedBy: row.verified_by ?? null,
  verifiedAt: row.verified_at ?? null,
  blindRecountRequired: Boolean(row.blind_recount_required),
  dualVerificationRequired: Boolean(row.dual_verification_required),
  originalCountHidden: Boolean(row.original_count_hidden),
  updatedAt: row.updated_at,
  syncStatus: row.sync_status,
  projectionVersion: row.projection_version,
});

const upsertReviewProjection = async (
  db: Awaited<ReturnType<typeof getDb>>,
  snapshot: ProjectedCountLineReviewSnapshot
) => {
  await db.runAsync(
    `INSERT OR REPLACE INTO count_line_review_projection (
        line_id,
        session_id,
        status,
        approval_status,
        approved_by,
        approved_at,
        approval_note,
        rejected_by,
        rejected_at,
        rejection_reason,
        assigned_to,
        verified,
        verified_by,
        verified_at,
        blind_recount_required,
        dual_verification_required,
        original_count_hidden,
        updated_at,
        sync_status,
        projection_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.lineId,
      snapshot.sessionId,
      snapshot.status,
      snapshot.approvalStatus,
      snapshot.approvedBy,
      snapshot.approvedAt,
      snapshot.approvalNote,
      snapshot.rejectedBy,
      snapshot.rejectedAt,
      snapshot.rejectionReason,
      snapshot.assignedTo,
      snapshot.verified === null ? null : snapshot.verified ? 1 : 0,
      snapshot.verifiedBy,
      snapshot.verifiedAt,
      snapshot.blindRecountRequired ? 1 : 0,
      snapshot.dualVerificationRequired ? 1 : 0,
      snapshot.originalCountHidden ? 1 : 0,
      snapshot.updatedAt,
      snapshot.syncStatus,
      snapshot.projectionVersion,
    ]
  );
};

const markReviewEventApplied = async (
  db: Awaited<ReturnType<typeof getDb>>,
  eventId: string
): Promise<boolean> => {
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO count_line_review_event_applied (
        event_id,
        projection_version,
        applied_at
      ) VALUES (?, ?, ?)`,
    [eventId, CONTROL_PLANE_PROJECTION_VERSION, nowIso()]
  );
  return (result.changes ?? 0) > 0;
};

const applyReviewEvent = async (
  db: Awaited<ReturnType<typeof getDb>>,
  event: CountLineReviewEvent
): Promise<boolean> => {
  const wasApplied = await markReviewEventApplied(db, event.id);
  if (!wasApplied) {
    return false;
  }

  const previous = await db.getFirstAsync<CountLineReviewProjectionRow>(
    `SELECT
        line_id,
        session_id,
        status,
        approval_status,
        approved_by,
        approved_at,
        approval_note,
        rejected_by,
        rejected_at,
        rejection_reason,
        assigned_to,
        verified,
        verified_by,
        verified_at,
        blind_recount_required,
        dual_verification_required,
        original_count_hidden,
        updated_at,
        sync_status,
        projection_version
      FROM count_line_review_projection
      WHERE line_id = ?`,
    [event.aggregateId]
  );
  const nextSnapshot = applyCountLineReviewEventToSnapshot(
    event,
    previous ? toProjectedSnapshot(previous) : null
  );
  await upsertReviewProjection(db, nextSnapshot);
  return true;
};

const refreshProjectionSyncStatus = async (lineId: string): Promise<void> => {
  const db = await getDb();
  const latest = await db.getFirstAsync<{ sync_status: string }>(
    `SELECT sync_status
     FROM count_line_review_events
     WHERE line_id = ?
       AND sync_status != 'failed'
     ORDER BY event_ts DESC
     LIMIT 1`,
    [lineId]
  );
  if (!latest) {
    return;
  }
  await db.runAsync(
    `UPDATE count_line_review_projection
     SET sync_status = ?
     WHERE line_id = ?`,
    [latest.sync_status, lineId]
  );
};

export const recordCountLineReviewEvent = async (event: CountLineReviewEvent): Promise<boolean> => {
  const db = await getDb();
  const createdAt = nowIso();
  let inserted = false;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO count_line_review_events (
          event_id,
          event_type,
          line_id,
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
        "session_id" in event.payload ? (event.payload.session_id ?? null) : null,
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
      `INSERT OR IGNORE INTO count_line_review_sync_queue (
          event_id,
          event_type,
          line_id,
          sync_status,
          retry_count,
          created_at
        ) VALUES (?, ?, ?, ?, 0, ?)`,
      [event.id, event.type, event.aggregateId, event.payload.sync_status, createdAt]
    );

    await applyReviewEvent(db, event);
  });

  return inserted;
};

export const markCountLineReviewEventSynced = async (eventId: string): Promise<void> => {
  const db = await getDb();
  const syncedAt = nowIso();
  const row = await db.getFirstAsync<{ line_id: string }>(
    `SELECT line_id FROM count_line_review_events WHERE event_id = ?`,
    [eventId]
  );
  await db.runAsync(
    `UPDATE count_line_review_events
     SET sync_status = 'synced',
         synced_at = ?,
         last_error = NULL
     WHERE event_id = ?`,
    [syncedAt, eventId]
  );
  await db.runAsync(
    `UPDATE count_line_review_sync_queue
     SET sync_status = 'synced',
         last_error = NULL,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [syncedAt, eventId]
  );
  if (row?.line_id) {
    await refreshProjectionSyncStatus(row.line_id);
  }
};

export const markCountLineReviewEventRetry = async (
  eventId: string,
  errorMessage: string
): Promise<void> => {
  const db = await getDb();
  const attemptedAt = nowIso();
  const row = await db.getFirstAsync<{ line_id: string }>(
    `SELECT line_id FROM count_line_review_events WHERE event_id = ?`,
    [eventId]
  );
  await db.runAsync(
    `UPDATE count_line_review_events
     SET sync_status = 'pending_retry',
         last_error = ?
     WHERE event_id = ?`,
    [errorMessage, eventId]
  );
  await db.runAsync(
    `UPDATE count_line_review_sync_queue
     SET sync_status = 'pending_retry',
         retry_count = retry_count + 1,
         last_error = ?,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [errorMessage, attemptedAt, eventId]
  );
  if (row?.line_id) {
    await refreshProjectionSyncStatus(row.line_id);
  }
};

export const markCountLineReviewEventFailed = async (
  eventId: string,
  errorMessage: string
): Promise<void> => {
  const db = await getDb();
  const attemptedAt = nowIso();
  await db.runAsync(
    `UPDATE count_line_review_events
     SET sync_status = 'failed',
         last_error = ?
     WHERE event_id = ?`,
    [errorMessage, eventId]
  );
  await db.runAsync(
    `UPDATE count_line_review_sync_queue
     SET sync_status = 'failed',
         retry_count = retry_count + 1,
         last_error = ?,
         last_attempted_at = ?
     WHERE event_id = ?`,
    [errorMessage, attemptedAt, eventId]
  );
};

export const getPendingCountLineReviewEvents = async (
  limit: number = 50
): Promise<CountLineReviewEvent[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<CountLineReviewEventRow>(
    `SELECT
        event_id,
        event_type,
        line_id,
        session_id,
        payload_json,
        metadata_json,
        event_ts,
        sync_status,
        created_at,
        synced_at,
        last_error
      FROM count_line_review_events
      WHERE sync_status IN ('pending', 'pending_retry')
      ORDER BY event_ts ASC
      LIMIT ?`,
    [limit]
  );
  return rows.map(parseReviewEvent);
};

export const rebuildCountLineReviewProjections = async (): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM count_line_review_event_applied");
    await db.runAsync("DELETE FROM count_line_review_projection");

    const rows = await db.getAllAsync<CountLineReviewEventRow>(
      `SELECT
          event_id,
          event_type,
          line_id,
          session_id,
          payload_json,
          metadata_json,
          event_ts,
          sync_status,
          created_at,
          synced_at,
          last_error
        FROM count_line_review_events
        WHERE sync_status != 'failed'
        ORDER BY event_ts ASC`
    );

    for (const row of rows) {
      await applyReviewEvent(db, parseReviewEvent(row));
    }
  });
};

export const getProjectedCountLineReviewStates = async (
  lineIds: string[]
): Promise<ProjectedCountLineReviewSnapshot[]> => {
  const uniqueIds = Array.from(new Set(lineIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }

  const db = await getDb();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = await db.getAllAsync<CountLineReviewProjectionRow>(
    `SELECT
        line_id,
        session_id,
        status,
        approval_status,
        approved_by,
        approved_at,
        approval_note,
        rejected_by,
        rejected_at,
        rejection_reason,
        assigned_to,
        verified,
        verified_by,
        verified_at,
        blind_recount_required,
        dual_verification_required,
        original_count_hidden,
        updated_at,
        sync_status,
        projection_version
      FROM count_line_review_projection
      WHERE line_id IN (${placeholders})`,
    uniqueIds
  );
  return rows.map(toProjectedSnapshot);
};

export const rebindCountLineReviewLineId = async (
  currentLineId: string,
  serverLineId: string
): Promise<void> => {
  if (!currentLineId || !serverLineId || currentLineId === serverLineId) {
    return;
  }

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE count_line_review_events
       SET line_id = ?
       WHERE line_id = ?`,
      [serverLineId, currentLineId]
    );
    await db.runAsync(
      `UPDATE count_line_review_sync_queue
       SET line_id = ?
       WHERE line_id = ?`,
      [serverLineId, currentLineId]
    );
    await db.runAsync(
      `UPDATE count_line_review_projection
       SET line_id = ?
       WHERE line_id = ?`,
      [serverLineId, currentLineId]
    );
  });
};
