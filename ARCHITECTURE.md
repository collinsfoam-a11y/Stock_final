# System Architecture - Stock Verification System

## High Level Overview

The system follows a strict **Offline-First, Mongo-Primary** architecture. The SQL Server ERP acts purely as a read-only source of truth (Upstream), while MongoDB serves as the operational database for all mobile and admin activities.

```mermaid
graph TD
    subgraph LAN [Local Network / On-Prem]
        SQL[SQL Server ERP]
        Bridge[Sync Bridge Service]
    end

    subgraph Cloud [Cloud / Backend Infrastructure]
        API[FastAPI Backend]
        Mongo[(MongoDB Primary)]
        Redis[(Redis Cache/Lock)]
    end

    subgraph Clients [Mobile & Web Clients]
        Mobile[Mobile App (Offline)]
        Admin[Admin Dashboard]
    end

    SQL -.->|Read Only| Bridge
    Bridge -->|Push Updates| API
    API <--> Mongo
    API <--> Redis
    Mobile <-->|Sync/API| API
    Admin <-->|Realtime| API
```

## Data Flow Patterns

### 1. ERP Sync (Upstream)

- **Pattern**: Sync Bridge (Pull-Push)
- **Constraint**: SQL Server is never exposed to the internet.
- **Trigger**: Scheduled (15m) or On-Demand.
- **Flow**:
  1. `Sync Bridge` queries SQL Server for changed items (using `last_modified` or Hash).
  2. `Sync Bridge` batches data and POSTs to `/api/erp/sync/batch` (secure endpoint).
  3. `FastAPI` upserts documents to `MongoDB` (Items collection).
  4. `FastAPI` updates `last_sql_sync_at` metadata.

### 2. Mobile Read / Offline Cache

- **Pattern**: Lazy Load + Local Database (SQLite/WatermelonDB/Realm)
- **Flow**:
  1. Mobile requests item details from `FastAPI` (backed by Mongo).
  2. Data is cached locally on device.
  3. Searches query local cache first, then API.

### 3. Verification & Writes (Downstream)

- **Pattern**: Local Queue -> Background Sync
- **Flow**:
  1. User scans/counts item.
  2. Write is persisted to **Local Offline Queue** immediately.
  3. Background worker flushes queue to `/api/sync/batch`.
  4. `FastAPI` writes to `MongoDB` (CountLines/Sessions).
  5. **No writes go to SQL Server.**

## Component Responsibilities

| Component       | Responsibility                                                    | Tech Stack                 |
| :-------------- | :---------------------------------------------------------------- | :------------------------- |
| **SQL Server**  | Master Data Source (Product, Pricing, Stock Snapshot). Read-Only. | MSSQL                      |
| **Sync Bridge** | Securely pipe data from LAN SQL to Cloud API.                     | Python/Go/Node Agent       |
| **FastAPI**     | Core Logic, Auth, Session Mgmt, Aggregation.                      | Python, FastAPI, Motor     |
| **MongoDB**     | Operational Store (Counts, Users, Sessions, mirrored Items).      | MongoDB Atlas/Self-hosted  |
| **Mobile App**  | Offline-capable verification client.                              | React Native, Expo, SQLite |
| **Admin Web**   | Reporting and System Control.                                     | React / Next.js            |

## Security & Reliability

- **Network Isolation**: SQL Server is LAN-only. Bridge connects outbound to Cloud API.
- **Idempotency**: All sync endpoints use unique `batch_id` / `record_id` to prevent double-processing.
- **Rate Limiting**: API throttles sync requests to prevent DB overload.
- **Failover**: Mobile app works fully offline for days if needed.

## Database Schema (MongoDB)

- **`items`**: Mirror of ERP data + sync metadata.
- **`sessions`**: Active verification sessions.
- **`count_lines`**: Individual verification records.
- **`approvals`**: Supervisor workflow state.
- **`users`**: Auth and profile data.
- **`sync_log`**: Audit trail of sync bridge activities.

## Mobile Route Compatibility Policy

Mobile clients maintain an offline mutation queue (expo-sqlite). When the app regains connectivity, it flushes queued `POST`/`PUT`/`PATCH` requests. **HTTP 301/302 redirects can alter request methods or drop bodies**, which would corrupt queued mutations.

The repository already implements `MIN_CLIENT_VERSION`. This should become the enforcement mechanism for route retirement.

**Compatibility rules:**
1. **Never** remove or redirect a queued mutation endpoint with 301/302.
2. Prefer **route aliases or re-exported handlers** so the same code services multiple paths.
3. 307/308 redirects may be used **only after verifying client HTTP library behavior** (Expo/Fetch).
4. Maintain old paths for **at least one supported mobile release cycle**.
5. Enforce `MIN_CLIENT_VERSION` before retiring any route used by offline queues.
