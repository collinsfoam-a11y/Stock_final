# Corrected Storage Implementation
## Platform-Agnostic Storage Architecture

### Problem Statement
- Original implementation leaked platform-specific imports into shared packages
- `expo-secure-store` and `@react-native-async-storage/async-storage` imported directly in shared code
- Web applications would crash due to `react-native` dependencies

### Solution Architecture

#### 1. Shared Storage Interface
```typescript
// packages/shared/storage.interface.ts
export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SecureStorage extends Storage {
  getSecureItem(key: string): Promise<string | null>;
  setSecureItem(key: string, value: string): Promise<void>;
  removeSecureItem(key: string): Promise<void>;
}
```

#### 2. Mobile Platform Implementation
```typescript
// apps/mobile/src/infra/storage/mobile-storage.ts
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SecureStorage } from '../../../../../packages/shared/storage.interface';

export class MobileSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    return await AsyncStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  }

  async getSecureItem(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(key);
  }

  async setSecureItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, {
      requireAuthentication: false // Configure as needed
    });
  }

  async removeSecureItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}
```

#### 3. Web Platform Implementation
```typescript
// apps/web-admin/src/infra/storage/web-storage.ts
import { SecureStorage } from '../../../../../packages/shared/storage.interface';

export class WebSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }

  async getSecureItem(key: string): Promise<string | null> {
    // For web, we'll use the same storage but could implement additional encryption
    return localStorage.getItem(key);
  }

  async setSecureItem(key: string, value: string): Promise<void> {
    // For web, we'll use the same storage but could implement additional encryption
    localStorage.setItem(key, value);
  }

  async removeSecureItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}
```

#### 4. Dependency Injection Container
```typescript
// apps/mobile/src/di/container.ts
import { MobileSecureStorage } from '../infra/storage/mobile-storage';
import { Storage } from '../../../../packages/shared/storage.interface';

export interface Dependencies {
  storage: Storage;
}

export class MobileDIContainer {
  private dependencies: Dependencies;

  constructor() {
    const storage = new MobileSecureStorage();

    this.dependencies = {
      storage,
    };
  }

  get<T extends keyof Dependencies>(key: T): Dependencies[T] {
    return this.dependencies[key];
  }
}

export const container = new MobileDIContainer();
```

### Validation of Platform Isolation

#### Before (Broken):
```typescript
// ❌ WRONG - Platform leakage in shared package
// packages/auth-services/storage/service.ts
import AsyncStorage from '@react-native-async-storage/async-storage'; // Platform-specific
import { Platform } from 'react-native'; // Platform-specific

class AuthStorageService {
  async getToken() {
    return await AsyncStorage.getItem('token'); // Breaks on web
  }
}
```

#### After (Correct):
```typescript
// ✅ CORRECT - Platform isolation maintained
// packages/shared/auth.interface.ts
export interface AuthRepository {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

// apps/mobile/src/infra/auth/mobile-auth.repository.ts
import * as SecureStore from 'expo-secure-store';
import { AuthRepository } from '../../../../packages/shared/auth.interface';

export class MobileAuthRepository implements AuthRepository {
  async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('auth_token');
  }

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync('auth_token', token);
  }

  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync('auth_token');
  }
}

// apps/web-admin/src/infra/auth/web-auth.repository.ts
import { AuthRepository } from '../../../../packages/shared/auth.interface';

export class WebAuthRepository implements AuthRepository {
  async getToken(): Promise<string | null> {
    return localStorage.getItem('auth_token');
  }

  async setToken(token: string): Promise<void> {
    localStorage.setItem('auth_token', token);
  }

  async clearToken(): Promise<void> {
    localStorage.removeItem('auth_token');
  }
}
```

This implementation ensures complete platform isolation while maintaining clean dependency injection patterns.