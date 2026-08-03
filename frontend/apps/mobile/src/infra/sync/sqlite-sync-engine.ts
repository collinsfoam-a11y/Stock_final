import { SQLiteDatabase, openDatabaseAsync } from 'expo-sqlite';
import { 
  SyncEngine, 
  SyncOperation, 
  SyncConflict, 
  SyncStatus, 
  QueueStats,
  SyncOperationType 
} from '../../../../../packages/shared/sync/sync.interface';
import { HttpClient } from '../../../../../packages/shared/network/network.interface';

export class SQLiteSyncEngine implements SyncEngine {
  private db!: SQLiteDatabase;
  private httpClient: HttpClient;
  private processing: boolean = false;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    this.db = await openDatabaseAsync('stock_verification_sync.db');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error TEXT,
        server_id TEXT,
        version INTEGER,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_operations_status ON sync_operations(status);
      CREATE INDEX IF NOT EXISTS idx_sync_operations_entity ON sync_operations(entity, entity_id);

      CREATE TABLE IF NOT EXISTS sync_conflicts (
        operation_id TEXT PRIMARY KEY,
        server_data TEXT NOT NULL,
        local_data TEXT NOT NULL,
        resolution TEXT,
        resolved_at TEXT,
        resolved_by TEXT
      );
    `);
  }

  async queueOperation(operation: Omit<SyncOperation, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'status'>): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const syncOp: SyncOperation = {
      id,
      ...operation,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      attempts: 0,
      status: SyncStatus.PENDING,
    };

    await this.db.runAsync(
      `INSERT INTO sync_operations 
       (id, type, entity, entity_id, data, created_at, updated_at, attempts, status, user_id, device_id, correlation_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        syncOp.id,
        syncOp.type,
        syncOp.entity,
        syncOp.entityId,
        JSON.stringify(syncOp.data),
        syncOp.createdAt.toISOString(),
        syncOp.updatedAt.toISOString(),
        syncOp.attempts,
        syncOp.status,
        syncOp.userId,
        syncOp.deviceId,
        syncOp.correlationId,
      ]
    );

    return id;
  }

  async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      await this.processPendingOperations();
    } finally {
      this.processing = false;
    }
  }

  private async processPendingOperations(): Promise<void> {
    const operations = await this.getOperations(SyncStatus.PENDING);
    
    for (const operation of operations) {
      await this.processOperation(operation);
    }
  }

  private async processOperation(operation: SyncOperation): Promise<void> {
    try {
      await this.updateOperationStatus(operation.id, SyncStatus.SYNCING);
      
      const result = await this.executeSyncOperation(operation);
      
      if (result.success) {
        await this.updateOperationStatus(operation.id, SyncStatus.SUCCESS, { serverId: result.serverId });
      } else if (result.conflict) {
        await this.handleConflict(operation, result.serverData);
      } else {
        const error = result.error || 'Unknown error';
        await this.handleFailure(operation, error);
      }
    } catch (error) {
      const errorMessage = (error as Error).message || 'Unknown error';
      await this.handleFailure(operation, errorMessage);
    }
  }

  private async executeSyncOperation(operation: SyncOperation): Promise<SyncResult> {
    try {
      let response;
      
      switch (operation.type) {
        case SyncOperationType.CREATE:
          response = await this.httpClient.post(operation.entity, operation.data);
          return {
            success: true,
            serverId: (response.data as any)?.id,
          };
        case SyncOperationType.UPDATE:
          response = await this.httpClient.put(`${operation.entity}/${operation.entityId}`, operation.data);
          return {
            success: true,
            serverId: (response.data as any)?.id,
          };
        case SyncOperationType.DELETE:
          await this.httpClient.delete(`${operation.entity}/${operation.entityId}`);
          return {
            success: true,
          };
        default:
          return {
            success: false,
            error: `Unsupported operation type: ${operation.type}`,
          };
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        return {
          success: false,
          conflict: true,
          serverData: error.response.data,
        };
      }
      return {
        success: false,
        error: error.message || 'Sync operation failed',
      };
    }
  }

  private async handleConflict(operation: SyncOperation, serverData: any): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sync_conflicts (operation_id, server_data, local_data, resolution, resolved_at, resolved_by) 
       VALUES (?, ?, ?, NULL, NULL, NULL)`,
      [operation.id, JSON.stringify(serverData), JSON.stringify(operation.data)]
    );

    await this.updateOperationStatus(operation.id, SyncStatus.CONFLICT);
  }

  private async handleFailure(operation: SyncOperation, error: string): Promise<void> {
    const newAttempts = operation.attempts + 1;
    
    if (newAttempts >= this.MAX_ATTEMPTS) {
      await this.updateOperationStatus(operation.id, SyncStatus.PERMANENT_FAILURE, { error });
    } else {
      await this.updateOperationStatus(operation.id, SyncStatus.RETRY, { error });
      // Schedule retry after delay
      setTimeout(() => {
        this.processQueue().catch(console.error);
      }, this.RETRY_DELAY * Math.pow(2, newAttempts)); // Exponential backoff
    }
  }

  private async updateOperationStatus(id: string, status: SyncStatus, updates?: { serverId?: string; error?: string }): Promise<void> {
    const setClause = [];
    const params = [];
    
    setClause.push('status = ?');
    params.push(status);
    
    setClause.push('updated_at = ?');
    params.push(new Date().toISOString());
    
    if (updates?.serverId) {
      setClause.push('server_id = ?');
      params.push(updates.serverId);
    }
    
    if (updates?.error) {
      setClause.push('error = ?');
      params.push(updates.error);
    }
    
    params.push(id);
    
    await this.db.runAsync(
      `UPDATE sync_operations SET ${setClause.join(', ')} WHERE id = ?`,
      params
    );
  }

  async resolveConflict(conflict: SyncConflict): Promise<void> {
    await this.db.runAsync(
      `UPDATE sync_conflicts 
       SET resolution = ?, resolved_at = ?, resolved_by = ? 
       WHERE operation_id = ?`,
      [
        conflict.resolution,
        conflict.resolvedAt?.toISOString() || new Date().toISOString(),
        conflict.resolvedBy,
        conflict.operationId,
      ]
    );

    if (conflict.resolution === 'local') {
      await this.updateOperationStatus(conflict.operationId, SyncStatus.PENDING);
    } else {
      await this.updateOperationStatus(conflict.operationId, SyncStatus.SUCCESS);
    }
  }

  async getOperations(status?: SyncStatus): Promise<SyncOperation[]> {
    let sql = 'SELECT * FROM sync_operations';
    const params: any[] = [];
    
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at ASC';
    
    const rows: any[] = await this.db.getAllAsync(sql, params);
    
    return rows.map(row => ({
      ...row,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      data: JSON.parse(row.data),
    }));
  }

  async getConflicts(): Promise<SyncConflict[]> {
    const rows: any[] = await this.db.getAllAsync(
      'SELECT * FROM sync_conflicts ORDER BY resolved_at IS NULL DESC, operation_id'
    );
    
    return rows.map(row => ({
      operationId: row.operation_id,
      serverData: JSON.parse(row.server_data),
      localData: JSON.parse(row.local_data),
      resolution: row.resolution as any,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolvedBy: row.resolved_by,
    }));
  }

  async clearCompletedOperations(): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM sync_operations WHERE status IN (?, ?, ?)',
      [SyncStatus.SUCCESS, SyncStatus.PERMANENT_FAILURE, SyncStatus.CONFLICT]
    );
  }

  async getQueueStats(): Promise<QueueStats> {
    const result: any = await this.db.getFirstAsync(
      `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as syncing,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as succeeded,
          SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) as failed,
          (SELECT COUNT(*) FROM sync_conflicts) as conflicts
        FROM sync_operations
      `,
      [
        SyncStatus.PENDING,
        SyncStatus.SYNCING,
        SyncStatus.SUCCESS,
        SyncStatus.FAILED,
        SyncStatus.PERMANENT_FAILURE,
      ]
    );

    return {
      total: result.total || 0,
      pending: result.pending || 0,
      syncing: result.syncing || 0,
      succeeded: result.succeeded || 0,
      failed: result.failed || 0,
      conflicts: result.conflicts || 0,
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

interface SyncResult {
  success: boolean;
  conflict?: boolean;
  serverData?: any;
  serverId?: string;
  error?: string;
}