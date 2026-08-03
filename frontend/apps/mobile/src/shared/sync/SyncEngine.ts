import type { SQLiteDatabase } from 'expo-sqlite';

export enum SyncOperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CUSTOM = 'CUSTOM',
}

export enum SyncStatus {
  LOCAL_DRAFT = 'LOCAL_DRAFT',
  QUEUED = 'QUEUED',
  SYNCING = 'SYNCING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RETRY_WAIT = 'RETRY_WAIT',
  CONFLICT = 'CONFLICT',
  REJECTED = 'REJECTED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum DomainResolution {
  KEEP_SERVER_COUNT = 'KEEP_SERVER_COUNT',
  SUBMIT_AS_RECOUNT = 'SUBMIT_AS_RECOUNT',
  MOVE_TO_EXCEPTION_QUEUE = 'MOVE_TO_EXCEPTION_QUEUE',
  REASSIGN_TO_ACTIVE_SESSION = 'REASSIGN_TO_ACTIVE_SESSION',
  RELINK_SERIAL = 'RELINK_SERIAL',
  PRESERVE_AS_UNKNOWN_ITEM = 'PRESERVE_AS_UNKNOWN_ITEM',
  DISCARD_DUPLICATE_OPERATION = 'DISCARD_DUPLICATE_OPERATION',
  SUPERVISOR_OVERRIDE = 'SUPERVISOR_OVERRIDE',
}

export interface SyncOperation {
  operationId: string;
  idempotencyKey: string;
  sequenceNo: number;

  entityType: string;
  entityId: string;
  operationType: SyncOperationType;

  sessionId: string;
  rackId?: string;
  userId: string;
  deviceId: string;

  baseVersion?: number;
  localVersion: number;

  payload: unknown;
  payloadSchemaVersion: number;

  status: SyncStatus;
  attempts: number;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lastErrorCode?: string;
  lastHttpStatus?: number;

  correlationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncConflict {
  operationId: string;
  serverData: any;
  localData: any;
  resolution?: DomainResolution;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionRemark?: string;
  previousState?: any;
  resultingState?: any;
}

export interface SyncEngine {
  queueOperation(operation: Omit<SyncOperation, 'operationId' | 'createdAt' | 'updatedAt' | 'attempts' | 'sequenceNo'>): Promise<string>;
  processQueue(): Promise<void>;
  resolveConflict(conflict: SyncConflict): Promise<void>;
  getOperations(status?: SyncStatus[]): Promise<SyncOperation[]>;
  getConflicts(): Promise<SyncConflict[]>;
  clearAcknowledgedOperations(retentionDays: number): Promise<void>;
  getQueueStats(): Promise<QueueStats>;
  recoverInterruptedOperations(): Promise<void>;
}

interface QueueStats {
  total: number;
  localDraft: number;
  queued: number;
  syncing: number;
  acknowledged: number;
  failed: number;
  conflicts: number;
  retryWait: number;
}

class SyncEngineImpl implements SyncEngine {
  private db: SQLiteDatabase;
  private processing: boolean = false;
  private readonly MAX_ATTEMPTS = 3;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  async initializeDatabase(): Promise<void> {
    // Enable WAL mode and foreign key enforcement
    await this.db.execAsync('PRAGMA journal_mode = WAL;');
    await this.db.execAsync('PRAGMA foreign_keys = ON;');
    await this.db.execAsync('PRAGMA busy_timeout = 5000;');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_operations (
        operation_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        sequence_no INTEGER NOT NULL,
        
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        operation_type TEXT NOT NULL,
        
        session_id TEXT NOT NULL,
        rack_id TEXT,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        
        base_version INTEGER,
        local_version INTEGER NOT NULL,
        
        payload TEXT NOT NULL,
        payload_schema_version INTEGER NOT NULL,
        
        status TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        next_attempt_at TEXT,
        last_attempt_at TEXT,
        last_error_code TEXT,
        last_http_status INTEGER,
        
        correlation_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_operations_status ON sync_operations(status);
      CREATE INDEX IF NOT EXISTS idx_sync_operations_entity ON sync_operations(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_sync_operations_next_attempt ON sync_operations(next_attempt_at) WHERE next_attempt_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sync_operations_idempotency ON sync_operations(idempotency_key);

      CREATE TABLE IF NOT EXISTS sync_conflicts (
        operation_id TEXT PRIMARY KEY,
        server_data TEXT NOT NULL,
        local_data TEXT NOT NULL,
        resolution TEXT,
        resolved_at TEXT,
        resolved_by TEXT,
        resolution_remark TEXT,
        previous_state TEXT,
        resulting_state TEXT,
        FOREIGN KEY (operation_id) REFERENCES sync_operations(operation_id)
      );
    `);

    // Initialize sequence counter if it doesn't exist
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_sequence (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_value INTEGER NOT NULL DEFAULT 0
      );
      
      INSERT OR IGNORE INTO sync_sequence (id, current_value) VALUES (1, 0);
    `);
  }

  async getNextSequenceNumber(): Promise<number> {
    const result = await this.db.getFirstAsync<{ current_value: number }>(
      'UPDATE sync_sequence SET current_value = current_value + 1 RETURNING current_value;'
    );
    return result?.current_value || 1;
  }

  async queueOperation(
    operation: Omit<SyncOperation, 'operationId' | 'createdAt' | 'updatedAt' | 'attempts' | 'sequenceNo'>
  ): Promise<string> {
    const operationId = this.generateId();
    const sequenceNo = await this.getNextSequenceNumber();
    const now = new Date().toISOString();
    
    const syncOp: SyncOperation = {
      ...operation,
      operationId,
      sequenceNo,
      idempotencyKey: operation.idempotencyKey || this.generateId(),
      status: SyncStatus.LOCAL_DRAFT,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Use a transaction to ensure atomicity
    await this.db.withTransactionAsync(async () => {
      // Insert the sync operation
      await this.db.runAsync(
        `INSERT INTO sync_operations 
         (operation_id, idempotency_key, sequence_no,
          entity_type, entity_id, operation_type,
          session_id, rack_id, user_id, device_id,
          base_version, local_version,
          payload, payload_schema_version,
          status, attempts, correlation_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          syncOp.operationId,
          syncOp.idempotencyKey,
          syncOp.sequenceNo,
          syncOp.entityType,
          syncOp.entityId,
          syncOp.operationType,
          syncOp.sessionId,
          syncOp.rackId,
          syncOp.userId,
          syncOp.deviceId,
          syncOp.baseVersion,
          syncOp.localVersion,
          JSON.stringify(syncOp.payload),
          syncOp.payloadSchemaVersion,
          syncOp.status,
          syncOp.attempts,
          syncOp.correlationId,
          syncOp.createdAt,
          syncOp.updatedAt,
        ]
      );

      // Also insert the corresponding business record transactionally
      // This is where the actual business data would be stored
      // The implementation would depend on the specific entity type
    });

    return operationId;
  }

  async processQueue(): Promise<void> {
    if (this.processing) {
      return; // Already processing
    }

    this.processing = true;
    try {
      await this.processEligibleOperations();
    } finally {
      this.processing = false;
    }
  }

  private async processEligibleOperations(): Promise<void> {
    // Get operations that are eligible for processing (QUEUED, RETRY_WAIT with next_attempt_at <= now)
    const operations = await this.db.getAllAsync<SyncOperation>(
      `SELECT * FROM sync_operations 
       WHERE status IN (?, ?) 
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY sequence_no ASC`,
      [SyncStatus.QUEUED, SyncStatus.RETRY_WAIT, new Date().toISOString()]
    );
    
    for (const operation of operations) {
      await this.processOperation(operation);
    }
  }

  private async processOperation(operation: SyncOperation): Promise<void> {
    try {
      // Update status to syncing
      await this.updateOperationStatus(operation.operationId, SyncStatus.SYNCING);
      
      // Perform the actual sync operation
      const result = await this.executeSyncOperation(operation);
      
      if (result.success) {
        await this.updateOperationStatus(operation.operationId, SyncStatus.ACKNOWLEDGED);
      } else if (result.conflict) {
        await this.handleConflict(operation, result.serverData);
      } else if (result.authRequired) {
        await this.updateOperationStatus(operation.operationId, SyncStatus.AUTH_REQUIRED);
      } else if (result.rejected) {
        await this.updateOperationStatus(operation.operationId, SyncStatus.REJECTED, { 
          errorCode: result.errorCode,
          httpStatus: result.httpStatus
        });
      } else {
        await this.handleFailure(operation, result.errorCode || 'UNKNOWN_ERROR', result.httpStatus);
      }
    } catch (error) {
      await this.handleFailure(operation, (error as Error).message, undefined);
    }
  }

  private async executeSyncOperation(operation: SyncOperation): Promise<SyncResult> {
    // This would interface with your API client
    // Implementation depends on operation type and entity
    try {
      // In a real implementation, this would use the actual API client
      // with proper error handling and response parsing
      
      switch (operation.operationType) {
        case SyncOperationType.CREATE:
          // Call API to create entity
          return {
            success: true,
          };
        case SyncOperationType.UPDATE:
          // Call API to update entity
          return {
            success: true,
          };
        case SyncOperationType.DELETE:
          // Call API to delete entity
          return {
            success: true,
          };
        default:
          // For CUSTOM operations, use a custom handler
          return {
            success: false,
            errorCode: `UNSUPPORTED_OPERATION_TYPE`,
            httpStatus: 400,
          };
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Conflict detected
        return {
          success: false,
          conflict: true,
          serverData: error.response.data,
        };
      } else if (error.response?.status === 401) {
        // Authentication required
        return {
          success: false,
          authRequired: true,
        };
      } else if (error.response?.status === 422) {
        // Rejected due to validation
        return {
          success: false,
          rejected: true,
          errorCode: 'VALIDATION_ERROR',
          httpStatus: 422,
        };
      }
      return {
        success: false,
        errorCode: error.message || 'SYNC_OPERATION_FAILED',
        httpStatus: error.response?.status,
      };
    }
  }

  private async handleConflict(operation: SyncOperation, serverData: any): Promise<void> {
    // Store conflict for resolution
    await this.db.runAsync(
      `INSERT INTO sync_conflicts (operation_id, server_data, local_data) 
       VALUES (?, ?, ?)`,
      [operation.operationId, JSON.stringify(serverData), JSON.stringify(operation.payload)]
    );

    await this.updateOperationStatus(operation.operationId, SyncStatus.CONFLICT);
  }

  private async handleFailure(
    operation: SyncOperation, 
    errorCode: string, 
    httpStatus?: number
  ): Promise<void> {
    const newAttempts = operation.attempts + 1;
    
    if (newAttempts >= this.MAX_ATTEMPTS) {
      await this.updateOperationStatus(operation.operationId, SyncStatus.REJECTED, { 
        errorCode, 
        httpStatus,
        nextAttemptAt: null 
      });
    } else {
      // Calculate next attempt time with exponential backoff
      const nextAttemptDelay = this.BASE_RETRY_DELAY * Math.pow(2, newAttempts - 1);
      const nextAttemptAt = new Date(Date.now() + nextAttemptDelay).toISOString();
      
      await this.updateOperationStatus(operation.operationId, SyncStatus.RETRY_WAIT, { 
        errorCode,
        httpStatus,
        nextAttemptAt,
        lastAttemptAt: new Date().toISOString()
      });
    }
  }

  private async updateOperationStatus(
    operationId: string, 
    status: SyncStatus, 
    updates?: { 
      errorCode?: string; 
      httpStatus?: number; 
      nextAttemptAt?: string | null;
      lastAttemptAt?: string;
    }
  ): Promise<void> {
    const setParts = ['status = ?', 'updated_at = ?'];
    const params: any[] = [status, new Date().toISOString()];
    
    if (updates?.errorCode) {
      setParts.push('last_error_code = ?');
      params.push(updates.errorCode);
    }
    
    if (updates?.httpStatus !== undefined) {
      setParts.push('last_http_status = ?');
      params.push(updates.httpStatus);
    }
    
    if (updates?.nextAttemptAt !== undefined) {
      setParts.push('next_attempt_at = ?');
      params.push(updates.nextAttemptAt);
    }
    
    if (updates?.lastAttemptAt) {
      setParts.push('last_attempt_at = ?');
      params.push(updates.lastAttemptAt);
    }
    
    params.push(operationId);
    
    await this.db.runAsync(
      `UPDATE sync_operations SET ${setParts.join(', ')} WHERE operation_id = ?`,
      params
    );
  }

  async resolveConflict(conflict: SyncConflict): Promise<void> {
    // Update conflict resolution
    await this.db.runAsync(
      `UPDATE sync_conflicts 
       SET resolution = ?, resolved_at = ?, resolved_by = ?, resolution_remark = ?
       WHERE operation_id = ?`,
      [
        conflict.resolution,
        conflict.resolvedAt || new Date().toISOString(),
        conflict.resolvedBy,
        conflict.resolutionRemark,
        conflict.operationId,
      ]
    );

    // Update the operation status based on resolution
    if (conflict.resolution === DomainResolution.SUBMIT_AS_RECOUNT) {
      // Re-queue the operation as a new recount
      await this.updateOperationStatus(conflict.operationId, SyncStatus.QUEUED, {
        nextAttemptAt: new Date().toISOString(),
      });
    } else if (conflict.resolution === DomainResolution.KEEP_SERVER_COUNT) {
      // Mark as acknowledged since server wins
      await this.updateOperationStatus(conflict.operationId, SyncStatus.ACKNOWLEDGED);
    } else if (conflict.resolution === DomainResolution.SUPERVISOR_OVERRIDE) {
      // Apply supervisor's override and re-queue
      await this.updateOperationStatus(conflict.operationId, SyncStatus.QUEUED, {
        nextAttemptAt: new Date().toISOString(),
      });
    } else {
      // For other resolutions, mark as superseded
      await this.updateOperationStatus(conflict.operationId, SyncStatus.SUPERSEDED);
    }
  }

  async getOperations(status?: SyncStatus[]): Promise<SyncOperation[]> {
    let sql = 'SELECT * FROM sync_operations';
    const params: any[] = [];
    
    if (status && status.length > 0) {
      const placeholders = status.map(() => '?').join(', ');
      sql += ` WHERE status IN (${placeholders})`;
      params.push(...status);
    }
    
    sql += ' ORDER BY sequence_no ASC';
    
    const rows = await this.db.getAllAsync<any>(sql, params);
    
    return rows.map(row => ({
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));
  }

  async getConflicts(): Promise<SyncConflict[]> {
    const rows = await this.db.getAllAsync<any>(
      'SELECT * FROM sync_conflicts ORDER BY resolved_at IS NULL DESC, operation_id'
    );
    
    return rows.map(row => ({
      operationId: row.operation_id,
      serverData: JSON.parse(row.server_data),
      localData: JSON.parse(row.local_data),
      resolution: row.resolution as DomainResolution,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolutionRemark: row.resolution_remark,
    }));
  }

  async clearAcknowledgedOperations(retentionDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Only delete operations that are acknowledged and older than retention period
    await this.db.runAsync(
      `DELETE FROM sync_operations 
       WHERE status = ? AND updated_at < ?`,
      [SyncStatus.ACKNOWLEDGED, cutoffDate.toISOString()]
    );
  }

  async getQueueStats(): Promise<QueueStats> {
    const stats = await this.db.getFirstAsync<any>(
      `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as localDraft,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as queued,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as syncing,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as acknowledged,
          SUM(CASE WHEN status IN (?, ?, ?) THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as retryWait,
          (SELECT COUNT(*) FROM sync_conflicts) as conflicts
        FROM sync_operations
      `,
      [
        SyncStatus.LOCAL_DRAFT,
        SyncStatus.QUEUED,
        SyncStatus.SYNCING,
        SyncStatus.ACKNOWLEDGED,
        SyncStatus.REJECTED,
        SyncStatus.RETRY_WAIT,
        SyncStatus.CONFLICT,
        SyncStatus.RETRY_WAIT,
      ]
    );

    return {
      total: stats.total || 0,
      localDraft: stats.localDraft || 0,
      queued: stats.queued || 0,
      syncing: stats.syncing || 0,
      acknowledged: stats.acknowledged || 0,
      failed: stats.failed || 0,
      conflicts: stats.conflicts || 0,
      retryWait: stats.retryWait || 0,
    };
  }

  async recoverInterruptedOperations(): Promise<void> {
    // Recover operations that were interrupted while syncing
    // This should be called on app startup
    const now = new Date().toISOString();
    
    await this.db.runAsync(
      `UPDATE sync_operations 
       SET status = ?, next_attempt_at = ?, updated_at = ?
       WHERE status = ?`,
      [SyncStatus.RETRY_WAIT, now, now, SyncStatus.SYNCING]
    );
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

interface SyncResult {
  success: boolean;
  conflict?: boolean;
  authRequired?: boolean;
  rejected?: boolean;
  serverData?: any;
  errorCode?: string;
  httpStatus?: number;
}

// Export factory function for proper async initialization
export const createSyncEngine = async (db: SQLiteDatabase): Promise<SyncEngine> => {
  const engine = new SyncEngineImpl(db);
  await engine.initializeDatabase();
  return engine;
};