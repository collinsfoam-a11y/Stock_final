import type * as SQLite from "expo-sqlite";

export const ensureControlPlaneSchema = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      event_ts INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      synced_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS event_applied (
      event_id TEXT PRIMARY KEY,
      projection_version TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items_snapshot (
      session_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      total_qty REAL NOT NULL DEFAULT 0,
      total_damage_qty REAL NOT NULL DEFAULT 0,
      line_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      projection_version TEXT NOT NULL,
      PRIMARY KEY (session_id, item_code)
    );

    CREATE TABLE IF NOT EXISTS count_line_records (
      event_id TEXT PRIMARY KEY,
      server_line_id TEXT,
      session_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      counted_qty REAL NOT NULL,
      damaged_qty REAL NOT NULL DEFAULT 0,
      floor_no TEXT,
      rack_no TEXT,
      counted_by TEXT NOT NULL,
      counted_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      payload_json TEXT NOT NULL,
      projection_version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_records (
      session_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      mrp REAL,
      updated_at TEXT NOT NULL,
      projection_version TEXT NOT NULL,
      PRIMARY KEY (session_id, item_code, batch_id)
    );

    CREATE TABLE IF NOT EXISTS serial_registry (
      session_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      serial_no TEXT NOT NULL,
      event_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      projection_version TEXT NOT NULL,
      PRIMARY KEY (item_code, serial_no)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_events_session
      ON inventory_events (session_id, event_ts);
    CREATE INDEX IF NOT EXISTS idx_inventory_events_status
      ON inventory_events (sync_status, event_ts);
    CREATE INDEX IF NOT EXISTS idx_items_snapshot_session
      ON items_snapshot (session_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_count_line_records_session
      ON count_line_records (session_id, counted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_count_line_records_server_id
      ON count_line_records (server_line_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status
      ON sync_queue (sync_status, created_at);

    CREATE TABLE IF NOT EXISTS session_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      local_session_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      event_ts INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      synced_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS session_event_applied (
      event_id TEXT PRIMARY KEY,
      projection_version TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_snapshots (
      local_session_id TEXT PRIMARY KEY,
      server_session_id TEXT,
      warehouse TEXT NOT NULL,
      location_type TEXT,
      location_name TEXT,
      rack_no TEXT,
      location_key TEXT NOT NULL,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      staff_user TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      closed_at TEXT,
      reconciled_at TEXT,
      completed_at TEXT,
      finalized_at TEXT,
      finalization_status TEXT,
      notes TEXT,
      last_heartbeat TEXT,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      projection_version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_sync_queue (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      local_session_id TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_events_session
      ON session_events (local_session_id, event_ts);
    CREATE INDEX IF NOT EXISTS idx_session_events_status
      ON session_events (sync_status, event_ts);
    CREATE INDEX IF NOT EXISTS idx_session_snapshots_location
      ON session_snapshots (location_key, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session_snapshots_server_id
      ON session_snapshots (server_session_id);
    CREATE INDEX IF NOT EXISTS idx_session_sync_queue_status
      ON session_sync_queue (sync_status, created_at);

    CREATE TABLE IF NOT EXISTS count_line_review_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      line_id TEXT NOT NULL,
      session_id TEXT,
      payload_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      event_ts INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      synced_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS count_line_review_event_applied (
      event_id TEXT PRIMARY KEY,
      projection_version TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS count_line_review_projection (
      line_id TEXT PRIMARY KEY,
      session_id TEXT,
      status TEXT,
      approval_status TEXT,
      approved_by TEXT,
      approved_at TEXT,
      approval_note TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      assigned_to TEXT,
      verified INTEGER,
      verified_by TEXT,
      verified_at TEXT,
      blind_recount_required INTEGER NOT NULL DEFAULT 0,
      dual_verification_required INTEGER NOT NULL DEFAULT 0,
      original_count_hidden INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      projection_version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS count_line_review_sync_queue (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      line_id TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_count_line_review_events_line
      ON count_line_review_events (line_id, event_ts);
    CREATE INDEX IF NOT EXISTS idx_count_line_review_events_session
      ON count_line_review_events (session_id, event_ts);
    CREATE INDEX IF NOT EXISTS idx_count_line_review_events_status
      ON count_line_review_events (sync_status, event_ts);
    CREATE INDEX IF NOT EXISTS idx_count_line_review_projection_session
      ON count_line_review_projection (session_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_count_line_review_sync_queue_status
      ON count_line_review_sync_queue (sync_status, created_at);
  `);

  const countLineRecordColumns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(count_line_records)"
  );
  const hasServerLineId = countLineRecordColumns.some((column) => column.name === "server_line_id");
  if (!hasServerLineId) {
    await db.execAsync("ALTER TABLE count_line_records ADD COLUMN server_line_id TEXT;");
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_count_line_records_server_id ON count_line_records (server_line_id);"
    );
  }
};
