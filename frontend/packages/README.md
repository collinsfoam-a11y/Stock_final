# Stock Verification - Shared Packages

This directory contains the shared packages for the Stock Verification application, following a multi-platform architecture that properly separates platform concerns while maintaining shared business logic.

## Architecture Overview

```
packages/
├── core/
│   ├── domain/          # Pure business logic (no platform deps)
│   ├── entities/        # Entity definitions
│   ├── repositories/    # Repository interfaces
│   └── use-cases/       # Use case implementations
├── shared/
│   ├── auth/           # Authentication interfaces & shared logic
│   ├── sync/           # Sync interfaces & shared logic
│   ├── storage/        # Storage interfaces
│   ├── network/        # Network interfaces
│   ├── scanner/        # Scanner interfaces
│   └── security/       # Security interfaces
├── ui-components/      # Platform-agnostic UI components
└── types/              # Shared TypeScript types

apps/
├── mobile/             # React Native app
│   ├── src/infra/
│   │   ├── storage/
│   │   ├── network/
│   │   ├── scanner/
│   │   └── sync/
│   └── di/
├── web-admin/          # Web admin application
│   ├── src/infra/
│   │   ├── storage/
│   │   ├── network/
│   │   └── sync/
│   └── di/
└── web-staff/          # Web staff application (future)
```

## Key Principles

1. **Platform Isolation**: Shared packages never import platform-specific modules
2. **Dependency Injection**: Platform-specific implementations are injected at app level
3. **Interface Segregation**: Well-defined interfaces separate concerns
4. **Warehouse-First Design**: Prioritizes Bluetooth HID scanners for industrial environments

## Getting Started

To use the shared packages in your application:

```typescript
// Import interfaces
import { Storage, SyncEngine } from '@stock-verification/shared/storage.interface';

// Use dependency injection container in your app
import { container } from '../di/container';

const storage = container.get('storage');
const syncEngine = container.get('syncEngine');
```

## Security

All sensitive data is handled through secure storage interfaces that implement platform-appropriate encryption:

- Mobile: Uses `expo-secure-store` with keychain integration
- Web: Uses encrypted localStorage with additional security layers

## Contributing

When adding new functionality:
1. Define interfaces in the `shared/` packages
2. Implement platform-specific functionality in respective `apps/*/src/infra/` directories
3. Register implementations in dependency injection containers
4. Never import platform-specific modules in shared packages