# Unified Cross-Platform Architecture
## Stock Verification Application

### Executive Summary

This document presents a production-ready, unified architecture that properly separates platform concerns while maintaining shared business logic. The architecture addresses critical platform leakage issues and implements proper dependency injection to ensure shared packages remain platform-agnostic.

### Architecture Overview

```
packages/
├── core/               # Pure business logic (no platform deps)
├── shared/             # Shared interfaces and logic
│   ├── auth/          # Authentication interfaces
│   ├── sync/          # Sync interfaces
│   ├── storage/       # Storage interfaces
│   ├── network/       # Network interfaces
│   └── scanner/       # Scanner interfaces
└── ui-components/     # Platform-agnostic UI components

apps/
├── mobile/            # React Native app
│   ├── src/infra/
│   │   ├── storage/
│   │   ├── network/
│   │   ├── scanner/
│   │   └── sync/
│   └── di/
├── web-admin/         # Web admin application
│   ├── src/infra/
│   │   ├── storage/
│   │   ├── network/
│   │   └── sync/
│   └── di/
└── web-staff/         # Web staff application (future)
```

### Critical Issue Resolution

#### 1. Platform Leakage Fix
- **Problem**: Shared packages importing `react-native` directly
- **Solution**: Shared packages only define interfaces, platform-specific implementations in app folders
- **Implementation**: Dependency injection at app level

#### 2. Storage Abstraction
```typescript
// packages/shared/storage.interface.ts
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

// apps/mobile/src/infra/storage.ts
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Storage } from '../../../packages/shared/storage.interface';

export class MobileStorage implements Storage {
  async getItem(key: string): Promise<string | null> {
    return await AsyncStorage.getItem(key);
  }
  
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }
  
  // ... other methods
}
```

#### 3. Dual Sync Engine Strategy
- **Mobile**: SQLite-based sync engine using `expo-sqlite`
- **Web**: IndexedDB-based sync engine using Web APIs
- **Interface**: Shared `SyncEngine` interface implemented by both

#### 4. Scanner Priority Correction
- **Primary**: Bluetooth HID scanners (Zebra, Honeywell) for warehouse environments
- **Fallback**: Camera-based scanning
- **Implementation**: Scanner factory selecting appropriate implementation

#### 5. Security Implementation
- **Real Encryption**: Proper AES encryption using `expo-crypto` and secure key storage
- **Certificate Pinning**: SSL pinning for API communications
- **Biometric Auth**: Integration with platform biometric systems

### Platform-Specific Implementations

#### Mobile (React Native)
- SQLite for local data storage
- Bluetooth HID for primary scanning
- SecureStore for sensitive data
- Background fetch for sync

#### Web (Admin Portal)
- IndexedDB for local data storage
- Camera API for scanning
- localStorage/sessionStorage for data
- Service Worker for background sync

### Dependency Injection Pattern

```typescript
// apps/mobile/di/container.ts
import { MobileStorage } from './src/infra/storage';
import { SQLiteSyncEngine } from './src/infra/sync';
import { MobileScanner } from './src/infra/scanner';

export class DIContainer {
  private storage: Storage;
  private syncEngine: SyncEngine;
  private scanner: Scanner;
  
  constructor() {
    this.storage = new MobileStorage();
    this.syncEngine = new SQLiteSyncEngine();
    this.scanner = new MobileScanner();
  }
  
  get<T>(service: string): T {
    return this[service as keyof this] as T;
  }
}
```

This architecture resolves all critical issues while maintaining clean separation of concerns.