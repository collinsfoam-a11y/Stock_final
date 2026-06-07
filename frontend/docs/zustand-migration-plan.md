# Zustand → React Query Migration Plan

TanStack Query (`@tanstack/react-query`) is already installed. The goal is to move **server state** (data that originates from an API call) into React Query, keeping **client/UI state** in Zustand.

---

## Classification by store

### `authStore.ts`

| Field / Slice | Type | Classification | Notes |
|---|---|---|---|
| `user` | `User \| null` | **SERVER** (hybrid) | Loaded from API on login; also persisted to SecureStore. Tricky to migrate because it drives route guards. Keep in Zustand for now; consider React Query with `enabled: false` seeding approach later. |
| `isAuthenticated` | boolean | **CLIENT** | Derived from `user !== null`. |
| `isLoading` | boolean | **CLIENT** | Boot / request in-flight flag. |
| `isInitialized` | boolean | **CLIENT** | Boot sequence state. |
| `pendingRedirectPath` | `string \| null` | **CLIENT** | Navigation plumbing. |
| `lastLoggedUser` | `LastLoggedUser \| null` | **CLIENT** | Local UX hint only. |
| `hasValidToken()` | function | **CLIENT** | Derived computation. |
| `login / logout / pinSetup / ...` | async actions | **CLIENT** | Command actions, not query state. |

**Migration readiness:** Not safe to migrate yet. `user` is the auth source-of-truth for the entire app and tightly coupled to the boot sequence. Migrate after the notification and settings stores are validated.

---

### `settingsStore.ts`

| Field / Slice | Type | Classification | Notes |
|---|---|---|---|
| `theme`, `notificationsEnabled`, `notificationSound`, `notificationBadge`, `notificationRecountAlerts`, `notificationApprovalAlerts`, `notificationSyncFailureAlerts`, `notificationSessionReminderAlerts`, `autoSyncEnabled`, `autoSyncInterval`, `syncOnReconnect`, `offlineMode`, `cacheExpiration`, `maxQueueSize`, `scannerVibration`, `scannerSound`, `scannerAutoSubmit`, `scannerTimeout`, `fontSizeValue`, `fontStyle`, `showItemImages`, `showItemPrices`, `showItemStock`, `exportFormat`, `backupFrequency`, `requireAuth`, `sessionTimeout`, `biometricAuth`, `operationalMode`, `imageCache`, `lazyLoading`, `debounceDelay`, `columnVisibility` | various | **SERVER** (remote-synced) | Listed in `REMOTE_USER_SETTING_KEYS`; fetched from and written back to the API via `authApi`. |
| `darkMode` | boolean | **CLIENT** (derived) | Derived from `theme`; local rendering concern. |
| `fontSize` | enum | **CLIENT** (derived) | Normalized from `fontSizeValue`. |
| `loadSettings / saveSettings / updateSetting` | actions | mixed | `loadSettings` fetches from API → server state fetch. `updateSetting` writes to API → mutation. |

**Migration readiness:** Partially safe. The `REMOTE_USER_SETTING_KEYS` fields can be driven by a `useUserSettings` React Query hook (single GET + useMutation for updates). Local-only derived fields (`darkMode`, `fontSize`) stay in Zustand or React context.

---

### `notificationStore.ts`

| Field / Slice | Type | Classification | Notes |
|---|---|---|---|
| `notifications` | `Notification[]` | **SERVER** | Fetched from `/api/notifications`. |
| `unreadCount` | number | **SERVER** | Fetched from `/api/notifications/unread-count`. |
| `isLoading` | boolean | **CLIENT** | Loading indicator only. |
| `error` | `string \| null` | **CLIENT** | Error string derived from last fetch. |
| `lastFetched` | `number \| null` | **CLIENT** | Manual staleness tracking (redundant with React Query). |
| Polling loop (`startNotificationPolling` / `stopNotificationPolling`) | side-effect | **SERVER** | Background refetch; React Query `refetchInterval` handles this natively. |
| `addLocalNotification` | action | **CLIENT** | Optimistic / push injection. |

**Migration readiness: READY — migrated in this PR.** See `src/hooks/queries/useNotifications.ts`.

All state in this store is either server data or derived from it. React Query's `refetchInterval`, stale-time, and optimistic mutation support replace the hand-rolled polling loop and manual `isLoading` / `error` tracking.

---

## Recommended migration order

1. **`notificationStore`** — Done. Pure server state; no auth dependency; polling loop trivially replaced by `refetchInterval`.
2. **`settingsStore` (remote keys only)** — Create `useUserSettings` query + mutation hooks. Keep the local-preference keys and the write-to-MMKV logic in a slimmed-down Zustand slice that reads initial values from the query cache.
3. **`authStore` (`user` field)** — Migrate last. This requires coordinating with the boot sequence, route guards, and token-refresh logic. A safe pattern: seed the React Query cache on login and use `queryClient.setQueryData` as the authoritative state; retire the Zustand `user` field.

---

## What stays in Zustand forever

| Store | Fields to keep |
|---|---|
| `authStore` | `isLoading`, `isInitialized`, `pendingRedirectPath`, `lastLoggedUser`, auth actions |
| `settingsStore` | `darkMode` (derived), `fontSize` (derived), local MMKV-only preferences |
| `networkStore` | All fields — entirely local device state (NetInfo) |
| Any modal/UI store | Open/closed booleans, current tab, transient filter state |

---

## Files created / modified

- `src/hooks/queries/useNotifications.ts` — React Query hooks replacing `notificationStore` server state
- `docs/zustand-migration-plan.md` — This document
