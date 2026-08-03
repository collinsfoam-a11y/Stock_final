import { 
  SyncEngine, 
  SyncOperation, 
  SyncConflict, 
  SyncStatus, 
  QueueStats,
  SyncOperationType 
} from '../../../../../packages/shared/sync/sync.interface';
import { HttpClient } from '../../../../../packages/shared/network/network.interface';

// Define a type that includes undefined for initial state
type ConflictResolution = 'server' | 'local' | 'merge' | 'custom' | undefined;

interface IndexedDBSyncConflict {
  operationId: string;
  serverData: any;
  localData: any;
  resolution: ConflictResolution;
  resolvedAt?: Date;
  resolvedBy?: string;
}

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
    const conflict: IndexedDBSyncConflict = {
      operationId: operation.id,
      serverData,
      localData: operation.data,
      resolution: undefined, // Allow undefined initially
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
        resolve(operations.map(op => ({
          ...op,
          createdAt: op.createdAt instanceof Date ? op.createdAt : new Date(op.createdAt),
          updatedAt: op.updatedAt instanceof Date ? op.updatedAt : new Date(op.updatedAt),
        })));
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
        const conflicts = request.result as IndexedDBSyncConflict[];
        // Convert to the expected SyncConflict type
        const convertedConflicts: SyncConflict[] = conflicts.map(c => ({
          operationId: c.operationId,
          serverData: c.serverData,
          localData: c.localData,
          resolution: (c.resolution || 'server') as 'server' | 'local' | 'merge' | 'custom',
          resolvedAt: c.resolvedAt,
          resolvedBy: c.resolvedBy,
        }));
        resolve(convertedConflicts);
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

interface SyncResult {
  success: boolean;
  conflict?: boolean;
  serverData?: any;
  serverId?: string;
  error?: string;
}