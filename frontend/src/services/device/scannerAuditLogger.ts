import * as SQLite from "expo-sqlite";
import { createLogger } from "../logging";

const log = createLogger("scannerAuditLogger");

export type AuditEventType =
  | "CONFIG_APPLIED"
  | "SIGNATURE_FAILED"
  | "SIGNATURE_EXPIRED"
  | "DOWNGRADE_REJECTED"
  | "VALIDATION_FAILED"
  | "ROLLBACK_TRIGGERED"
  | "HEALTH_CHECK_FAILED"
  | "BLACKLISTED";

export interface ScannerAuditEvent {
  id?: number;
  timestamp: number;
  event_type: AuditEventType;
  version: number;
  error_details: string;
  configuration_id?: string;
}

export class ScannerAuditLogger {
  private static instance: ScannerAuditLogger;
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ScannerAuditLogger {
    if (!ScannerAuditLogger.instance) {
      ScannerAuditLogger.instance = new ScannerAuditLogger();
    }
    return ScannerAuditLogger.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await SQLite.openDatabaseAsync("scanner_audit_log.db");
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS scanner_audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          version INTEGER NOT NULL,
          error_details TEXT NOT NULL,
          configuration_id TEXT
        );
      `);
      this.isInitialized = true;
      log.info("Scanner Audit Logger initialized");
    } catch (e) {
      log.error("Failed to initialize scanner audit logger database", e);
    }
  }

  public async logEvent(
    eventType: AuditEventType,
    version: number,
    errorDetails: string = "",
    configurationId?: string
  ): Promise<void> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }
    if (!this.db) return;

    try {
      await this.db.runAsync(
        "INSERT INTO scanner_audit_events (timestamp, event_type, version, error_details, configuration_id) VALUES (?, ?, ?, ?, ?)",
        [Date.now(), eventType, version, errorDetails, configurationId ?? null]
      );
      log.info(`Audit Log: [${eventType}] Version ${version}`, { errorDetails, configurationId });
    } catch (e) {
      log.error("Failed to insert scanner audit event", e);
    }
  }

  public async getAggregatedMetrics(): Promise<Record<string, number>> {
    if (!this.isInitialized || !this.db) return {};

    try {
      const results = await this.db.getAllAsync<{ event_type: string; count: number }>(
        "SELECT event_type, COUNT(*) as count FROM scanner_audit_events GROUP BY event_type"
      );
      
      const metrics: Record<string, number> = {};
      for (const row of results) {
        metrics[row.event_type] = row.count;
      }
      return metrics;
    } catch (e) {
      log.error("Failed to aggregate scanner audit metrics", e);
      return {};
    }
  }
}
