import type * as SQLiteTypes from "expo-sqlite";
import type { CreateCountLinePayload, Item } from "@/types/scan";
import { ensureControlPlaneSchema } from "@/data/db/controlPlaneDb";

const DB_NAME = "stock_verify.db";

export interface LocalItem {
  barcode: string;
  name: string;
  category: string;
  verified: number; // 0 or 1
  last_sync: string;
}

export interface PendingVerification {
  id?: number;
  barcode: string;
  verified: number;
  timestamp: string;
  username: string;
  variance: number;
  status?: string; // 'pending', 'locked', 'error'
}

export interface PendingCountLine {
  id?: number;
  session_id: string;
  item_code: string;
  payload_json: string;
  created_at: string;
}

type SQLiteModule = typeof import("expo-sqlite");

let cachedDb: SQLiteTypes.SQLiteDatabase | null = null;
let sqliteModulePromise: Promise<SQLiteModule> | null = null;

const getSQLite = async (): Promise<SQLiteModule> => {
  sqliteModulePromise ??= import("expo-sqlite");
  return sqliteModulePromise;
};

const openDatabase = async (): Promise<SQLiteTypes.SQLiteDatabase> => {
  const SQLite = await getSQLite();
  return SQLite.openDatabaseAsync(DB_NAME);
};

const ensureSchema = async (db: SQLiteTypes.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS items (
      barcode TEXT PRIMARY KEY,
      name TEXT,
      category TEXT,
      verified INTEGER DEFAULT 0,
      last_sync TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT,
      verified INTEGER,
      timestamp TEXT,
      username TEXT,
      variance INTEGER,
      status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS pending_count_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      item_code TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migration: Add status column if it doesn't exist (for existing installs)
  try {
    await db.execAsync(
      'ALTER TABLE pending_verifications ADD COLUMN status TEXT DEFAULT "pending"'
    );
  } catch {
    // Column likely exists or other error we can ignore for now
  }

  await ensureControlPlaneSchema(db);
};

/**
 * Initialize the local database and create tables if they don't exist.
 */
export const initDb = async () => {
  const db = await openDatabase();
  await ensureSchema(db);
  // Cache so a subsequent getDb() doesn't reopen and re-run schema setup.
  cachedDb = db;
  __DEV__ && console.log("Local database initialized");
  return db;
};

/**
 * Get the database instance.
 */
export const getDb = async () => {
  if (cachedDb) return cachedDb;
  const db = await openDatabase();
  await ensureSchema(db);
  cachedDb = db;
  return db;
};

/**
 * Save items to local database.
 */
export const saveLocalItems = async (items: LocalItem[]) => {
  if (items.length === 0) return;
  const db = await getDb();
  // PERF-07: import the whole batch inside a SINGLE transaction so a large
  // catalog commits once instead of once-per-row. (expo-sqlite's runAsync
  // compiles + finalizes the statement internally per call.)
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        "INSERT OR REPLACE INTO items (barcode, name, category, verified, last_sync) VALUES (?, ?, ?, ?, ?)",
        [item.barcode, item.name, item.category, item.verified, item.last_sync]
      );
    }
  });
};

/**
 * Get all local items.
 */
export const getLocalItems = async (): Promise<LocalItem[]> => {
  const db = await getDb();
  return await db.getAllAsync<LocalItem>("SELECT * FROM items");
};

/**
 * Get the latest item sync timestamp from the local items table.
 * Used to request incremental updates from the backend.
 */
export const getLatestItemSyncTimestamp = async (): Promise<string | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ last_sync: string | null }>(
    "SELECT MAX(last_sync) as last_sync FROM items"
  );
  return row?.last_sync ?? null;
};

/**
 * Add a pending verification.
 */
export const addPendingVerification = async (verification: PendingVerification) => {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO pending_verifications (barcode, verified, timestamp, username, variance, status) VALUES (?, ?, ?, ?, ?, ?)",
    [
      verification.barcode,
      verification.verified,
      verification.timestamp,
      verification.username,
      verification.variance,
      verification.status || "pending",
    ]
  );
};

/**
 * Get all pending verifications (only those with status 'pending').
 */
export const getPendingVerifications = async (): Promise<PendingVerification[]> => {
  const db = await getDb();
  return await db.getAllAsync<PendingVerification>(
    'SELECT * FROM pending_verifications WHERE status = "pending"'
  );
};

/**
 * Update the status of a pending verification.
 */
export const updatePendingVerificationStatus = async (id: number, status: string) => {
  const db = await getDb();
  await db.runAsync("UPDATE pending_verifications SET status = ? WHERE id = ?", [status, id]);
};

/**
 * Delete a pending verification.
 */
export const deletePendingVerification = async (id: number) => {
  const db = await getDb();
  await db.runAsync("DELETE FROM pending_verifications WHERE id = ?", [id]);
};

/**
 * Clear pending verifications after successful sync.
 */
export const clearPendingVerifications = async (ids: number[]) => {
  const db = await getDb();
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(`DELETE FROM pending_verifications WHERE id IN (${placeholders})`, ids);
};

const mapLocalItemToAppItem = (row: LocalItem): Partial<Item> => {
  return {
    id: row.barcode,
    item_code: row.barcode,
    barcode: row.barcode,
    name: row.name,
    item_name: row.name,
    category: row.category,
  };
};

/**
 * Convenience wrapper used by screens expecting a `localDb` object.
 */
export const localDb = {
  async getItemByBarcode(barcode: string): Promise<Partial<Item> | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<LocalItem>("SELECT * FROM items WHERE barcode = ?", [
      barcode,
    ]);
    if (!row) return null;
    return mapLocalItemToAppItem(row);
  },

  async searchItems(query: string): Promise<Partial<Item>[]> {
    const db = await getDb();
    const trimmed = query.trim();
    // PERF-07: barcode is the PRIMARY KEY, so a leading-anchored prefix match
    // (`barcode LIKE 'q%'`) can use the index instead of forcing a full scan,
    // while name/category keep substring search for human-readable lookups.
    const prefixQuery = `${trimmed}%`;
    const containsQuery = `%${trimmed}%`;
    const rows = await db.getAllAsync<LocalItem>(
      `SELECT * FROM items
       WHERE barcode LIKE ? OR name LIKE ? OR category LIKE ?
       ORDER BY last_sync DESC
       LIMIT 25`,
      [prefixQuery, containsQuery, containsQuery]
    );

    return rows.map(mapLocalItemToAppItem);
  },

  async savePendingVerification(payload: CreateCountLinePayload): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO pending_count_lines (session_id, item_code, payload_json, created_at) VALUES (?, ?, ?, ?)",
      [payload.session_id, payload.item_code, JSON.stringify(payload), new Date().toISOString()]
    );
  },

  async getPendingCountLines(): Promise<PendingCountLine[]> {
    const db = await getDb();
    return await db.getAllAsync<PendingCountLine>("SELECT * FROM pending_count_lines");
  },

  async deletePendingCountLine(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM pending_count_lines WHERE id = ?", [id]);
  },

  /**
   * Get session statistics from local database.
   * Returns counts of scanned, verified, and pending items for a session.
   */
  async getSessionStats(sessionId: string): Promise<{
    totalItems: number;
    scannedItems: number;
    verifiedItems: number;
    pendingItems: number;
  } | null> {
    const { getProjectedSessionStatsRead } =
      await import("@/services/control-plane/countLineControlPlane");
    const projectedStats = await getProjectedSessionStatsRead(sessionId);
    const db = await getDb();

    // Count pending count lines for this session
    const pendingResult = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM pending_count_lines WHERE session_id = ?",
      [sessionId]
    );

    // Count verified items from local items table
    const verifiedResult = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM items WHERE verified = 1"
    );

    // Count all local items as total (approximation)
    const totalResult = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM items"
    );

    const totalItems = totalResult?.count || 0;
    const verifiedItems = projectedStats?.verifiedItems ?? (verifiedResult?.count || 0);
    const pendingItems = projectedStats?.pendingItems ?? (pendingResult?.count || 0);
    const scannedItems = projectedStats?.scannedItems ?? verifiedItems + pendingItems;

    return {
      totalItems,
      scannedItems,
      verifiedItems,
      pendingItems,
    };
  },
};
