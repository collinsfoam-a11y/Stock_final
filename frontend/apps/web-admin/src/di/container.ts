import { WebSecureStorage } from '../infra/storage/web-storage';
import { IndexedDBSyncEngine } from '../infra/sync/indexeddb-sync-engine';
import { Scanner } from '../../../../packages/shared/scanner/scanner.interface'; // Placeholder
import { Storage } from '../../../../packages/shared/storage/storage.interface';
import { SyncEngine } from '../../../../packages/shared/sync/sync.interface';

// Mock HTTP client implementation for now - would be replaced with actual implementation
class MockHttpClient {
  async get<T>(url: string) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async post<T>(url: string, data?: any) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async put<T>(url: string, data?: any) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async patch<T>(url: string, data?: any) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async delete<T>(url: string) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
}

// Placeholder scanner implementation for web
class WebScanner implements Scanner {
  private callbacks: { 
    onScan?: (result: any) => void, 
    onError?: (error: Error) => void 
  } = {};
  
  async startScanning(): Promise<void> {}
  async stopScanning(): Promise<void> {}
  onScan(callback: (result: any) => void): void { this.callbacks.onScan = callback; }
  onError(callback: (error: Error) => void): void { this.callbacks.onError = callback; }
  isScanning(): boolean { return false; }
}

export interface Dependencies {
  storage: Storage;
  syncEngine: SyncEngine;
  scanner: Scanner;
}

export class WebDIContainer {
  readonly dependencies: Dependencies;  // Make it readonly and public

  constructor() {
    const httpClient = new MockHttpClient() as any;
    const storage = new WebSecureStorage();
    const syncEngine = new IndexedDBSyncEngine(httpClient);
    const scanner = new WebScanner();

    this.dependencies = {
      storage,
      syncEngine,
      scanner,
    };
  }

  get<T extends keyof Dependencies>(key: T): Dependencies[T] {
    return this.dependencies[key];
  }
}

// Global container instance
export const container = new WebDIContainer();