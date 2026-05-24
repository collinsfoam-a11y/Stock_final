import type { OfflineQueueItem } from "./offlineStorage";

type QueueJournalEventType = "enqueue" | "replace" | "update" | "remove" | "clear";

interface QueueJournalEvent {
  sequence: number;
  event_type: QueueJournalEventType;
  queue_id: string | null;
  payload_json: string | null;
  payload_hash: string | null;
  created_at: string;
}

type SQLiteDatabaseLike = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
};

const DATABASE_NAME = "stock_verify_offline_journal.db";
const JOURNAL_TABLE = "offline_queue_journal";
const TEST_ENV =
  process.env.NODE_ENV === "test" || typeof process.env.JEST_WORKER_ID !== "undefined";

let dbPromise: Promise<SQLiteDatabaseLike> | null = null;
let memorySequence = 0;
let memoryJournal: QueueJournalEvent[] = [];

const stableStringify = (value: unknown): string => {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
};

const payloadHash = (payloadJson: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < payloadJson.length; index += 1) {
    hash ^= payloadJson.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const openJournalDb = async (): Promise<SQLiteDatabaseLike> => {
  if (!dbPromise) {
    dbPromise = import("expo-sqlite").then(async (SQLite) => {
      const db = (await SQLite.openDatabaseAsync(DATABASE_NAME)) as SQLiteDatabaseLike;
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS ${JOURNAL_TABLE} (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          queue_id TEXT,
          payload_json TEXT,
          payload_hash TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_offline_queue_journal_queue
          ON ${JOURNAL_TABLE} (queue_id, sequence);
        CREATE INDEX IF NOT EXISTS idx_offline_queue_journal_time
          ON ${JOURNAL_TABLE} (created_at);
      `);
      return db;
    });
  }
  return dbPromise;
};

const appendMemoryEvent = (
  eventType: QueueJournalEventType,
  queueId: string | null,
  payload: unknown
): void => {
  const payloadJson = payload === null || payload === undefined ? null : stableStringify(payload);
  memorySequence += 1;
  memoryJournal.push({
    sequence: memorySequence,
    event_type: eventType,
    queue_id: queueId,
    payload_json: payloadJson,
    payload_hash: payloadJson ? payloadHash(payloadJson) : null,
    created_at: new Date().toISOString(),
  });
};

export const appendOfflineQueueJournalEvent = async (
  eventType: QueueJournalEventType,
  queueId: string | null,
  payload?: unknown
): Promise<void> => {
  if (TEST_ENV) {
    appendMemoryEvent(eventType, queueId, payload ?? null);
    return;
  }

  const payloadJson = payload === null || payload === undefined ? null : stableStringify(payload);
  const db = await openJournalDb();
  await db.runAsync(
    `INSERT INTO ${JOURNAL_TABLE}
      (event_type, queue_id, payload_json, payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    eventType,
    queueId,
    payloadJson,
    payloadJson ? payloadHash(payloadJson) : null,
    new Date().toISOString()
  );
};

const validateJournalRow = (row: QueueJournalEvent): void => {
  if (!row.payload_json && !row.payload_hash) return;
  if (!row.payload_json || !row.payload_hash) {
    throw new Error(`Offline queue journal corruption at sequence ${row.sequence}`);
  }
  if (payloadHash(row.payload_json) !== row.payload_hash) {
    throw new Error(`Offline queue journal checksum mismatch at sequence ${row.sequence}`);
  }
};

const materializeQueue = (rows: QueueJournalEvent[]): OfflineQueueItem[] => {
  const queue = new Map<string, OfflineQueueItem>();

  for (const row of rows) {
    validateJournalRow(row);

    if (row.event_type === "clear") {
      queue.clear();
      continue;
    }

    const queueId = row.queue_id;
    if (!queueId) continue;

    if (row.event_type === "remove") {
      queue.delete(queueId);
      continue;
    }

    const payload = row.payload_json ? JSON.parse(row.payload_json) : null;
    if (row.event_type === "enqueue" || row.event_type === "replace") {
      queue.set(queueId, payload as OfflineQueueItem);
      continue;
    }

    if (row.event_type === "update") {
      const existing = queue.get(queueId);
      if (existing) {
        queue.set(queueId, { ...existing, ...(payload as Partial<OfflineQueueItem>) });
      }
    }
  }

  return Array.from(queue.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

export const readOfflineQueueJournal = async (): Promise<OfflineQueueItem[]> => {
  if (TEST_ENV) {
    return materializeQueue(memoryJournal);
  }
  const db = await openJournalDb();
  const rows = await db.getAllAsync<QueueJournalEvent>(
    `SELECT sequence, event_type, queue_id, payload_json, payload_hash, created_at
       FROM ${JOURNAL_TABLE}
      ORDER BY sequence ASC`
  );
  return materializeQueue(rows);
};

export const resetOfflineQueueJournal = async (): Promise<void> => {
  if (TEST_ENV) {
    memorySequence = 0;
    memoryJournal = [];
    return;
  }
  await appendOfflineQueueJournalEvent("clear", null, null);
};
