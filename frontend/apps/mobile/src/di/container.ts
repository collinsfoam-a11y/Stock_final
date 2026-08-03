import { MobileSecureStorage } from '../infra/storage/mobile-storage';
import { SQLiteSyncEngine } from '../infra/sync/sqlite-sync-engine';
import { KeyboardWedgeScanner } from '../infra/scanner/bluetooth-hid-scanner';
import { Storage } from '../../../../packages/shared/storage/storage.interface';
import { SyncEngine } from '../../../../packages/shared/sync/sync.interface';
import { Scanner } from '../../../../packages/shared/scanner/scanner.interface';

// Mock HTTP client implementation for now - would be replaced with actual implementation
class MockHttpClient {
  async get<T>(url: string) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async post<T>(url: string, data?: any) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async put<T>(url: string, data?: any) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async patch<T>(url: string, data?: any) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async delete<T>(url: string) { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
}

export interface Dependencies {
  storage: Storage;
  syncEngine: SyncEngine;
  scanner: Scanner;
}

import { Platform } from 'react-native';

export class MobileDIContainer {
  readonly dependencies: Dependencies;  // Make it readonly and public

  constructor() {
    const httpClient = new MockHttpClient() as any;
    const storage = Platform.OS === 'web' ? ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } as any) : new MobileSecureStorage();
    const syncEngine = Platform.OS === 'web' ? ({ processQueue: async () => {}, queueOperation: async () => '' } as any) : new SQLiteSyncEngine(httpClient);
    const scanner = new KeyboardWedgeScanner(); // Using keyboard-wedge as primary for warehouse

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
export const container = new MobileDIContainer();