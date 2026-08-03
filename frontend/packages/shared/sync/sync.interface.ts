export interface SyncEngine {
  queueOperation(operation: Omit<SyncOperation, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'status'>): Promise<string>;
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