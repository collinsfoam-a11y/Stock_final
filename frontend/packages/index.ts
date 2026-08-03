// Export shared interfaces and types
export type { 
  Storage, 
  SecureStorage
  // Note: AuthStorage is not defined in storage.interface.ts, so we're excluding it
} from './shared/storage/storage.interface';

export type { 
  HttpClient,
  HttpResponse 
} from './shared/network/network.interface';

export type { 
  Scanner, 
  ScanResult,
  ScannerType 
} from './shared/scanner/scanner.interface';

export type { 
  SyncEngine, 
  SyncOperation, 
  SyncOperationType, 
  SyncStatus,
  SyncConflict,
  QueueStats
} from './shared/sync/sync.interface';