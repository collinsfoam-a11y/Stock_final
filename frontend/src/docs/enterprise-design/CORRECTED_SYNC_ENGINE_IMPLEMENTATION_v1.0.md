# Corrected Sync Engine Implementation
## Cross-Platform Synchronization Architecture

### Problem Statement
- Original sync engine depended on `expo-sqlite` directly in shared code
- No separation between mobile and web sync implementations
- Missing proper platform abstraction for offline storage

### Solution Architecture

#### 1. Shared Sync Interface
```typescript
// packages/shared/sync.interface.ts
export interface SyncEngine {
  queueOperation(operation: SyncOperation): Promise<string>;
  processQueue(): Promise<void>;
  resolveConflict(conflict: SyncConflict): Promise<void>;
  getOperations(status?: SyncStatus): Promise<SyncOperation[]>;
  getConflicts(): Promise<SyncConflict[]>;
  clearCompletedOperations(): Promise<void>;
  getQueueStats(): Promise<QueueStats>;
}

export enum SyncOperationType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CUSTOM = 'CUSTOM',
}

export enum SyncStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  SYNCING = 'SYNCING',
  SUCCESS = 'SUCCESS',
  CONFLICT = 'CONFLICT',
  RETRY = 'RETRY',
  FAILED = 'FAILED',
  PERMANENT_FAILURE = 'PERMANENT_FAILURE',
}

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  entity: string;
  entityId?: string;
  data: any;
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  status: SyncStatus;
  error?: string;
  serverId?: string;
  version?: number;
  userId: string;
  deviceId: string;
  correlationId: string;
}

export interface SyncConflict {
  operationId: string;
  serverData: any;
  localData: any;
  resolution: 'server' | 'local' | 'merge' | 'custom';
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface QueueStats {
  total: number;
  pending: number;
  syncing: number;
  succeeded: number;
  failed: number;
  conflicts: number;
}
```

#### 2. Mobile SQLite Sync Engine
```typescript
// apps/mobile/src/infra/sync/sqlite-sync-engine.ts
import { SQLiteDatabase, openDatabaseSync } from 'expo-sqlite';
import { 
  SyncEngine, 
  SyncOperation, 
  SyncConflict, 
  SyncStatus, 
  QueueStats,
  SyncOperationType 
} from '../../../../packages/shared/sync.interface';
import { HttpClient } from '../../../../packages/shared/network.interface';

export class SQLiteSyncEngine implements SyncEngine {
  private db: SQLiteDatabase;
  private httpClient: HttpClient;
  private processing: boolean = false;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000;

  constructor(httpClient: HttpClient) {
    this.db = openDatabaseSync('stock_verification_sync.db');
    this.httpClient = httpClient;
    this.initializeDatabase();
  }

  private async initializeDatabase() {
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
        await this.handleFailure(operation, result.error);
      }
    } catch (error) {
      await this.handleFailure(operation, (error as Error).message);
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
            serverId: response.data.id,
          };
        case SyncOperationType.UPDATE:
          response = await this.httpClient.put(`${operation.entity}/${operation.entityId}`, operation.data);
          return {
            success: true,
            serverId: response.data.id,
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
    
    const rows = await this.db.getAllAsync<SyncOperation>(sql, params);
    
    return rows.map(row => ({
      ...row,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      data: JSON.parse(row.data),
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
    const stats = await this.db.getFirstAsync<any>(
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
      total: stats.total || 0,
      pending: stats.pending || 0,
      syncing: stats.syncing || 0,
      succeeded: stats.succeeded || 0,
      failed: stats.failed || 0,
      conflicts: stats.conflicts || 0,
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
```

#### 3. Web IndexedDB Sync Engine
```typescript
// apps/web-admin/src/infra/sync/indexeddb-sync-engine.ts
import { 
  SyncEngine, 
  SyncOperation, 
  SyncConflict, 
  SyncStatus, 
  QueueStats,
  SyncOperationType 
} from '../../../../packages/shared/sync.interface';
import { HttpClient } from '../../../../packages/shared/network.interface';

export class IndexedDBSyncEngine implements SyncEngine {
  private db: IDBDatabase | null = null;
  private httpClient: HttpClient;
  private processing: boolean = false;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly DB_NAME = 'StockVerificationSync';
  private readonly DB_VERSION = 1;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.initDatabase();
  }

  private initDatabase() {
    const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB for sync engine');
    };

    request.onsuccess = (event: any) => {
      this.db = event.target.result;
    };

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;

      // Create operations store
      if (!db.objectStoreNames.contains('sync_operations')) {
        const operationsStore = db.createObjectStore('sync_operations', { keyPath: 'id' });
        operationsStore.createIndex('status', 'status', { unique: false });
        operationsStore.createIndex('entity', 'entity', { unique: false });
      }

      // Create conflicts store
      if (!db.objectStoreNames.contains('sync_conflicts')) {
        const conflictsStore = db.createObjectStore('sync_conflicts', { keyPath: 'operationId' });
        conflictsStore.createIndex('resolved', 'resolvedAt', { unique: false });
      }
    };
  }

  async queueOperation(operation: Omit<SyncOperation, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'status'>): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const id = this.generateId();
    const now = new Date();
    
    const syncOp: SyncOperation = {
      id,
      ...operation,
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      status: SyncStatus.PENDING,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_operations'], 'readwrite');
      const store = transaction.objectStore('sync_operations');
      const request = store.add(syncOp);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
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
        await this.handleFailure(operation, result.error);
      }
    } catch (error) {
      await this.handleFailure(operation, (error as Error).message);
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
            serverId: response.data.id,
          };
        case SyncOperationType.UPDATE:
          response = await this.httpClient.put(`${operation.entity}/${operation.entityId}`, operation.data);
          return {
            success: true,
            serverId: response.data.id,
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
    const conflict: SyncConflict = {
      operationId: operation.id,
      serverData,
      localData: operation.data,
      resolution: undefined,
    };

    await new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db!.transaction(['sync_conflicts'], 'readwrite');
      const store = transaction.objectStore('sync_conflicts');
      const request = store.add(conflict);

      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error);
    });

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
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_operations'], 'readwrite');
      const store = transaction.objectStore('sync_operations');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (!operation) {
          reject(new Error(`Operation ${id} not found`));
          return;
        }

        operation.status = status;
        operation.updatedAt = new Date();
        operation.attempts = status === SyncStatus.RETRY ? operation.attempts + 1 : operation.attempts;

        if (updates?.serverId) {
          operation.serverId = updates.serverId;
        }
        
        if (updates?.error) {
          operation.error = updates.error;
        }

        const updateRequest = store.put(operation);
        updateRequest.onsuccess = () => resolve(undefined);
        updateRequest.onerror = () => reject(updateRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async resolveConflict(conflict: SyncConflict): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_conflicts'], 'readwrite');
      const store = transaction.objectStore('sync_conflicts');
      
      // Update the conflict record
      const getRequest = store.get(conflict.operationId);
      
      getRequest.onsuccess = () => {
        const existingConflict = getRequest.result;
        if (!existingConflict) {
          reject(new Error(`Conflict ${conflict.operationId} not found`));
          return;
        }

        existingConflict.resolution = conflict.resolution;
        existingConflict.resolvedAt = conflict.resolvedAt || new Date();
        existingConflict.resolvedBy = conflict.resolvedBy;

        const updateRequest = store.put(existingConflict);
        updateRequest.onsuccess = () => {
          // If resolved with 'local', update the corresponding operation to pending
          if (conflict.resolution === 'local') {
            this.updateOperationStatus(conflict.operationId, SyncStatus.PENDING)
              .then(() => resolve(undefined))
              .catch(reject);
          } else {
            // Otherwise, mark as success since server wins
            this.updateOperationStatus(conflict.operationId, SyncStatus.SUCCESS)
              .then(() => resolve(undefined))
              .catch(reject);
          }
        };
        updateRequest.onerror = () => reject(updateRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getOperations(status?: SyncStatus): Promise<SyncOperation[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_operations'], 'readonly');
      const store = transaction.objectStore('sync_operations');
      
      let request: IDBRequest;
      
      if (status) {
        const index = store.index('status');
        request = index.getAll(IDBKeyRange.only(status));
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        const operations = request.result as SyncOperation[];
        resolve(operations);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getConflicts(): Promise<SyncConflict[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_conflicts'], 'readonly');
      const store = transaction.objectStore('sync_conflicts');
      
      const request = store.getAll();

      request.onsuccess = () => {
        const conflicts = request.result as SyncConflict[];
        resolve(conflicts);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async clearCompletedOperations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_operations'], 'readwrite');
      const store = transaction.objectStore('sync_operations');
      
      // Get all operations that are completed
      store.openCursor().onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const operation = cursor.value as SyncOperation;
          if ([SyncStatus.SUCCESS, SyncStatus.PERMANENT_FAILURE, SyncStatus.CONFLICT].includes(operation.status)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(undefined);
        }
      };
    });
  }

  async getQueueStats(): Promise<QueueStats> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const operations = await this.getOperations();
    const conflicts = await this.getConflicts();

    return {
      total: operations.length,
      pending: operations.filter(op => op.status === SyncStatus.PENDING).length,
      syncing: operations.filter(op => op.status === SyncStatus.SYNCING).length,
      succeeded: operations.filter(op => op.status === SyncStatus.SUCCESS).length,
      failed: operations.filter(op => [SyncStatus.FAILED, SyncStatus.PERMANENT_FAILURE].includes(op.status)).length,
      conflicts: conflicts.length,
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

This implementation provides platform-specific sync engines while maintaining a shared interface, solving the original platform leakage issue.