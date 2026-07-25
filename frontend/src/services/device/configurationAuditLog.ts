import * as SQLite from "expo-sqlite";
import { createLogger } from "../logging";

const log = createLogger("configurationAuditLog");

export type AuditEventCategory = 
  | "applied" 
  | "validation_failure" 
  | "rollback" 
  | "checksum_failure" 
  | "signature_failure" 
  | "downgrade_attempt" 
  | "app_compatibility_failure";

export interface ConfigurationAuditEvent {
  id?: number;
  timestamp: number;
  category: AuditEventCategory;
  version: number;
  reason: string;
}

/**
 * SQLite-backed audit log for configuration lifecycle events.
 * Keeps local history for forensic analysis, while exposing aggregated
 * summaries for remote syncing.
 */
export class ConfigurationAuditLog {
  private static instance: ConfigurationAuditLog;
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ConfigurationAuditLog {
    if (!ConfigurationAuditLog.instance) {
      ConfigurationAuditLog.instance = new ConfigurationAuditLog();
    }
    return ConfigurationAuditLog.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await SQLite.openDatabaseAsync("audit_log.db");
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS config_audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          category TEXT NOT NULL,
          version INTEGER NOT NULL,
          reason TEXT NOT NULL
        );
      `);
      this.isInitialized = true;
      log.info("Configuration Audit Log initialized");
    } catch (e) {
      log.error("Failed to initialize audit log database", e);
    }
  }

  public async logEvent(category: AuditEventCategory, version: number, reason: string = ""): Promise<void> {
    if (!this.isInitialized || !this.db) {
      await this.initialize();
    }
    if (!this.db) return;

    try {
      await this.db.runAsync(
        "INSERT INTO config_audit_events (timestamp, category, version, reason) VALUES (?, ?, ?, ?)",
        [Date.now(), category, version, reason]
      );
      log.info(`Audit Log: [${category}] Version ${version}`, { reason });
    } catch (e) {
      log.error("Failed to insert audit event", e);
    }
  }

  /**
   * Generates a high-level summary of recent operational events for sync.
   * Cleans up synced counts to avoid duplicate reporting (simplified for now).
   */
  public async getAggregatedMetrics(): Promise<Record<string, number>> {
    if (!this.isInitialized || !this.db) return {};

    try {
      const results = await this.db.getAllAsync<{ category: string, count: number }>(
        "SELECT category, COUNT(*) as count FROM config_audit_events GROUP BY category"
      );
      
      const metrics: Record<string, number> = {};
      for (const row of results) {
        metrics[row.category] = row.count;
      }
      return metrics;
    } catch (e) {
      log.error("Failed to aggregate audit metrics", e);
      return {};
    }
  }
}
