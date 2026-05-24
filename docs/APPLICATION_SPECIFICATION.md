# Stock Verify Application Specification

Generated: 2026-05-22 10:33:01
Repository: `D:/app/Stock_final`

This document is source-backed. It does not infer missing behavior. Missing, contradictory, unsafe, or unverified behavior is marked with `REQUIRED INPUT`, `UNDEFINED BEHAVIOR`, `ARCHITECTURAL CONFLICT`, `SECURITY RISK`, `SCALABILITY RISK`, or `DATA INTEGRITY RISK`.

## Table Of Contents
- 1. Executive System Overview
- 2. Business Objectives
- 3. Functional Requirements
- 4. Non-Functional Requirements
- 5. Architecture Overview
- 6. Backend Architecture
- 7. Frontend Architecture
- 8. Offline-First Architecture
- 9. Authentication & Authorization
- 10. Session Management
- 11. Stock Verification Workflow
- 12. Count Line Lifecycle
- 13. Approval & Recount Workflow
- 14. ERP Integration Architecture
- 15. SQL Server Synchronization
- 16. Conflict Resolution
- 17. Event Sourcing Design
- 18. Real-Time Communication
- 19. WebSocket Architecture
- 20. Governance & Write Authority
- 21. Audit Logging
- 22. Distributed Locking
- 23. Security Architecture
- 24. API Specifications
- 25. Database Schema Specifications
- 26. Collection-Level Governance
- 27. Feature Flags
- 28. Control Plane
- 29. Retry Policies
- 30. Idempotency Design
- 31. Cache Strategy
- 32. Sync Queue Design
- 33. Error Handling Standards
- 34. Observability & Monitoring
- 35. Metrics & Telemetry
- 36. Performance Constraints
- 37. Scalability Constraints
- 38. LAN-Only Enforcement
- 39. Mobile Device Constraints
- 40. Barcode & Serial Handling
- 41. Batch Handling
- 42. Risk Detection Rules
- 43. Supervisor Controls
- 44. Admin Controls
- 45. Migration Strategy
- 46. Backward Compatibility
- 47. Testing Strategy
- 48. E2E Test Matrix
- 49. Failure Recovery Strategy
- 50. Disaster Recovery
- 51. Deployment Architecture
- 52. DevOps Requirements
- 53. CI/CD Requirements
- 54. Production Hardening
- 55. Known Technical Debt
- 56. Known Architectural Risks
- 57. Open Questions
- 58. Undefined Behaviors
- 59. Recommended Refactors
- 60. Future Evolution Roadmap


### Specification Audit Remediation Register
- Missing Sections: all 60 requested numbered sections are present. No numbered section was missing.
- Shallow Sections Found: Sections 14, 18, 26 through 60, and parts of Sections 1, 2, 4, 6, 8 through 23 were materially shorter than production-grade implementation depth. This revision expands those sections in place rather than replacing them.
- Hidden Assumptions Found: the previous revision relied on generated OpenAPI shape, frontend route inventory, and index definitions as sufficient API/schema evidence. This revision explicitly states where OpenAPI, route discovery, and index definitions are necessary but not sufficient.
- Undefined Flows Found: offline approvals, offline admin actions, report/export retry, WebSocket replay, WebSocket token expiry, manager-role UI behavior, projection rebuild acceptance, schema retention, and non-core endpoint transaction boundaries remain undefined and are marked.
- Missing Edge Cases Found: stale snapshots, delayed offline devices, duplicate semantic writes, serial scope drift, locked/approved conflict writes, SQL sync interval drift, queue expiry, projection lag, large export payloads, and Redis/Mongo lock divergence required stronger treatment. These are expanded in the relevant sections.
- Unhandled Concurrency Found: several generated API entries lacked endpoint-specific version checks, lock ownership, transaction boundaries, and race behavior. This revision adds required concurrency gates and marks missing endpoint details as `UNDEFINED BEHAVIOR`.
- Missing Offline Behavior Found: generated screen and feature entries stated offline presence but did not always specify allowed, blocked, queued, or manual-review behavior. This revision adds offline decision rules and unresolved offline actions.
- Missing Rollback Handling Found: rollback was underspecified for admin controls, reports, migrations, deployment, security changes, and projection rebuilds. This revision requires versioned rollback, fork, recount, archive, or restore paths and marks missing procedures.
- Missing Retry Behavior Found: retry semantics were defined for sync and auth but not for report jobs, admin mutations, session transitions, WebSocket reconnect, projection rebuilds, or exports. This revision adds retry gates and idempotency requirements.
- Missing Security Constraints Found: local queue encryption, admin LAN exposure, report redaction, WebSocket query tokens, workflow permissions, container hardening, and secrets hygiene required stronger explicit controls.
- Missing Observability Requirements Found: previous metrics were incomplete for drift, lag, queue age, event/projection divergence, data repair, schema validation failures, and admin/security actions. This revision adds required metrics and alerts.
- Incomplete API Contracts Found: every operation has endpoint/method/request/response/error/auth/rate/idempotency/retry/transaction fields, but many fields remain `UNDEFINED BEHAVIOR` because source code or OpenAPI does not declare them. This revision adds API-family completion rules and blocks treating generated OpenAPI alone as the contract.
- Incomplete Schema Definitions Found: OpenAPI component schemas and Mongo indexes do not define complete database validation, retention, field ownership, PII classification, state transitions, or projection invariants. This revision adds schema completion gates and marks missing source material.
- Architectural Contradictions Found: ERP write-back wording, event sourcing versus transition writes, multiple session states, Expo version drift, PIN route/length drift, barcode validator drift, SQL sync interval drift, AsyncStorage versus architecture storage drift, and backend manager role versus frontend roles are preserved as contradictions rather than silently resolved.

## 1. Executive System Overview

**Source Basis**
- Primary source candidate: `Stock_final_main_analysis_report-2.pdf`; the PDF was present and text was extracted during generation. The temporary extraction artifact was removed after this document was generated. It is a CodeAnt security/quality analysis report, not a narrative architecture document.
- Repo sources: README, ARCHITECTURE.md, backend README, Makefile, docs architecture files, API/dossier/UI/testing docs, generated OpenAPI/routes, backend service source, frontend route/offline/sync source.
- REQUIRED INPUT: If another uploaded architecture analysis document was intended, it must be supplied and this specification revised.

**System Overview**
- Expo React Native frontend for staff, supervisor, and admin workflows.
- FastAPI backend with MongoDB primary application store, read-only SQL Server ERP integration, Redis locks/rate/pubsub, OpenAPI with 327 paths and 359 operations.
- Stock truth is architecturally `event_log` plus required projections, while transition code still governs `count_lines` through CountLineWriteService.
- Sync direction is `SQL Server -> MongoDB -> Frontend`; SQL Server writes are forbidden.
- Offline-first count capture syncs through `/api/sync/batch`; legacy sync operations return HTTP 410.

**Contradictions**
- ARCHITECTURAL CONFLICT: V2.1 README/API version labels coexist with V3/V3.1 stock contract docs.
- ARCHITECTURAL CONFLICT: documentation/comment wording about final stock written to ERP conflicts with no SQL writes.
- ARCHITECTURAL CONFLICT: session state models differ across frozen docs, Pydantic schemas, governance transitions, and legacy statuses.

**Unresolved Risks**
- DATA INTEGRITY RISK: event-first enforcement is not proven across every write path.
- SECURITY RISK: CodeAnt reported SAST, secrets, infrastructure, SCA, and logging findings requiring remediation.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- The executive overview must distinguish declared architecture from implemented transition architecture. `event_log` is the declared long-term truth, while `count_lines` remains a governed transition write model. Treating these as equivalent is a DATA INTEGRITY RISK.
- Production readiness requires an explicit source-of-truth matrix: ERP SQL data, Mongo ERP cache, session snapshot baseline, event log, count-line working state, projection state, frontend cache, and offline queue state must each have a declared owner and freshness rule.
- The PDF source is a CodeAnt report. Any product workflow not present in repo docs or code remains `REQUIRED INPUT`; it must not be inferred from naming or route existence.
## 2. Business Objectives

**Objectives**
- Preserve MongoDB as application write store and SQL Server as read-only ERP.
- Preserve event-sourced stock contract and governed write paths.
- Enable mobile offline stock verification with conflict-aware sync.
- Enforce item-scoped serial uniqueness, backend UOM rules, session location locks, auditability, and approval/recount controls.
- Provide supervisor/admin operational controls without bypassing governance.

**Required Inputs**
- REQUIRED INPUT: inventory accuracy targets, count throughput targets, warehouse/device/user scale, variance thresholds, report SLOs, retention rules, DR targets, and support model.

**Unresolved Risks**
- REQUIRED INPUT: business acceptance criteria are incomplete.
- SECURITY RISK: retention/privacy requirements for logs, photos, tokens, and PII are not defined.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Business objectives need measurable acceptance criteria before development can treat a workflow as complete. Missing KPI examples include allowed variance value by item class, approval SLA, offline sync maximum age, queue manual-review SLA, item lookup latency, scanner-to-save latency, and ERP cache maximum staleness.
- If business owners require ERP write-back later, that is a new architecture decision and directly conflicts with current read-only ERP governance.
- Objective conflicts must be resolved through ADRs before implementation, not by local code preference.
## 3. Functional Requirements

**Functional Requirement Inventory**
- Auth/token/PIN/password/OTP.
- Role navigation and authorization.
- Sessions, snapshots, locks, takeover/reopen/finalize/archive.
- Count capture with quantities, UOM, serials, batches, condition, MRP, evidence.
- Offline queue, sync batch, conflict detection/resolution.
- Approval, recount, variance and risk routing.
- ERP read-only SQL sync and verification.
- Event sourcing/projections.
- WebSocket/Redis realtime.
- Staff, supervisor, admin screens and control plane.

### Feature: Authentication and Token Lifecycle
- Purpose: Authenticate staff/supervisor/admin and protect APIs/WebSocket.
- Trigger: Login, PIN login, refresh, logout, password reset, protected route, WebSocket connect.
- Actors: User, auth services, frontend route guard, JWT provider.
- Preconditions: Strong JWT secrets, active user, CORS/cookies configured.
- Input Schema: OpenAPI auth schemas, bearer token, auth cookie, WebSocket token locations.
- Validation Rules: Require JWT sub; reject inactive/expired/invalid tokens; PIN schema/service length conflict is ARCHITECTURAL CONFLICT.
- Processing Logic: Validate credentials, apply limiter, issue tokens, persist refresh state, route by role.
- Failure Scenarios: Bad credentials, lockout, malformed token, inactive account, missing secret, CORS/cookie mismatch.
- Retry Behavior: Login retry limited by lockout; refresh retry only on transient failure.
- Offline Behavior: Server auth required for sync; cached token cannot bypass server validation.
- Security Constraints: Protect tokens, sanitize logs, forbid weak secrets, avoid query-token WebSocket in production.
- Concurrency Behavior: Refresh revocation and simultaneous login behavior must handle races; exact token rotation is UNDEFINED BEHAVIOR.
- Audit Logging: Login/logout/reset/PIN/permission failures must be audited without secrets.
- UI Behavior: Auth screens show loading, invalid credentials, lockout, offline unavailable, reset states, role routing.
- API Contract: Section 24 auth endpoints; docs conflict on PIN login route names.
- Database Impact: users, refresh_tokens, auth_otps, auth_reset_tokens, pin_authentication, login_attempts, rate_limits, audit/activity logs.
- Sync Impact: Queued writes reauthorize on sync; 401 moves to auth-required retry state.
- Performance Impact: REQUIRED INPUT: production auth throughput and latency targets.
- Observability Impact: Metrics for attempts, lockouts, refresh failures, 401/403, WebSocket auth closes.
- Test Scenarios: Success/failure login, inactive user, expired token, refresh revoke, PIN lockout, cookie/WebSocket auth.
- Recovery Flow: Password reset/admin reset/revoke tokens/clear lockout after configured window.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Session Management
- Purpose: Manage stock verification sessions scoped by location.
- Trigger: Create, assign, start, pause, review, approve/finalize, reopen, archive, heartbeat.
- Actors: Staff, supervisor, admin, lifecycle service, lock service.
- Preconditions: Location exists, role allowed, single active session per location, snapshot available before count writes.
- Input Schema: SessionCreate plus frozen architecture session fields and assignment/context.
- Validation Rules: Reject finalized mutation, require active status, enforce location unique index, OCC version checks.
- Processing Logic: SessionLifecycleService writes sessions and verification_sessions mirror, records snapshots and governance events.
- Failure Scenarios: Duplicate location, missing snapshot, stale version, lock timeout, mirror divergence.
- Retry Behavior: Retry creation only with read-back/idempotency; transitions require refreshed version.
- Offline Behavior: Offline lifecycle transitions are UNDEFINED BEHAVIOR; cached active session supports offline count only.
- Security Constraints: Role-gated transitions, auditable takeover, blind-count visibility controls.
- Concurrency Behavior: Unique active location index, Redis/Mongo locks, OCC.
- Audit Logging: session_created, session_locked, session_started, session_paused, session_reopened, session_finalized.
- UI Behavior: Session screens show status, location, assignee, queue/conflict counts, lock state, permission CTAs.
- API Contract: Section 24 session/rack endpoints.
- Database Impact: sessions, verification_sessions, session_snapshots, locks, rack_registry, projections.
- Sync Impact: Queued counts reference session_id and snapshot version; server rejects stale/inactive session.
- Performance Impact: Dashboards should use projections; REQUIRED INPUT: response SLO.
- Observability Impact: Active sessions, transitions, lock latency, snapshot failures, heartbeat staleness.
- Test Scenarios: Create, duplicate block, transition matrix, stale version, finalized mutation, snapshot immutability, role denial.
- Recovery Flow: Auditable takeover/reopen, lock force-release by authorized control, governed repair.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Stock Verification Count Capture
- Purpose: Capture physical count, serial, batch, condition, UOM, MRP, damage, evidence, reasons.
- Trigger: Scan/search item, open detail, enter quantity, attach evidence, submit online/offline.
- Actors: Staff counter, scanner, offline store, count-line API, validation/write services.
- Preconditions: Assigned active session, cached/known item or unknown-item flow, snapshot baseline, auth for sync.
- Input Schema: CountLineCreate plus BatchSyncRequest.records for offline.
- Validation Rules: Active session/location required; UOM normalized; NOS fractions blocked; serial item-scoped; expiry after mfg; variance reasons/evidence required.
- Processing Logic: Persist offline or submit online, then CountLineWriteService validates, writes, updates projections/audit.
- Failure Scenarios: Unknown barcode, missing snapshot, duplicate idempotency/semantic hash, serial conflict, invalid UOM/date, photo failure.
- Retry Behavior: Retry with same idempotency key/client_record_id only.
- Offline Behavior: offlineCountLine creates audit metadata, local cache entry, queue item; sync in batches of 50.
- Security Constraints: Server-side session/role checks; frontend hidden ERP quantities are not trusted.
- Concurrency Behavior: Semantic hash, idempotency index, session version, locks, serial indexes.
- Audit Logging: item_scanned, qty_changed, serial_added, serial_removed, damage_marked, variance_detected, sync_conflict.
- UI Behavior: Scan/detail screens show scanner, context, UOM, validation, offline queue, duplicate warning, photo requirement.
- API Contract: Section 24 count-line, item lookup, sync batch, unknown item endpoints.
- Database Impact: count_lines and required projections, event/audit/governance stores.
- Sync Impact: Records-only sync; legacy operations disabled.
- Performance Impact: Scanner UI must not block on network; backend writes transactional and bounded.
- Observability Impact: Scans/min, validation failures, queue length, sync latency, projection failures.
- Test Scenarios: Valid count, offline create, idempotency duplicate, UOM errors, serial conflict, missing snapshot, variance reason/photo.
- Recovery Flow: Retry queue, supervisor conflict resolution, recount, governed projection repair.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Approval and Recount Workflow
- Purpose: Route variances/risk/damage/serial issues to reviewers and support recounts.
- Trigger: Risk threshold hit, supervisor reject, approval submit, recount request, override.
- Actors: Counter, supervisor, auditor, manager, admin, finance/QA/master data reviewers.
- Preconditions: Count line exists, policy loaded, reviewer permission, item/session locks preserved.
- Input Schema: Policy inputs: variance percent/value, category, risk, serial mismatch, expiry, damage, location, role.
- Validation Rules: Counters cannot finalize; overrides require remarks; closed approvals immutable.
- Processing Logic: Variance/policy services determine route; write service updates approved/rejected/recount fields.
- Failure Scenarios: Missing policy/reason, unauthorized reviewer, stale line, concurrent approval, closed session.
- Retry Behavior: Retry after refreshing version/lock; duplicate decisions must not duplicate approvals.
- Offline Behavior: Offline approvals are UNDEFINED BEHAVIOR unless explicitly queued and versioned.
- Security Constraints: Server-side reviewer role enforcement; blind recount hides ERP qty; all overrides audited.
- Concurrency Behavior: Approval locks; approved/locked conflicts fork instead of overwrite.
- Audit Logging: approval_submitted, approval_rejected, recount_requested, override_performed.
- UI Behavior: Variance screens show risk flags, evidence, baseline, counted value, role CTAs, reason input, lock banner.
- API Contract: Section 24 approval/variance/supervisor/count-line endpoints.
- Database Impact: count_lines, approvals, variance_logs, recount_requests, locks, audit/projections.
- Sync Impact: Offline count conflicts can create approval tasks after sync.
- Performance Impact: Projection-backed queues; REQUIRED INPUT: dashboard SLO.
- Observability Impact: Pending approvals, approval latency, recount cycles, override frequency.
- Test Scenarios: Threshold route, approve/reject, missing reason, blind recount, double approval, closed immutability.
- Recovery Flow: Reopen with audit version, assign recount, conflict fork, governed repair.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: ERP SQL Synchronization
- Purpose: Read SQL Server ERP into Mongo cache and verify quantities without SQL writes.
- Trigger: Scheduled/manual sync, item lookup, snapshot creation, verification run.
- Actors: SQL connector, SQLSyncService, SQLVerificationService, admin, Mongo.
- Preconditions: Read-only SQL credentials, connector configured, query guard active, Mongo available.
- Input Schema: Guarded SELECT/WITH queries with positional placeholders and sync config.
- Validation Rules: Block SQL DML/DDL/EXEC/semicolon/GO/SELECT INTO and placeholder mismatch.
- Processing Logic: Read SQL, transform rows, update erp_items/metadata, compare quantities, fork optimistic conflicts.
- Failure Scenarios: pyodbc missing, SQL unavailable, schema drift, blocked query, Mongo conflict.
- Retry Behavior: Limited connector retry; resume from safe metadata; never retry by writing SQL.
- Offline Behavior: Devices use Mongo/frontend cache, never direct SQL.
- Security Constraints: No SQL secrets in logs/source; admin SQL config masks credentials.
- Concurrency Behavior: Optimistic Mongo filter and conflict forks preserve enriched state.
- Audit Logging: ERP sync start/end/failure, verification conflicts, config changes.
- UI Behavior: Admin SQL screen shows status, last sync, failures, confirmation, read-only notice.
- API Contract: Section 24 ERP/SQL/item/verification endpoints.
- Database Impact: erp_items, erp_sync_metadata, verification_conflicts, governance_events, snapshots.
- Sync Impact: ERP sync feeds snapshots and item caches used by mobile sync.
- Performance Impact: Batch size 500 observed; sync interval conflict 900 vs 3600 seconds.
- Observability Impact: SQL latency, rows synced, conflicts, last success age, connector errors.
- Test Scenarios: Guard reject writes, SELECT works, placeholder mismatch, SQL unavailable, conflict fork.
- Recovery Flow: Rerun targeted sync/verification, repair cache from SQL read-only source.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Offline Sync and Conflict Resolution
- Purpose: Queue offline writes and reconcile idempotently/conflict-aware.
- Trigger: Offline submit, reconnect, manual sync, background interval, conflict response.
- Actors: Mobile app, AsyncStorage queue, sync service, sync batch API, SyncConflictsService, supervisor.
- Preconditions: Cached auth/session/item and client_record_id/idempotency key.
- Input Schema: Queue item types and BatchSyncRequest.records.
- Validation Rules: Required fields, empty records rejected, legacy operations 410, session active, serial/rack/damage rules.
- Processing Logic: Persist queue, run locked background sync, send batch 50, server validates/writes, mark success/conflict/manual review.
- Failure Scenarios: Expired TTL, unsupported type, 401, 429, circuit breaker, Redis unavailable, stale snapshot.
- Retry Behavior: Reconnect delay 2000 ms, periodic min 5 min, threshold 5, same client_record_id.
- Offline Behavior: AsyncStorage current implementation; offline count allowed, approvals/finalization undefined.
- Security Constraints: Local encryption policy REQUIRED INPUT; server reauthorizes all queued writes.
- Concurrency Behavior: Server idempotency, semantic hash, serial checks, conflict forks.
- Audit Logging: sync_conflict, sync_batch_received/rejected, conflict_resolved, manual_review_required.
- UI Behavior: Offline badge, queue count, last sync, retry/manual-review/conflict badges.
- API Contract: Section 24 sync/conflict endpoints.
- Database Impact: AsyncStorage plus idempotency_operations, count_lines, sync_conflicts, conflict_forks, event/projections.
- Sync Impact: Records-only API; additive/merge semantics; overwrite sync forbidden.
- Performance Impact: Large queues can affect memory/sync time; max queue only advisory.
- Observability Impact: Queue length, success/failure, conflicts, manual review age, circuit breaker.
- Test Scenarios: Offline create, reconnect, duplicate retry, 401, 429, conflict, manual threshold, operations 410.
- Recovery Flow: Manual conflict resolution, retry after auth, prune expired with user-visible state, fork locked conflicts.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Real-Time Communication
- Purpose: Push session/rack/global updates over WebSocket and Redis pub/sub.
- Trigger: Client connects, server broadcasts, Redis channel message.
- Actors: Staff, supervisor, admin, WebSocket manager, Redis pub/sub.
- Preconditions: Valid JWT, accepted role, backend alive, Redis for scale-out.
- Input Schema: WebSocket query session_id/token, bearer/subprotocol/cookie token.
- Validation Rules: Reject missing/invalid token, missing sub, unsupported role with close 1008.
- Processing Logic: Store socket in user/session dictionaries; broadcast JSON by user/session/all/role.
- Failure Scenarios: Token expiry after connect, process restart, multi-worker split, Redis crash, send failure.
- Retry Behavior: Client reconnects with fresh token; no replay queue defined.
- Offline Behavior: No offline delivery; clients refresh durable state after reconnect.
- Security Constraints: Avoid query token in production; scope broadcasts by role/session.
- Concurrency Behavior: In-memory dictionaries are process-local and not lock-protected.
- Audit Logging: Connect/disconnect/auth failures logged; broadcast audit UNDEFINED BEHAVIOR.
- UI Behavior: Dashboards show socket status, stale marker, reconnect state, fallback refresh.
- API Contract: WebSocket `/ws/updates`; Redis channels rack/session/global.
- Database Impact: No direct DB writes in manager.
- Sync Impact: Realtime is a hint; durable truth remains Mongo/event/projections/sync.
- Performance Impact: Sequential broadcast loops; REQUIRED INPUT: connection limit.
- Observability Impact: Connection counts, close codes, broadcast failures, pub/sub lag.
- Test Scenarios: Auth methods, invalid token close, role reject, session broadcast, cleanup, Redis handler error.
- Recovery Flow: Reconnect and reload durable state.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Barcode Serial and Batch Validation
- Purpose: Normalize scan input and validate barcode, serial, batch, date, MRP, and UOM rules before stock persistence.
- Trigger: Barcode scan, serial scan, batch entry, item detail save, offline sync validation.
- Actors: Staff counter, scanner, frontend validators, ValidationService, CountLineWriteService, serial registry projections.
- Preconditions: Active session, item identity, location context, UOM metadata, serial/batch requirements for item/category.
- Input Schema: CountLineCreate barcode, serial_numbers, serial_entries, batch fields, mfg/expiry, MRP, UOM, quantity fields.
- Validation Rules: Use _normalize_barcode_input; reject invalid UOM fractions/precision; expiry before manufacture; item-scoped serial duplicate; batch mismatch review.
- Processing Logic: Normalize input, resolve item, validate serial/batch/date/UOM, compute variance/risk, persist through governed write/projection services.
- Failure Scenarios: Barcode validator drift, unknown item, duplicate serial, serial quantity mismatch, invalid date, MRP mismatch, stale offline cache.
- Retry Behavior: Retry only with same count idempotency after validation correction; invalid deterministic input should not be retried unchanged.
- Offline Behavior: Offline capture allowed if cached metadata is sufficient; server revalidates all serial/batch/barcode rules during sync.
- Security Constraints: Do not trust client validators; server enforces item-scoped serial uniqueness and rejects global uniqueness reintroduction.
- Concurrency Behavior: Serial and batch projection unique indexes plus count-line transaction prevent conflicting claims.
- Audit Logging: serial_added, serial_removed, item_scanned, batch_changed, validation_failed where implemented.
- UI Behavior: Scan UI shows parsed barcode, item match, duplicate warning, serial/batch required states, invalid date/MRP/UOM errors.
- API Contract: Section 24 item, count-line, sync, barcode/serial endpoints.
- Database Impact: count_lines, serial_registry, serial_records, batch_records, item_serials, variance_logs, audit/event records.
- Sync Impact: Queued barcode/serial/batch payloads sync through records-only batch; conflicts become blocked/manual review.
- Performance Impact: Large serial lists can affect mobile memory and Mongo write latency; REQUIRED INPUT: max serial count per line.
- Observability Impact: Metrics for invalid barcodes, serial conflicts, batch mismatches, UOM errors.
- Test Scenarios: Valid/invalid barcode, item-scoped duplicate, global duplicate allowed across item, batch date, MRP mismatch, offline serial conflict.
- Recovery Flow: Correct input, route unknown item, supervisor conflict, recount/versioned correction, governed repair for projection drift.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Unknown Item and Master Data Governance
- Purpose: Capture scanned items not resolved from ERP cache and route them to governed master-data review.
- Trigger: Unknown barcode/search miss during staff scan or sync validation.
- Actors: Staff counter, supervisor/admin/master data reviewer, UnknownItemService, ERP/Mongo item cache.
- Preconditions: Active session for operational capture; barcode/input present; reviewer has master-data authority.
- Input Schema: Unknown item create payload from frontend/offline queue plus item/barcode/location/session/evidence metadata.
- Validation Rules: Do not create direct stock quantity mutation; validate barcode, required context, duplicate unknown item, permission.
- Processing Logic: Persist unknown item through UnknownItemService, queue/review it, reconcile with ERP/Mongo master data when approved.
- Failure Scenarios: Duplicate unknown, invalid barcode, missing session, offline unsupported fields, reviewer rejection, ERP sync later resolves item.
- Retry Behavior: Retry offline unknown item with same derived key session+barcode; reviewer actions require refreshed current state.
- Offline Behavior: Frontend queue supports unknown_item type, but exact server sync handling is partially UNDEFINED BEHAVIOR.
- Security Constraints: Only authorized reviewers can promote/resolve; no SQL Server writes; no secret/sensitive payload in logs.
- Concurrency Behavior: Duplicate unknown item and ERP sync resolution races require idempotency and review locks.
- Audit Logging: unknown_item_created, unknown_item_reviewed, unknown_item_resolved, unknown_item_rejected.
- UI Behavior: Unknown item screens show unresolved list, evidence, item match candidates, offline badge, permission CTAs.
- API Contract: Section 24 unknown item/admin/item endpoints.
- Database Impact: unknown_items, manual_items, erp_items, audit_logs, activity_logs, governance_events.
- Sync Impact: Unknown items captured offline must reconcile without overwriting ERP cache or stock truth.
- Performance Impact: Search and review queues should be indexed; REQUIRED INPUT: expected unknown item volume.
- Observability Impact: Metrics for unknown captures, resolution time, duplicate rate, rejected unknowns.
- Test Scenarios: Unknown scan online/offline, duplicate unknown, resolve to existing item, reject, ERP later sync match.
- Recovery Flow: Reviewer resolution, merge with ERP item, archive duplicate, governed repair for incorrect promotion.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Supervisor Operations
- Purpose: Enable supervisors to monitor sessions, variances, sync conflicts, offline queues, activity, and user workflows.
- Trigger: Supervisor navigates dashboard/queues, receives realtime update, reviews pending variance/conflict/session.
- Actors: Supervisor, admin acting as supervisor, staff counters, realtime service, backend supervisor APIs.
- Preconditions: Authenticated supervisor/admin role, server permissions, projection data current or stale state visible.
- Input Schema: Route params, filters, approval/reject reasons, conflict resolution selections, session/user identifiers.
- Validation Rules: Server enforces permission; reasons required for rejection/override; locked/approved records cannot be overwritten.
- Processing Logic: Read projection-backed queues, inspect details/evidence/audit, execute approved decision through governed services.
- Failure Scenarios: Permission denial, stale projection, lock conflict, missing evidence, concurrent reviewer, offline unavailable.
- Retry Behavior: Retry after refresh/version/lock release; decisions are not blindly retried without current state.
- Offline Behavior: Supervisor decision writes offline are UNDEFINED BEHAVIOR and should be disabled unless queued contract is approved.
- Security Constraints: Role/permission checked server-side; sensitive evidence/logs hidden by permission; actions audited.
- Concurrency Behavior: Approval locks, session locks, conflict fork rules, projection freshness markers.
- Audit Logging: approval/rejection/conflict/session-control events with actor, reason, before/after state.
- UI Behavior: Dashboards show counts, stale state, filters, empty/loading/error/offline, one primary decision CTA.
- API Contract: Section 24 supervisor, variance, conflict, session, count-line endpoints.
- Database Impact: sessions, count_lines, approvals, sync_conflicts, conflict_forks, variance_logs, activity/audit/governance records.
- Sync Impact: Offline count results can create supervisor tasks; supervisor decisions sync semantics require REQUIRED INPUT.
- Performance Impact: Projection reads must scale; REQUIRED INPUT: dashboard latency and queue size targets.
- Observability Impact: Metrics for pending queues, decision latency, conflict age, lock failures.
- Test Scenarios: Variance approve/reject, conflict accept/fork, stale projection, concurrent reviewer, permission denial.
- Recovery Flow: Refresh state, release/force lock with audit, recount, conflict fork, governed repair.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Admin Control Plane
- Purpose: Manage users, permissions, SQL config, unknown items, security, settings, logs, and operational dashboards.
- Trigger: Admin route/action, configuration update, user/permission change, SQL connection test, log review.
- Actors: Admin, manager where backend allows, security reviewer, SQL config service, user service.
- Preconditions: Authenticated admin role, LAN/production controls, explicit permission, impact preview for risky actions.
- Input Schema: User payloads, role/permission settings, SQL config, system settings, filters, unknown item decisions.
- Validation Rules: Validate permissions, secrets masking, CORS/security constraints, no SQL write-back, no direct projection repair without checkpoint.
- Processing Logic: Apply local reversible settings through governed APIs; high-impact operations use dry-run/approval workflow.
- Failure Scenarios: Permission denial, invalid config, secret exposure, SQL test failure, production guard rejection, concurrent admin update.
- Retry Behavior: Retry after validation correction; risky mutating operations require explicit confirmation and audit.
- Offline Behavior: Admin mutating actions offline are UNDEFINED BEHAVIOR and should be disabled.
- Security Constraints: Admin APIs require strongest authorization, LAN/TLS, rate limits, audit, no secrets in logs.
- Concurrency Behavior: Settings updates require versioning/OCC where available; user changes must avoid lost updates.
- Audit Logging: user_changed, permission_changed, sql_config_changed, security_setting_changed, admin_override.
- UI Behavior: Admin screens show role, environment, destructive/risky action confirmation, masked secrets, loading/error/offline states.
- API Contract: Section 24 admin/auth/user/sql/security/log endpoints.
- Database Impact: users, permissions/config collections, erp_config, unknown_items, logs, audit/activity/governance records.
- Sync Impact: Admin changes can affect sync/auth/SQL behavior; queued mobile writes revalidate server policy after change.
- Performance Impact: Admin list/report views need pagination and indexes; REQUIRED INPUT: admin data volume targets.
- Observability Impact: Metrics for admin changes, failed config tests, permission denials, security setting changes.
- Test Scenarios: Create/update/deactivate user, permission denial, SQL config mask/test, offline disabled, concurrent edit.
- Recovery Flow: Revert versioned setting, revoke tokens, restore previous config, governed repair if data changed.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

### Feature: Reporting Export and Audit Review
- Purpose: Provide operational reports, exports, snapshots, comparisons, audit/log review, and metrics visibility.
- Trigger: User opens report/log screen, creates snapshot, compares reports, exports data, filters audit/error/activity logs.
- Actors: Admin, supervisor, auditor, report services, projection collections, audit/log stores.
- Preconditions: Authenticated role with report/log permission; projection data available; export destination configured.
- Input Schema: Report filters, snapshot IDs, compare job IDs, date ranges, session/location/user/item selectors.
- Validation Rules: Validate permission, filter scope, date ranges, export size, sensitive field redaction, snapshot immutability.
- Processing Logic: Read projections/logs, create report snapshots/jobs, generate/export files/results, preserve query hash and audit trail.
- Failure Scenarios: Large export, stale projection, missing snapshot, unauthorized data scope, file generation failure, sensitive data exposure.
- Retry Behavior: Retry read/report generation with same snapshot/job id where supported; export retry idempotency is UNDEFINED BEHAVIOR if job id absent.
- Offline Behavior: Offline report/export creation is UNDEFINED BEHAVIOR; read cached summaries only if explicitly implemented.
- Security Constraints: Least-privilege report access, redaction, audit of exports, no secrets or raw sensitive payload dumps.
- Concurrency Behavior: Snapshot/job unique indexes prevent duplicate IDs; concurrent exports require queue/job state.
- Audit Logging: report_snapshot_created, report_exported, report_compared, audit_viewed where implemented.
- UI Behavior: Report screens show filters, empty/loading/error/export progress, stale projection warnings, permission visibility.
- API Contract: Section 24 report/export/log/metrics endpoints.
- Database Impact: report_snapshots, report_compare_jobs, generated_reports, report_files, export_results, export_schedules, audit_logs, activity_logs, error_logs, projections.
- Sync Impact: Reports consume synced/projection data; offline queue state and conflicts must be reflected.
- Performance Impact: Large exports can load Mongo/backend memory; REQUIRED INPUT: max rows/file size and retention.
- Observability Impact: Metrics for report latency, export failures, snapshot counts, audit/log query latency.
- Test Scenarios: Snapshot create, compare, export, permission denial, large filter, stale projection, redaction check.
- Recovery Flow: Retry job, regenerate from immutable snapshot, purge failed file, revoke exposed export if sensitive leak.
- Unresolved Risks: REQUIRED INPUT: product, security, retention, SLO, and role-policy gaps must be approved before dependent changes.

**Unresolved Risks**
- REQUIRED INPUT: reports/exports/notifications/admin settings have incomplete acceptance criteria.
- UNDEFINED BEHAVIOR: several OpenAPI operations lack descriptions, error schemas, or explicit security declarations.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- The feature matrix now lists explicit feature contracts, but route existence still does not prove product approval. Every feature must be tied to permissions, service ownership, collection ownership, failure states, and test coverage before implementation.
- Repeated domains must remain separate when implementation differs. Example: serial uniqueness in backend validation, frontend precheck, sync conflict handling, Mongo indexes, and projection rebuild each needs its own enforcement statement because a fix in one layer does not fix the others.
- Every feature using offline data must name stale-data behavior and server revalidation behavior.
## 4. Non-Functional Requirements

**Reliability**
- Offline count capture is required.
- MongoDB writes and projections must be durable.
- SQL outages must not corrupt Mongo state.
- Redis absence in production is a feature failure for locks/rate/pubsub where required.

**Performance**
- Frontend sync batch size 50; SQL sync batch size 500 observed.
- Projection-backed dashboards are required.
- REQUIRED INPUT: production p95/p99 API, sync, screen, report, and SQL latency targets.

**Security and Accessibility**
- Production forbids weak secrets/CORS wildcard/debug defaults.
- Mobile operational UI requires 44x44 touch targets, safe areas, text scaling, contrast, reduced motion, scanner-friendly focus.

**Unresolved Risks**
- SCALABILITY RISK: no load profile or tested scale target is documented.
- SECURITY RISK: CodeAnt security findings remain unresolved until separately verified.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Non-functional requirements are not production-ready until SLOs are numeric. Required values include p95/p99 API latency, sync acceptance latency, offline queue max age, max queued records per device, WebSocket reconnect target, SQL sync staleness, projection lag, RTO, RPO, and audit retention.
- Accessibility must be verified on actual target devices/scanners, not only by style rules.
- Security requirements from CodeAnt findings are blocking production risks until triaged, fixed, or risk-accepted with compensating controls.
## 5. Architecture Overview

- Expo React Native frontend for staff, supervisor, and admin workflows.
- FastAPI backend with MongoDB primary application store, read-only SQL Server ERP integration, Redis locks/rate/pubsub, OpenAPI with 327 paths and 359 operations.
- Stock truth is architecturally `event_log` plus required projections, while transition code still governs `count_lines` through CountLineWriteService.
- Sync direction is `SQL Server -> MongoDB -> Frontend`; SQL Server writes are forbidden.
- Offline-first count capture syncs through `/api/sync/batch`; legacy sync operations return HTTP 410.

**Contradictions**
- ARCHITECTURAL CONFLICT: V2.1 README/API version labels coexist with V3/V3.1 stock contract docs.
- ARCHITECTURAL CONFLICT: documentation/comment wording about final stock written to ERP conflicts with no SQL writes.
- ARCHITECTURAL CONFLICT: session state models differ across frozen docs, Pydantic schemas, governance transitions, and legacy statuses.

**Unresolved Risks**
- DATA INTEGRITY RISK: event-first enforcement is not proven across every write path.
- SECURITY RISK: CodeAnt reported SAST, secrets, infrastructure, SCA, and logging findings requiring remediation.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Architecture diagrams and deployment topology are required before production. Missing items include process count, worker model, Redis HA topology, MongoDB topology, SQL network path, TLS termination, reverse proxy headers, LAN enforcement placement, and mobile device network boundaries.
- Transition architecture must state whether reads use projections, `count_lines`, `event_log`, or ERP cache per feature. Mixed read models without consistency rules are a DATA INTEGRITY RISK.
## 6. Backend Architecture

**Backend Components**
- FastAPI app factory, routers, auth dependencies, middleware, service layer, MongoDB, SQL connector, Redis services, background/orchestration services.
- Key governed services: CountLineWriteService, SessionLifecycleService, UnknownItemService, SQLSyncService, SQLVerificationService, SyncConflictsService, ValidationService, EventService, ProjectionService, ProjectionWriteService, GovernanceAuditService.
- Middleware includes CORS, API version header `2.1.0`, GZip, LAN enforcement, rate limiting, security headers, projection consistency guard where registered.

**Write Rules**
- Count lines through CountLineWriteService.
- Sessions/snapshots through SessionLifecycleService.
- Unknown items through UnknownItemService.
- ERP SQL is read-only.
- Projections through projection services.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: count_lines/projection writes coexist with event sourcing.
- SECURITY RISK: sensitive logging and hardcoded credential findings must be remediated.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Backend architecture must include an allowlist of mutation services per collection and an explicit reject rule for direct writes from routes.
- Every backend service that writes business data must define transaction boundary, retry behavior, idempotency key source, audit event name, projection/event side effect, and failure rollback behavior.
- App startup/logging behavior must be resilient to locked log files; the observed Windows `app.log` rotation failure is an operational defect to track.
## 7. Frontend Architecture

**Frontend Stack**
- Expo React Native. package.json declares Expo `~55.0.24`, React 19.2.0, React Native 0.83.6, Node `>=20.19.4 <26.0.0`.
- Role defaults: staff `/staff/home`, supervisor `/supervisor/dashboard`, admin `/admin/dashboard-web`.
- Route guard: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only.
- UI contract: functional mobile utility style; semantic colors; no purple/pink/glass-heavy operational styling; show user/role/session/location/offline/queue context.

**Screen Catalog**
#### Screen `/+not-found`
- Source File: `frontend/app/+not-found.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/_layout`
- Source File: `frontend/app/_layout.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/__tests__/logs.offlineMode.test`
- Source File: `frontend/app/admin/__tests__/logs.offlineMode.test.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/__tests__/settings.save.test`
- Source File: `frontend/app/admin/__tests__/settings.save.test.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/_layout`
- Source File: `frontend/app/admin/_layout.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/control-panel-v2`
- Source File: `frontend/app/admin/control-panel-v2.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/control-panel`
- Source File: `frontend/app/admin/control-panel.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/dashboard-web.screen`
- Source File: `frontend/app/admin/dashboard-web.screen.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/dashboard-web`
- Source File: `frontend/app/admin/dashboard-web.tsx`
- Purpose: admin dashboard
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin`
- Source File: `frontend/app/admin/index.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/live-view`
- Source File: `frontend/app/admin/live-view.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/logs`
- Source File: `frontend/app/admin/logs.tsx`
- Purpose: admin log inspection
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/metrics`
- Source File: `frontend/app/admin/metrics.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/permissions`
- Source File: `frontend/app/admin/permissions.tsx`
- Purpose: permission management
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/realtime-dashboard.screen`
- Source File: `frontend/app/admin/realtime-dashboard.screen.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/realtime-dashboard`
- Source File: `frontend/app/admin/realtime-dashboard.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/reports`
- Source File: `frontend/app/admin/reports.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/security`
- Source File: `frontend/app/admin/security.tsx`
- Purpose: security administration
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/settings`
- Source File: `frontend/app/admin/settings.tsx`
- Purpose: system settings
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/sql-config`
- Source File: `frontend/app/admin/sql-config.tsx`
- Purpose: SQL configuration
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/unknown-items`
- Source File: `frontend/app/admin/unknown-items.tsx`
- Purpose: unknown item governance
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/users.screen`
- Source File: `frontend/app/admin/users.screen.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/admin/users`
- Source File: `frontend/app/admin/users.tsx`
- Purpose: user management
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/debug`
- Source File: `frontend/app/debug.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/forgot-password`
- Source File: `frontend/app/forgot-password.tsx`
- Purpose: password reset initiation
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/help`
- Source File: `frontend/app/help.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/`
- Source File: `frontend/app/index.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/login`
- Source File: `frontend/app/login.tsx`
- Purpose: credential login and role routing
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/notifications`
- Source File: `frontend/app/notifications.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/otp-verification`
- Source File: `frontend/app/otp-verification.tsx`
- Purpose: OTP verification
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/register`
- Source File: `frontend/app/register.tsx`
- Purpose: registration where enabled
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/reset-password`
- Source File: `frontend/app/reset-password.tsx`
- Purpose: password reset completion
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/security`
- Source File: `frontend/app/security.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/_layout`
- Source File: `frontend/app/staff/_layout.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/appearance`
- Source File: `frontend/app/staff/appearance.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/components/SectionLists`
- Source File: `frontend/app/staff/components/SectionLists.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/history`
- Source File: `frontend/app/staff/history.tsx`
- Purpose: staff history
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/home`
- Source File: `frontend/app/staff/home.tsx`
- Purpose: staff landing page
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff`
- Source File: `frontend/app/staff/index.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/item-detail.screen`
- Source File: `frontend/app/staff/item-detail.screen.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: Scanner and hardware keyboard behavior required; scans must not persist until validation succeeds.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/item-detail`
- Source File: `frontend/app/staff/item-detail.tsx`
- Purpose: item verification and count capture
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: Scanner and hardware keyboard behavior required; scans must not persist until validation succeeds.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/scan.screen`
- Source File: `frontend/app/staff/scan.screen.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: Scanner and hardware keyboard behavior required; scans must not persist until validation succeeds.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/scan`
- Source File: `frontend/app/staff/scan.tsx`
- Purpose: barcode scanner and item lookup
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: Scanner and hardware keyboard behavior required; scans must not persist until validation succeeds.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/serial-scanner`
- Source File: `frontend/app/staff/serial-scanner.tsx`
- Purpose: serial capture
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: Scanner and hardware keyboard behavior required; scans must not persist until validation succeeds.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/staff/settings`
- Source File: `frontend/app/staff/settings.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/__tests__/layout.offlineGate.test`
- Source File: `frontend/app/supervisor/__tests__/layout.offlineGate.test.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/__tests__/offlineQueue.test`
- Source File: `frontend/app/supervisor/__tests__/offlineQueue.test.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/__tests__/sessionDetail.offlineMode.test`
- Source File: `frontend/app/supervisor/__tests__/sessionDetail.offlineMode.test.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/_layout`
- Source File: `frontend/app/supervisor/_layout.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/activity-logs`
- Source File: `frontend/app/supervisor/activity-logs.tsx`
- Purpose: activity log review
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/appearance`
- Source File: `frontend/app/supervisor/appearance.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/bulk-ops`
- Source File: `frontend/app/supervisor/bulk-ops.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/dashboard`
- Source File: `frontend/app/supervisor/dashboard.tsx`
- Purpose: supervisor dashboard
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor`
- Source File: `frontend/app/supervisor/index.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/items`
- Source File: `frontend/app/supervisor/items.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/offline-queue`
- Source File: `frontend/app/supervisor/offline-queue.tsx`
- Purpose: offline queue visibility
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/session/[id]`
- Source File: `frontend/app/supervisor/session/[id].tsx`
- Purpose: session detail supervision
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/sessions`
- Source File: `frontend/app/supervisor/sessions.tsx`
- Purpose: session supervision
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/settings`
- Source File: `frontend/app/supervisor/settings.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/sync-conflicts`
- Source File: `frontend/app/supervisor/sync-conflicts.tsx`
- Purpose: sync conflict review
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/user-workflows`
- Source File: `frontend/app/supervisor/user-workflows.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/variance-details`
- Source File: `frontend/app/supervisor/variance-details.tsx`
- Purpose: variance decision detail
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/supervisor/variances`
- Source File: `frontend/app/supervisor/variances.tsx`
- Purpose: variance queue
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

#### Screen `/welcome`
- Source File: `frontend/app/welcome.tsx`
- Purpose: UNDEFINED BEHAVIOR: purpose is not documented in inspected route sources.
- UI States: initial render, authenticated/unauthenticated route state, permission-allowed content, disabled controls during writes, success acknowledgement.
- Empty States: explicit no data/no session/no results/no variances/no conflicts/no queue entries state as applicable.
- Loading States: route read loading, write pending, sync pending, and long-running report/sync progress where applicable.
- Error States: inline validation, sanitized API error, auth-expired route-to-login, permission denied, conflict, session unavailable.
- Offline States: write-capable routes show offline badge, queue count, last sync, and whether action is allowed offline; server-only writes are disabled.
- Permission Visibility: `/admin` admin only, `/supervisor` admin or supervisor, `/staff` staff only, from `frontend/src/utils/roleNavigation.ts`.
- Keyboard/Scanner Behavior: No scanner behavior declared; hardware keyboard input must not mutate stock state.
- Accessibility Behavior: 44x44 touch targets, semantic headings, screen-reader labels for icon-only controls, safe areas, text scaling, reduced motion, contrast-compliant status colors.
- Unresolved Risks: UNDEFINED BEHAVIOR: exact component states, copy, hooks, and permission checks require route-level audit before UI refactor.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: README Expo SDK 54 conflicts with package Expo 55.
- UNDEFINED BEHAVIOR: backend manager role has no frontend route model.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- The screen catalog is exhaustive by route file, but generated route coverage is not equal to UX acceptance. Each screen still requires route-level verification of copy, permissions, API hooks, offline state, loading state, empty state, scanner behavior, and accessibility behavior.
- Redirect and compatibility routes must document whether they are user-facing, deprecated, admin-only, or development-only.
- Permission visibility on the frontend must be treated as advisory. Server authorization remains mandatory for every action.
## 8. Offline-First Architecture

**Implementation**
- AsyncStorage keys: items_cache, offline_queue, sessions_cache, count_lines_cache, last_sync, user_data.
- Queue types: count_line, session, unknown_item.
- Queue statuses: pending, pending_retry, blocked_conflict, failed_manual_review.
- Queue TTL 7 days; max size advisory only.
- Sync lock allows one active run and one queued rerun; reconnect delay 2000 ms; periodic min 5 min; manual-review threshold 5; batch size 50.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: architecture references SQLite/WatermelonDB/Realm while current implementation uses AsyncStorage.
- SECURITY RISK: local queue encryption and lost-device wipe policy are REQUIRED INPUT.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Offline-first behavior must define four states per action: allowed offline, queued offline, blocked offline, and manual-review after sync. Any action not classified remains `UNDEFINED BEHAVIOR`.
- AsyncStorage persistence is not a secure durable database. Queue encryption, corruption recovery, migration, max-size enforcement, and lost-device handling are `REQUIRED INPUT`.
- Offline conflict resolution must never overwrite approved/locked server data. Server conflict forks and recount flows are the required recovery model.
## 9. Authentication & Authorization

**Mechanisms**
- JWT bearer/cookie auth, refresh tokens, route-level login limiter, PIN lockout, role permissions, frontend route guard.
- Roles in backend: staff, supervisor, manager, admin. Frontend: staff, supervisor, admin.

**Threat Model, Attack Vectors, Mitigations**
- JWT auth: token theft, forgery, replay; mitigate with strong secrets, short access tokens, refresh revocation, server-side permissions, sanitized logs.
- CORS/cookies: cross-origin token abuse; mitigate explicit production origins, no wildcard, secure cookie policy.
- LAN enforcement: public access; mitigate private/loopback checks and explicit bypass list.
- SQL connector: ERP write/injection; mitigate read-only credentials, SELECT/WITH allowlist, DML/DDL/EXEC blocklist, placeholder validation.
- Rate limiting: brute force/DoS; mitigate login/PIN limiters and Redis-backed global limits in production.
- Secrets: committed credentials; mitigate scans, secret manager, no source/log exposure.
- Containers/CI: privilege escalation/supply-chain; mitigate non-root, no allowPrivilegeEscalation, seccomp, read-only FS, digest pinning, least-privilege workflow permissions.
- Logging: sensitive data/log forging; mitigate sanitize_for_logging and structured logs.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: PIN schema exactly 4 digits versus service 4-6.
- UNDEFINED BEHAVIOR: manager UI and route visibility are not defined.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Auth contracts must include token lifetime, refresh rotation, token revocation, cookie flags, secure storage, single-session policy, and device binding if required. Missing values are `REQUIRED INPUT`.
- The WebSocket legacy query token path is a SECURITY RISK because URLs can be logged. Production must prefer bearer header, subprotocol, or cookie and must explicitly decide whether query token support is disabled.
- Manager role drift must be resolved before assigning manager-only permissions in UI.
## 10. Session Management

**State Models**
- Frozen lifecycle: Draft, Scheduled, Assigned, Locked, In Progress, Paused, Sync Pending, Validation Pending, Pending Approval, Approved, Partially Approved, Recount Requested, Reopened, Closed, Archived.
- Backend enum: CREATED, ACTIVE, PAUSED, REVIEW, PENDING_APPROVAL, CONFLICT, FINALIZED, CANCELLED.
- Governance transition observed: CREATED -> ACTIVE -> REVIEW -> FINALIZED.
- Legacy statuses include OPEN, ACTIVE, PAUSED, RECONCILE, COMPLETED, CLOSED, CANCELLED, FINALIZED.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: canonical session state must be decided before new workflow work.
- DATA INTEGRITY RISK: rack claim paths must align with SessionLifecycleService.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Session lifecycle must have one canonical state machine. Until resolved, new code must translate explicitly and must not add another state string.
- Every transition must define allowed actor, pre-state, post-state, required lock, version check, audit event, offline behavior, retry behavior, and rollback/reopen behavior.
- Location-scoped uniqueness must include warehouse, location type/name, floor, rack, and any business-specific partition. Missing location-key composition is `REQUIRED INPUT`.
## 11. Stock Verification Workflow

**Workflow**
- Scan/search item, normalize barcode, resolve ERP cache or unknown-item flow, show session/location context, capture quantities/UOM/serial/batch/MRP/damage/evidence/reason, persist online or offline, validate/write through backend, route approval/recount.
- Edge cases: duplicate scan, validator drift, serial mismatch, missing snapshot, ERP drift, MRP mismatch, required photo/reason, stale offline state.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: barcode validators differ across backend ERP API, ValidationService, and frontend utilities.
- DATA INTEGRITY RISK: missing snapshot blocks writes; legacy snapshot fallback needs migration decision.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Stock verification must preserve blind-count, strict-count, variance, serial, batch, condition, UOM, and MRP behavior separately. A count that validates quantity but skips serial or batch rules is incomplete.
- Snapshot freshness and ERP drift must be visible to the user and enforceable by the backend.
- Scanner workflows need duplicate-scan, partial-scan, unsupported barcode, camera denied, hardware scan burst, manual entry, and offline cache miss states.
## 12. Count Line Lifecycle

**Authoritative Lifecycle**
- Create: active session, location, snapshot, idempotency, semantic hash, UOM, serial, variance validation.
- Update: previous_version_id, version increment, transition validation, projection sync.
- Verify/unverify: update verified fields.
- Approve: status approved and approval fields, clear rejection/recount.
- Reject: rejected status, reason, clear approval/verified, set recount assignment.
- Delete: direct business-data deletes forbidden outside governed repair/archive.
- Governance modes: active_session, mutable_session, finalization, repair. skip_transaction/skip_governance forbidden.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- DATA INTEGRITY RISK: event-first append is not proven for all lifecycle operations.
- UNDEFINED BEHAVIOR: retention/archive of superseded versions is incomplete.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Count-line lifecycle must define immutable versus mutable fields by status. Approved, locked, finalized, and rejected states require explicit allowed-field lists.
- Recount creates a new version or linked count line; it must not mutate historical approved data without audit versioning.
- Duplicate prevention must remain layered: idempotency key, semantic hash, item/location/session duplicate filters, serial registry, and sync conflict checks.
## 13. Approval & Recount Workflow

**Approval Inputs and Rules**
- Inputs: variance percent/value, category, risk, serial mismatch, expiry, damage, location criticality, user role.
- Roles: Counter, Senior Counter, Supervisor, Auditor, Warehouse Manager, Admin, Master Data Team, Finance Reviewer, QA Reviewer.
- Counters cannot finalize. Overrides require remarks. Closed approvals immutable. Policy must be configuration-driven, not hardcoded.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- REQUIRED INPUT: final approval policy tables and thresholds are incomplete.
- DATA INTEGRITY RISK: hardcoded approval routing would violate architecture.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Approval policy must be data-driven and versioned. The policy version used for each decision must be stored with the decision audit trail.
- Recount assignment must define assignee, deadline, blind visibility, item lock behavior, original count visibility, and escalation if recount is not completed.
- Offline approval actions are blocked unless a separate versioned offline approval protocol is approved.
## 14. ERP Integration Architecture

**Boundaries**
- SQL Server ERP is read-only.
- Mongo `erp_items` and snapshots are writable app cache/projections, not ERP writes.
- Sync direction: SQL Server -> MongoDB -> Frontend.
- Admin SQL config must not introduce write-back.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: finalized-as-written-to-ERP wording conflicts with no SQL writes.
- SECURITY RISK: SQL credential storage/masking/rotation policy requires verification.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- ERP integration must list every ERP-derived field, whether it is copied to Mongo, whether it is frozen in snapshots, whether it is visible to staff, and whether local enrichment can override it.
- Any future ERP write-back requirement is an ARCHITECTURAL CONFLICT and must be treated as a new integration project with security, audit, reconciliation, and rollback design.
- SQL config UI must never expose credentials, raw connection strings, or write-test controls.
## 15. SQL Server Synchronization

**SQL Guard**
- Accept SELECT/WITH only after stripping comments/literals.
- Block semicolon, GO, INSERT, UPDATE, DELETE, MERGE, DROP, ALTER, TRUNCATE, CREATE, EXEC, GRANT, REVOKE, SELECT INTO.
- Validate `?` placeholder count.

**Sync**
- SQLSyncService updates Mongo `erp_items` and metadata; service default 900 seconds conflicts with config default 3600 seconds.
- SQLVerificationService compares SQL qty to Mongo cache and forks optimistic conflicts.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- DATA INTEGRITY RISK: interval/config precedence must be resolved.
- SECURITY RISK: SQL/password findings in CodeAnt require remediation.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- SQL synchronization must define cursor strategy, full versus incremental sync, batch boundaries, retry window, row transform validation, conflict fork behavior, and enriched-field preservation.
- SQL sync interval conflict between service default and config default must be resolved before production scheduling.
- SQL schema drift must generate observable degraded state rather than silently dropping fields.
## 16. Conflict Resolution

**Conflict Types**
- Offline local/server divergence, same serial active, same rack simultaneous, item transfer after snapshot, ERP stock changed after snapshot, batch mismatch, duplicate offline submission, approved/locked overwrite attempt.

**Resolution**
- Statuses: pending, resolved, ignored.
- Resolutions: accept_server, accept_local, merge, ignore.
- Approved/locked count lines fork into conflict_forks. Serial conflicts reject instead of merge. Quantity/batch merges must be additive and governed.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- DATA INTEGRITY RISK: item conflict resolution updating erp_items requires explicit write authority.
- REQUIRED INPUT: merge priority and escalation timeout rules are incomplete.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Conflict records must include local payload, server payload, detected fields, detector version, actor/device, timestamps, session snapshot version, and resolution audit.
- Merge must have field-level rules. Quantity, serial, batch, MRP, damage, and evidence cannot share one generic merge strategy.
- Conflict resolution must be permission-gated and cannot be executed offline unless a versioned offline conflict protocol is approved.
## 17. Event Sourcing Design

**Design**
- event_log is canonical long-term stock source.
- Required projections: items_snapshot, batch_records, serial_records, damage_logs, variance_logs, approvals, sync_queue, erp_snapshot, serial_registry.
- EventService supports idempotency and scan_fingerprint dedupe; ProjectionService and ProjectionWriteService maintain projections.
- Feature flags include V3_EVENT_SHADOW_WRITE, V3_EVENT_ENFORCE_WRITES, V3_PROJECTION_SHADOW, V3_PROJECTION_READS, V3_ENFORCE_LOCATION_SESSION_LOCK, V3_ENFORCE_GLOBAL_SERIALS, V3_ENFORCE_BACKEND_UOM.

**Unresolved Risks**
- ARCHITECTURAL CONFLICT: transition-phase direct count_line/projection writes still exist.
- DATA INTEGRITY RISK: projection rebuild/backfill is approval-gated and must not run without dry-run and confirmation.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Event sourcing requires append-only event contracts, event versioning, projection idempotency, replay order, replay checkpoints, poison-event handling, and drift detection.
- Projection rebuilds must state source event range, target collections, dry-run counters, backup/archive target, expected document counts, and verification queries before execution.
- If any current write path bypasses event append, event sourcing is not fully enforced and must remain marked as transition state.
## 18. Real-Time Communication

**Channels**
- WebSocket `/ws/updates`.
- Redis `rack:updates:{rack_id}`, `session:updates:{session_id}`, `global:notifications`.
- Durable truth remains Mongo/event/projections; realtime is a notification layer.

**Unresolved Risks**
- SCALABILITY RISK: in-memory WebSocket manager is process-local.
- SECURITY RISK: legacy query-token auth can leak through logs/proxies.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Real-time messages are notifications, not durable truth. Clients must reload durable state after reconnect, stale marker, or missed heartbeat.
- Redis pub/sub has no durable replay. If business requires guaranteed delivery, a durable queue or event cursor is `REQUIRED INPUT`.
- Broadcast payloads must be classified by sensitivity and scoped to user/session/role to avoid information leakage.
## 19. WebSocket Architecture

**Endpoint**
- `/ws/updates` accepts token via bearer header, jwt/bearer subprotocol, single JWT-like subprotocol, auth cookie, or legacy query token.
- Optional `session_id` query.
- Accepted roles in source: supervisor, staff, user, admin.
- Missing/invalid token, missing sub, or unsupported role closes with 1008; internal error attempts 1011.
- State maps: active_connections by user, session_connections by session, user_roles by user.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- UNDEFINED BEHAVIOR: token expiry after connection is not handled.
- SCALABILITY RISK: no max connection, backpressure, rate limit, or replay buffer documented.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- WebSocket contract must define heartbeat interval, server ping timeout, client reconnect backoff, max connections, per-message size, auth refresh strategy, and subscription authorization.
- Query-token auth must be deprecated or explicitly production-disabled because it can appear in logs.
- Multi-worker deployment requires shared fanout and connection accounting; process-local dictionaries are insufficient.
## 20. Governance & Write Authority

**Governed Authority**
- Count lines: CountLineWriteService.
- Sessions/snapshots: SessionLifecycleService.
- Unknown items: UnknownItemService.
- SQL sync/verification: SQLSyncService and SQLVerificationService.
- Event log: EventService append-only.
- Projections: projection services.
- Locks: LockService/LockManager.

**Human Checkpoint**
- Required before scripts with execute/apply/write/fix flags, DB backfills/migrations/bulk repairs, deploy/rollback/infra, destructive git, security-sensitive config with non-local impact.

**Unresolved Risks**
- DATA INTEGRITY RISK: legacy writes outside governed services can corrupt stock truth.
- REQUIRED INPUT: complete collection owner matrix remains incomplete.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Write authority must be enforced by code review and automated tests. Route handlers that call `db[...]` for governed collections should fail review unless explicitly exempted.
- Repair modes must be separately authenticated, logged, dry-run first, approval-gated, and verified.
- Governance must include read authority where sensitive projections or logs can leak data.
## 21. Audit Logging

**Mandatory Events**
- session_created, session_locked, item_scanned, qty_changed, serial_added, serial_removed, approval_submitted, approval_rejected, recount_requested, snapshot_generated, sync_conflict, override_performed.

**Stores**
- audit_logs, activity_logs, governance_events, event_log, error_logs.
- Audit must not include secrets, tokens, credentials, raw sensitive payloads, or unsanitized user strings.

**Unresolved Risks**
- SECURITY RISK: CodeAnt log forging and sensitive logging findings require sanitizer audit.
- REQUIRED INPUT: retention/legal hold/redaction/export policy is missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Audit events must include actor id, actor role, device id where available, request id, idempotency key, session id, target id, previous state hash or version, new state hash or version, timestamp, and reason when required.
- Audit retention, redaction, export, and legal hold are `REQUIRED INPUT`.
- Audit logging failure during a governed write must have a defined fail-open or fail-closed policy; current policy is `UNDEFINED BEHAVIOR` unless source code specifies it.
## 22. Distributed Locking

**Locks**
- Redis rack lock `rack:lock:{rack_id}` TTL 60 seconds.
- Redis heartbeat `user:heartbeat:{user_id}` TTL 90 seconds.
- Redis session lock `session:lock:{session_id}` TTL 3600 seconds.
- Mongo locks collection with expires_at TTL; item key `item:{session_id}:{item_code}`; approval key `approval:{count_line_id}` TTL 120 seconds.

**Workflow Coverage Rule**
- Every stock workflow must document happy path, failure path, rollback path, concurrency path, and offline sync path.
- Happy path: authorized actor performs valid operation against current session/snapshot and server persists through governed service.
- Failure path: validation, auth, lock, idempotency, snapshot, conflict, SQL, Redis, Mongo, or network failure returns explicit state.
- Rollback path: business rollback is versioned/recount/fork/repair, not silent overwrite.
- Concurrency path: use OCC, locks, unique indexes, idempotency, semantic hash, and conflict forks.
- Offline sync path: capture locally only where allowed, then reconcile through records-only sync with same idempotency.

**Unresolved Risks**
- SCALABILITY RISK: Redis fallback skipping rack lock validation is dev/test only and must fail closed in production.
- DATA INTEGRITY RISK: Redis lock and rack_registry state can diverge.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Locks must define ownership token, TTL, renewal cadence, release condition, forced release authority, audit event, and stale-lock reconciliation.
- Locks are not a substitute for unique indexes or OCC. Every critical lock-protected write still needs database-level protection.
- Offline clients cannot hold server locks. Server must revalidate lock and session state at sync time.
## 23. Security Architecture

**Threat Model, Attack Vectors, Mitigations**
- JWT auth: token theft, forgery, replay; mitigate with strong secrets, short access tokens, refresh revocation, server-side permissions, sanitized logs.
- CORS/cookies: cross-origin token abuse; mitigate explicit production origins, no wildcard, secure cookie policy.
- LAN enforcement: public access; mitigate private/loopback checks and explicit bypass list.
- SQL connector: ERP write/injection; mitigate read-only credentials, SELECT/WITH allowlist, DML/DDL/EXEC blocklist, placeholder validation.
- Rate limiting: brute force/DoS; mitigate login/PIN limiters and Redis-backed global limits in production.
- Secrets: committed credentials; mitigate scans, secret manager, no source/log exposure.
- Containers/CI: privilege escalation/supply-chain; mitigate non-root, no allowPrivilegeEscalation, seccomp, read-only FS, digest pinning, least-privilege workflow permissions.
- Logging: sensitive data/log forging; mitigate sanitize_for_logging and structured logs.

**CodeAnt Findings**
- SAST: ReDoS, sensitive logging, log forging, hardcoded credentials, JWT verification issue in tests.
- Secrets: JWT/basic-auth/secret keyword findings.
- Infrastructure: root containers, missing security contexts, default namespace, unpinned images, broad GitHub Actions permissions.
- SCA: 40 vulnerabilities reported.

**Unresolved Risks**
- SECURITY RISK: findings need tracked remediation or explicit risk acceptance.
- REQUIRED INPUT: vulnerability SLA and production signoff criteria are missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Security architecture must map every threat to a test or control. Controls not testable in CI or deployment checks remain operational risks.
- CodeAnt findings must be imported into an issue tracker or remediation register with severity, owner, target date, fix commit, and verification evidence.
- Production hardening must include dependency pinning, image scanning, secret scanning, infrastructure policy checks, and least-privilege workflow permissions.
## 24. API Specifications

**OpenAPI Inventory**
- Title: `Stock Count API`
- Version: `2.0.0`
- Paths: 327
- Operations: 359
- Security schemes: `{"HTTPBearer":{"scheme":"bearer","type":"http"}}`

**Common API Rules**
- Protected endpoints require bearer JWT unless public or route code says otherwise.
- Count writes use CountLineWriteService.
- Session writes use SessionLifecycleService.
- Sync batch is records-only; legacy operations HTTP 410.
- Endpoint-specific error schemas, rate limits, and permissions are incomplete in OpenAPI where marked.

### API Operation Catalog
#### API-1: `GET /`
- Endpoint: `/`
- Method: `GET`
- Purpose: Root. Root endpoint - basic service information
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-2: `GET /.well-known/security.txt`
- Endpoint: `/.well-known/security.txt`
- Method: `GET`
- Purpose: Security.txt. RFC 9116 security.txt file for responsible disclosure
- Tags: security
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - text/plain: string
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-3: `GET /api/activity-logs`
- Endpoint: `/api/activity-logs`
- Method: `GET`
- Purpose: Get Activity Logs. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `user` required=False schema=anyOf(string, null); query `action` required=False schema=anyOf(string, null); query `status_filter` required=False schema=anyOf(string, null); query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-4: `GET /api/activity-logs/stats`
- Endpoint: `/api/activity-logs/stats`
- Method: `GET`
- Purpose: Get Activity Stats. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-5: `GET /api/admin/control/devices`
- Endpoint: `/api/admin/control/devices`
- Method: `GET`
- Purpose: Get Login Devices. Get list of devices that have logged in
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-6: `POST /api/admin/control/logs/clear`
- Endpoint: `/api/admin/control/logs/clear`
- Method: `POST`
- Purpose: Clear Service Logs. Clear service logs
- Tags: Admin Control
- Request Schema: Parameters: query `service` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-7: `GET /api/admin/control/logs/{service}`
- Endpoint: `/api/admin/control/logs/{service}`
- Method: `GET`
- Purpose: Get Service Logs. Get service logs
- Tags: Admin Control
- Request Schema: Parameters: path `service` required=True schema=string; query `lines` required=False schema=integer; query `level` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-8: `GET /api/admin/control/reports/available`
- Endpoint: `/api/admin/control/reports/available`
- Method: `GET`
- Purpose: Get Available Reports. Get list of available reports
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-9: `POST /api/admin/control/reports/generate`
- Endpoint: `/api/admin/control/reports/generate`
- Method: `POST`
- Purpose: Generate Report. Generate a report
- Tags: Admin Control
- Request Schema: Parameters: query `report_id` required=True schema=string; query `format` required=False schema=string; query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-10: `POST /api/admin/control/services/backend/start`
- Endpoint: `/api/admin/control/services/backend/start`
- Method: `POST`
- Purpose: Start Backend. Start backend server
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-11: `POST /api/admin/control/services/backend/stop`
- Endpoint: `/api/admin/control/services/backend/stop`
- Method: `POST`
- Purpose: Stop Backend. Stop backend server
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-12: `POST /api/admin/control/services/frontend/start`
- Endpoint: `/api/admin/control/services/frontend/start`
- Method: `POST`
- Purpose: Start Frontend. Start frontend server
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-13: `POST /api/admin/control/services/frontend/stop`
- Endpoint: `/api/admin/control/services/frontend/stop`
- Method: `POST`
- Purpose: Stop Frontend. Stop frontend server
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-14: `GET /api/admin/control/services/status`
- Endpoint: `/api/admin/control/services/status`
- Method: `GET`
- Purpose: Get Services Status. Get status of all services (backend, frontend, MongoDB, SQL Server)
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-15: `GET /api/admin/control/sql-server/config`
- Endpoint: `/api/admin/control/sql-server/config`
- Method: `GET`
- Purpose: Get Sql Server Config. Get SQL Server configuration
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-16: `POST /api/admin/control/sql-server/config`
- Endpoint: `/api/admin/control/sql-server/config`
- Method: `POST`
- Purpose: Update Sql Server Config. Update SQL Server configuration
- Tags: Admin Control
- Request Schema: Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-17: `POST /api/admin/control/sql-server/test`
- Endpoint: `/api/admin/control/sql-server/test`
- Method: `POST`
- Purpose: Test Sql Server Connection. Test SQL Server connection
- Tags: Admin Control
- Request Schema: Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-18: `GET /api/admin/control/system/health-score`
- Endpoint: `/api/admin/control/system/health-score`
- Method: `GET`
- Purpose: Get System Health Score. Calculate and return system health score
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-19: `GET /api/admin/control/system/issues`
- Endpoint: `/api/admin/control/system/issues`
- Method: `GET`
- Purpose: Get System Issues. Get system issues and errors
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-20: `GET /api/admin/control/system/stats`
- Endpoint: `/api/admin/control/system/stats`
- Method: `GET`
- Purpose: Get System Stats. Get system statistics summary
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-21: `POST /api/admin/control/watchdog/run`
- Endpoint: `/api/admin/control/watchdog/run`
- Method: `POST`
- Purpose: Run Watchdog Checks. Manually trigger system watchdog checks.
Scans for velocity anomalies, brute force attacks, and system health issues.
- Tags: Admin Control
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-22: `GET /api/admin/dashboard/active-users`
- Endpoint: `/api/admin/dashboard/active-users`
- Method: `GET`
- Purpose: Get Active Users. Get list of currently active users with their status and session info.
- Tags: Admin Dashboard
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of component `ActiveUserInfo`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-23: `GET /api/admin/dashboard/error-logs`
- Endpoint: `/api/admin/dashboard/error-logs`
- Method: `GET`
- Purpose: Get Error Logs. Get recent API errors from the error log.
- Tags: Admin Dashboard
- Request Schema: Parameters: query `limit` required=False schema=integer; query `level` required=False schema=anyOf(string, null); query `hours` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: array of component `ErrorLogEntry`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-24: `GET /api/admin/dashboard/kpis`
- Endpoint: `/api/admin/dashboard/kpis`
- Method: `GET`
- Purpose: Get Dashboard Kpis. Get live KPIs for admin dashboard.
Includes total stock value, verified value, completion percentage, etc.
- Tags: Admin Dashboard
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `KPIResponse`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-25: `GET /api/admin/dashboard/performance-metrics`
- Endpoint: `/api/admin/dashboard/performance-metrics`
- Method: `GET`
- Purpose: Get Performance Metrics. Get performance metrics aggregated by time interval.
Used for charts showing latency, throughput, and error rates over time.
- Tags: Admin Dashboard
- Request Schema: Parameters: query `hours` required=False schema=integer; query `interval_minutes` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: array of component `PerformanceMetric`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-26: `GET /api/admin/dashboard/summary`
- Endpoint: `/api/admin/dashboard/summary`
- Method: `GET`
- Purpose: Get Dashboard Summary. Get a complete dashboard summary combining KPIs, system status, and recent activity.
Single endpoint for initial dashboard load.
- Tags: Admin Dashboard
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-27: `GET /api/admin/dashboard/system-status`
- Endpoint: `/api/admin/dashboard/system-status`
- Method: `GET`
- Purpose: Get System Status. Get real-time system health metrics.
Includes database connections, performance metrics, and resource usage.
- Tags: Admin Dashboard
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `SystemStatusResponse`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-28: `GET /api/admin/errors`
- Endpoint: `/api/admin/errors`
- Method: `GET`
- Purpose: Get Errors. Get error logs (admin only)

- **severity**: Filter by severity (critical, high, medium, low)
- **status**: Filter by status (new, acknowledged, resolved)
- **limit**: Maximum number of errors to return
- Tags: admin
- Request Schema: Parameters: query `severity` required=False schema=anyOf(string, null); query `status` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-29: `GET /api/admin/errors/dashboard`
- Endpoint: `/api/admin/errors/dashboard`
- Method: `GET`
- Purpose: Get Error Dashboard. Get complete error dashboard (admin only)
- Tags: admin
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-30: `POST /api/admin/errors/report`
- Endpoint: `/api/admin/errors/report`
- Method: `POST`
- Purpose: Report Error. Report an error from frontend

- **type**: Error type (NetworkError, ValidationError, etc.)
- **message**: Human-readable error message
- **severity**: low, medium, high, critical
- **context**: Additional context (endpoint, method, etc.)
- Tags: admin
- Request Schema: Body: application/json: component `ErrorReport`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-31: `GET /api/admin/errors/stats/summary`
- Endpoint: `/api/admin/errors/stats/summary`
- Method: `GET`
- Purpose: Get Error Summary. Get error statistics summary (admin only)
- Tags: admin
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-32: `DELETE /api/admin/errors/{error_id}`
- Endpoint: `/api/admin/errors/{error_id}`
- Method: `DELETE`
- Purpose: Delete Error. Delete error log entry (admin only)
- Tags: admin
- Request Schema: Parameters: path `error_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-33: `GET /api/admin/errors/{error_id}`
- Endpoint: `/api/admin/errors/{error_id}`
- Method: `GET`
- Purpose: Get Error Detail. Get detailed error information (admin only)
- Tags: admin
- Request Schema: Parameters: path `error_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-34: `PATCH /api/admin/errors/{error_id}/status`
- Endpoint: `/api/admin/errors/{error_id}/status`
- Method: `PATCH`
- Purpose: Update Error Status. Update error status (admin only)

- **status**: new, acknowledged, or resolved
- Tags: admin
- Request Schema: Parameters: path `error_id` required=True schema=string; query `status` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-35: `GET /api/admin/logs/backend`
- Endpoint: `/api/admin/logs/backend`
- Method: `GET`
- Purpose: Get Backend Logs. Get backend server logs
- Tags: Service Logs
- Request Schema: Parameters: query `lines` required=False schema=integer; query `level` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-36: `POST /api/admin/logs/clear`
- Endpoint: `/api/admin/logs/clear`
- Method: `POST`
- Purpose: Clear Logs. Clear logs for a service
- Tags: Service Logs
- Request Schema: Parameters: query `service` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-37: `GET /api/admin/logs/frontend`
- Endpoint: `/api/admin/logs/frontend`
- Method: `GET`
- Purpose: Get Frontend Logs. Get frontend/Expo logs
- Tags: Service Logs
- Request Schema: Parameters: query `lines` required=False schema=integer; query `level` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-38: `GET /api/admin/logs/mongodb`
- Endpoint: `/api/admin/logs/mongodb`
- Method: `GET`
- Purpose: Get Mongodb Logs. Get MongoDB logs
- Tags: Service Logs
- Request Schema: Parameters: query `lines` required=False schema=integer; query `level` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-39: `GET /api/admin/logs/system`
- Endpoint: `/api/admin/logs/system`
- Method: `GET`
- Purpose: Get System Logs. Get system/application logs
- Tags: Service Logs
- Request Schema: Parameters: query `lines` required=False schema=integer; query `level` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-40: `GET /api/admin/security/audit-log`
- Endpoint: `/api/admin/security/audit-log`
- Method: `GET`
- Purpose: Get Audit Log. Get security audit log from activity logs
- Tags: Security
- Request Schema: Parameters: query `limit` required=False schema=integer; query `hours` required=False schema=integer; query `action` required=False schema=anyOf(string, null); query `user` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-41: `GET /api/admin/security/failed-logins`
- Endpoint: `/api/admin/security/failed-logins`
- Method: `GET`
- Purpose: Get Failed Logins. Get failed login attempts
- Tags: Security
- Request Schema: Parameters: query `limit` required=False schema=integer; query `hours` required=False schema=integer; query `username` required=False schema=anyOf(string, null); query `ip_address` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-42: `GET /api/admin/security/ip-tracking`
- Endpoint: `/api/admin/security/ip-tracking`
- Method: `GET`
- Purpose: Get Ip Tracking. Get IP address tracking data
- Tags: Security
- Request Schema: Parameters: query `hours` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-43: `GET /api/admin/security/sessions`
- Endpoint: `/api/admin/security/sessions`
- Method: `GET`
- Purpose: Get Security Sessions. Get all active sessions for security monitoring
- Tags: Security
- Request Schema: Parameters: query `limit` required=False schema=integer; query `active_only` required=False schema=boolean
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-44: `GET /api/admin/security/summary`
- Endpoint: `/api/admin/security/summary`
- Method: `GET`
- Purpose: Get Security Summary. Get security summary dashboard data
- Tags: Security
- Request Schema: Parameters: query `hours` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-45: `GET /api/admin/security/suspicious-activity`
- Endpoint: `/api/admin/security/suspicious-activity`
- Method: `GET`
- Purpose: Get Suspicious Activity. Get suspicious activity patterns
- Tags: Security
- Request Schema: Parameters: query `hours` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-46: `GET /api/admin/settings/categories`
- Endpoint: `/api/admin/settings/categories`
- Method: `GET`
- Purpose: Get Settings Categories. Get settings categories
- Tags: Master Settings
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-47: `GET /api/admin/settings/parameters`
- Endpoint: `/api/admin/settings/parameters`
- Method: `GET`
- Purpose: Get System Parameters. Get all system parameters
- Tags: Master Settings
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-48: `PUT /api/admin/settings/parameters`
- Endpoint: `/api/admin/settings/parameters`
- Method: `PUT`
- Purpose: Update System Parameters. Update system parameters
- Tags: Master Settings
- Request Schema: Body: application/json: component `SystemParameters`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-49: `POST /api/admin/settings/reset`
- Endpoint: `/api/admin/settings/reset`
- Method: `POST`
- Purpose: Reset To Defaults. Reset settings to defaults
- Tags: Master Settings
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-50: `GET /api/admin/unknown-items`
- Endpoint: `/api/admin/unknown-items`
- Method: `GET`
- Purpose: List Unknown Items. List all reported unknown items
- Tags: Unknown Items Management
- Request Schema: Parameters: query `session_id` required=False schema=anyOf(string, null); query `reported_by` required=False schema=anyOf(string, null); query `include_dismissed` required=False schema=boolean; query `limit` required=False schema=integer; query `skip` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-51: `DELETE /api/admin/unknown-items/{item_id}`
- Endpoint: `/api/admin/unknown-items/{item_id}`
- Method: `DELETE`
- Purpose: Delete Unknown Item. Dismiss an unknown item report
- Tags: Unknown Items Management
- Request Schema: Parameters: path `item_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-52: `POST /api/admin/unknown-items/{item_id}/create-sku`
- Endpoint: `/api/admin/unknown-items/{item_id}/create-sku`
- Method: `POST`
- Purpose: Create Sku From Unknown. Create a new Master SKU from an unknown item report
- Tags: Unknown Items Management
- Request Schema: Parameters: path `item_id` required=True schema=string | Body: application/json: component `CreateSKUFromUnknownRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-53: `POST /api/admin/unknown-items/{item_id}/map`
- Endpoint: `/api/admin/unknown-items/{item_id}/map`
- Method: `POST`
- Purpose: Map Unknown To Sku. Map an unknown item report to an existing SKU in ERP
- Tags: Unknown Items Management
- Request Schema: Parameters: path `item_id` required=True schema=string | Body: application/json: component `MapUnknownItemRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-54: `GET /api/analytics/heatmap`
- Endpoint: `/api/analytics/heatmap`
- Method: `GET`
- Purpose: Get Heatmap. Get accuracy heatmap data for visualization.
Rule 10 KPI Enforcement.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `session_id` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-55: `POST /api/auth/change-password`
- Endpoint: `/api/auth/change-password`
- Method: `POST`
- Purpose: Change Password. Change user password.
Validates current password before allowing change.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-56: `POST /api/auth/change-pin`
- Endpoint: `/api/auth/change-pin`
- Method: `POST`
- Purpose: Change Pin. Change user PIN.
Validates current PIN or current password before allowing change.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-57: `GET /api/auth/heartbeat`
- Endpoint: `/api/auth/heartbeat`
- Method: `GET`
- Purpose: Heartbeat. Session heartbeat endpoint.
Returns current session status and user information.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-58: `POST /api/auth/login`
- Endpoint: `/api/auth/login`
- Method: `POST`
- Purpose: Login. User login endpoint with enhanced security and monitoring.

Validates user credentials and returns an access token with refresh token.
Implements rate limiting, IP tracking, and detailed logging.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `UserLogin`
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_TokenResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: Login attempts use route cache limiter defaults: `LOGIN_MAX_ATTEMPTS=5`, `LOGIN_LOCKOUT_SECONDS=300`; global middleware skips login/register.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only after correcting credentials or lockout expiry; repeated failures trigger lockout.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-59: `POST /api/auth/login-pin`
- Endpoint: `/api/auth/login-pin`
- Method: `POST`
- Purpose: Login With Pin. Staff PIN login endpoint (4-digit numeric PIN).

For staff users to quickly login with their PIN instead of username/password.
PIN is stored as a hashed value in the user document.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `PinLogin`
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_TokenResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: Login attempts use route cache limiter defaults: `LOGIN_MAX_ATTEMPTS=5`, `LOGIN_LOCKOUT_SECONDS=300`; global middleware skips login/register.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only after correcting credentials or lockout expiry; repeated failures trigger lockout.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-60: `POST /api/auth/login/pin`
- Endpoint: `/api/auth/login/pin`
- Method: `POST`
- Purpose: Login With Pin. Login with PIN.
- Tags: PIN Auth
- Request Schema: Body: application/json: component `PinLoginRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: Login attempts use route cache limiter defaults: `LOGIN_MAX_ATTEMPTS=5`, `LOGIN_LOCKOUT_SECONDS=300`; global middleware skips login/register.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only after correcting credentials or lockout expiry; repeated failures trigger lockout.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-61: `POST /api/auth/logout`
- Endpoint: `/api/auth/logout`
- Method: `POST`
- Purpose: Logout. Logout user by revoking their refresh token.

Request body should contain: {"refresh_token": "uuid-string"}
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-62: `GET /api/auth/me`
- Endpoint: `/api/auth/me`
- Method: `GET`
- Purpose: Get Me. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-63: `POST /api/auth/password-reset/confirm`
- Endpoint: `/api/auth/password-reset/confirm`
- Method: `POST`
- Purpose: Password Reset Confirm. Reset password using a valid reset token.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `PasswordResetConfirm`
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_dict_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-64: `POST /api/auth/password-reset/request`
- Endpoint: `/api/auth/password-reset/request`
- Method: `POST`
- Purpose: Password Reset Request. Request a password reset OTP.
Sends an OTP to the user's registered phone number via WhatsApp.
payload: { "username": "..." } or { "phone_number": "..." }
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `PasswordResetRequest`
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_dict_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-65: `POST /api/auth/password-reset/verify`
- Endpoint: `/api/auth/password-reset/verify`
- Method: `POST`
- Purpose: Password Reset Verify. Verify the OTP code.
Returns a short-lived reset token if successful.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `PasswordResetVerify`
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_dict_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-66: `POST /api/auth/pin-setup`
- Endpoint: `/api/auth/pin-setup`
- Method: `POST`
- Purpose: Pin Setup. Set or update user's 4-digit PIN.
The PIN is hashed using Argon2 and a O(1) lookup hash is also stored.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `PinSetup`
- Response Schema: `200` Successful Response - application/json: component `backend__api__schemas__ApiResponse_dict_str__Any__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-67: `POST /api/auth/pin/change`
- Endpoint: `/api/auth/pin/change`
- Method: `POST`
- Purpose: Change Pin. Change the current user's PIN.
- Tags: PIN Auth
- Request Schema: Body: application/json: component `PinChangeRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-68: `POST /api/auth/refresh`
- Endpoint: `/api/auth/refresh`
- Method: `POST`
- Purpose: Refresh Token. Refresh access token using refresh token.

Request body should contain: {"refresh_token": "uuid-string"}
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_TokenResponse_`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-69: `POST /api/auth/register`
- Endpoint: `/api/auth/register`
- Method: `POST`
- Purpose: Register. Register a new user.
Requires admin authentication, UNLESS no users exist yet (bootstrap).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `UserRegister`
- Response Schema: `201` Successful Response - application/json: component `TokenResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-70: `GET /api/count-lines`
- Endpoint: `/api/count-lines`
- Method: `GET`
- Purpose: List Count Lines. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `session_id` required=False schema=anyOf(string, null); query `item_code` required=False schema=anyOf(string, null); query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `limit` required=False schema=anyOf(integer, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-71: `POST /api/count-lines`
- Endpoint: `/api/count-lines`
- Method: `POST`
- Purpose: Create Count Line. Create or resubmit a count line while preserving snapshot and review semantics.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `CountLineCreate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-72: `POST /api/count-lines/batch`
- Endpoint: `/api/count-lines/batch`
- Method: `POST`
- Purpose: Create Count Lines Batch. Create multiple count lines in a single request (batch operation).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `CountLineBatchCreate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-73: `POST /api/count-lines/bulk/approve`
- Endpoint: `/api/count-lines/bulk/approve`
- Method: `POST`
- Purpose: Bulk Approve Count Lines. Bulk approve count lines.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `BulkCountLineUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-74: `POST /api/count-lines/bulk/reject`
- Endpoint: `/api/count-lines/bulk/reject`
- Method: `POST`
- Purpose: Bulk Reject Count Lines. Bulk reject count lines.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `BulkCountLineUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-75: `GET /api/count-lines/check-serial/{session_id}/{serial_number}`
- Endpoint: `/api/count-lines/check-serial/{session_id}/{serial_number}`
- Method: `GET`
- Purpose: Check Serial Uniqueness. Check whether a serial number has already been counted.

Returns a small payload that the UI can use to prevent duplicate serial entry.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `session_id` required=True schema=string; path `serial_number` required=True schema=string; query `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-76: `GET /api/count-lines/check/{session_id}/{item_code}`
- Endpoint: `/api/count-lines/check/{session_id}/{item_code}`
- Method: `GET`
- Purpose: Check Item Counted. Check if an item has already been counted in the session
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `session_id` required=True schema=string; path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-77: `POST /api/count-lines/draft`
- Endpoint: `/api/count-lines/draft`
- Method: `POST`
- Purpose: Save Count Line Draft. Save a draft count line.
Upserts the current autosave payload into count_line_drafts.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `CountLineCreate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-78: `GET /api/count-lines/item-batches/{item_identifier}`
- Endpoint: `/api/count-lines/item-batches/{item_identifier}`
- Method: `GET`
- Purpose: Get Item Batches. Get all batches for a specific item by item code or item ID.
Returns batch details including MRP, barcode, stock quantity, and location info.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `item_identifier` required=True schema=string; query `db_override` required=False schema=UNDEFINED BEHAVIOR
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-79: `POST /api/count-lines/merge`
- Endpoint: `/api/count-lines/merge`
- Method: `POST`
- Purpose: Merge Count Lines. Merge multiple count lines into one (deduplication).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `db_override` required=False schema=UNDEFINED BEHAVIOR | Body: application/json: component `CountLineMergeRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-80: `GET /api/count-lines/session/{session_id}`
- Endpoint: `/api/count-lines/session/{session_id}`
- Method: `GET`
- Purpose: Get Count Lines Route. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `session_id` required=True schema=string; query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `verified` required=False schema=anyOf(boolean, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-81: `DELETE /api/count-lines/{line_id}`
- Endpoint: `/api/count-lines/{line_id}`
- Method: `DELETE`
- Purpose: Delete Count Line. Delete a count line (requires supervisor override).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-82: `GET /api/count-lines/{line_id}`
- Endpoint: `/api/count-lines/{line_id}`
- Method: `GET`
- Purpose: Get Count Line Detail. Get a single count line for recount deep links and staff notifications.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-83: `PUT /api/count-lines/{line_id}`
- Endpoint: `/api/count-lines/{line_id}`
- Method: `PUT`
- Purpose: Update Count Line. Update an existing count line.

Currently used by bulk tooling to patch counted_qty. We keep the payload minimal
to avoid accidental overwrites of governance fields.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string | Body: application/json: component `CountLineUpdateRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-84: `PATCH /api/count-lines/{line_id}/add-quantity`
- Endpoint: `/api/count-lines/{line_id}/add-quantity`
- Method: `PATCH`
- Purpose: Add Quantity To Count Line. Increment the counted quantity on an existing count line.

Used by the UI when the same item_code is scanned again and the user chooses
"Add to Existing" instead of creating a new count line.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string | Body: application/json: component `AddQuantityRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-85: `PUT /api/count-lines/{line_id}/approve`
- Endpoint: `/api/count-lines/{line_id}/approve`
- Method: `PUT`
- Purpose: Approve Count Line Route. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string | Body: application/json: anyOf(component `CountLineApprovalRequest`, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-86: `PUT /api/count-lines/{line_id}/reject`
- Endpoint: `/api/count-lines/{line_id}/reject`
- Method: `PUT`
- Purpose: Reject Count Line Route. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string | Body: application/json: anyOf(component `CountLineRejectRequest`, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-87: `PUT /api/count-lines/{line_id}/unverify`
- Endpoint: `/api/count-lines/{line_id}/unverify`
- Method: `PUT`
- Purpose: Unverify Stock Route. HTTP route wrapper for unverify_stock (UI expects this endpoint).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-88: `PUT /api/count-lines/{line_id}/verify`
- Endpoint: `/api/count-lines/{line_id}/verify`
- Method: `PUT`
- Purpose: Verify Stock Route. HTTP route wrapper for verify_stock (UI expects this endpoint).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `line_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: `idempotency_key` and `semantic_hash` guards are enforced through `CountLineWriteService`.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-89: `GET /api/dashboard/columns`
- Endpoint: `/api/dashboard/columns`
- Method: `GET`
- Purpose: Get Available Columns. Get available columns for the dashboard table.
- Tags: Real-Time Dashboard
- Request Schema: Parameters: query `report_type` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-90: `POST /api/dashboard/data`
- Endpoint: `/api/dashboard/data`
- Method: `POST`
- Purpose: Get Dashboard Data. Get dashboard data with configured columns and filters.
- Tags: Real-Time Dashboard
- Request Schema: Body: application/json: component `DashboardConfig`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-91: `POST /api/dashboard/export/csv`
- Endpoint: `/api/dashboard/export/csv`
- Method: `POST`
- Purpose: Export Dashboard Csv. Export current dashboard view as CSV.
- Tags: Real-Time Dashboard
- Request Schema: Body: application/json: component `DashboardConfig`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-92: `POST /api/dashboard/export/xlsx`
- Endpoint: `/api/dashboard/export/xlsx`
- Method: `POST`
- Purpose: Export Dashboard Xlsx. Export current dashboard view as Excel.
- Tags: Real-Time Dashboard
- Request Schema: Body: application/json: component `DashboardConfig`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-93: `GET /api/dashboard/filters/options`
- Endpoint: `/api/dashboard/filters/options`
- Method: `GET`
- Purpose: Get Filter Options. Get available filter options (distinct values).
- Tags: Real-Time Dashboard
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-94: `GET /api/dashboard/item/{item_id}`
- Endpoint: `/api/dashboard/item/{item_id}`
- Method: `GET`
- Purpose: Get Item Details. Get detailed information for a specific item.
- Tags: Real-Time Dashboard
- Request Schema: Parameters: path `item_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-95: `GET /api/dashboard/stats`
- Endpoint: `/api/dashboard/stats`
- Method: `GET`
- Purpose: Get Dashboard Stats. Get real-time dashboard statistics.
- Tags: Real-Time Dashboard
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-96: `GET /api/dashboard/stream`
- Endpoint: `/api/dashboard/stream`
- Method: `GET`
- Purpose: Dashboard Stream. Server-Sent Events stream for real-time dashboard updates.
- Tags: Real-Time Dashboard
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `refresh_interval` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-97: `POST /api/diagnosis/auto-fix`
- Endpoint: `/api/diagnosis/auto-fix`
- Method: `POST`
- Purpose: Attempt Auto Fix. Attempt to auto-fix an error
- Tags: Self-Diagnosis
- Request Schema: Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-98: `POST /api/diagnosis/diagnose`
- Endpoint: `/api/diagnosis/diagnose`
- Method: `POST`
- Purpose: Diagnose Error Endpoint. Manually diagnose an error
- Tags: Self-Diagnosis
- Request Schema: Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-99: `GET /api/diagnosis/health`
- Endpoint: `/api/diagnosis/health`
- Method: `GET`
- Purpose: Get Health With Diagnosis. Get comprehensive health status with auto-diagnosis.

Returns a degraded payload if the underlying check exceeds
HEALTH_CHECK_TIMEOUT_SECONDS, since this endpoint backs a dashboard widget
that must never block initial render.
- Tags: Self-Diagnosis
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-100: `GET /api/diagnosis/patterns`
- Endpoint: `/api/diagnosis/patterns`
- Method: `GET`
- Purpose: Get Error Patterns. Get known error patterns and their solutions
- Tags: Self-Diagnosis
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-101: `GET /api/diagnosis/statistics`
- Endpoint: `/api/diagnosis/statistics`
- Method: `GET`
- Purpose: Get Error Statistics. Get error statistics with analysis
- Tags: Self-Diagnosis
- Request Schema: Parameters: query `hours` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-102: `GET /api/dynamic-fields/definitions`
- Endpoint: `/api/dynamic-fields/definitions`
- Method: `GET`
- Purpose: Get Field Definitions. Get all field definitions

**Query Parameters:**
- enabled_only: Only return enabled fields (default: true)
- visible_only: Only return visible fields (default: false)
- Tags: dynamic-fields
- Request Schema: Parameters: query `enabled_only` required=False schema=boolean; query `visible_only` required=False schema=boolean
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-103: `POST /api/dynamic-fields/definitions`
- Endpoint: `/api/dynamic-fields/definitions`
- Method: `POST`
- Purpose: Create Field Definition. Create a new dynamic field definition

**Permissions Required:** manage_dynamic_fields

**Field Types:**
- text: Single-line text
- number: Numeric value
- date: Date only
- datetime: Date and time
- select: Single selection from options
- multiselect: Multiple selections from options
- boolean: True/False
- json: Complex JSON data
- url: URL validation
- email: Email validation
- phone: Phone number

**Example:**
```json
{
 "field_name": "warranty_period",
 "field_type": "select",
 "display_label": "Warranty Period",
 "options": ["1 year", "2 years", "3 years", "5 years"],
 "required": false,
 "visible": true,
 "in_reports": true,
 "order": 10
}
```
- Tags: dynamic-fields
- Request Schema: Body: application/json: component `FieldDefinitionCreate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-104: `DELETE /api/dynamic-fields/definitions/{field_id}`
- Endpoint: `/api/dynamic-fields/definitions/{field_id}`
- Method: `DELETE`
- Purpose: Delete Field Definition. Delete a field definition (soft delete)

**Permissions Required:** manage_dynamic_fields
- Tags: dynamic-fields
- Request Schema: Parameters: path `field_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-105: `PUT /api/dynamic-fields/definitions/{field_id}`
- Endpoint: `/api/dynamic-fields/definitions/{field_id}`
- Method: `PUT`
- Purpose: Update Field Definition. Update a field definition

**Permissions Required:** manage_dynamic_fields
- Tags: dynamic-fields
- Request Schema: Parameters: path `field_id` required=True schema=string | Body: application/json: component `FieldDefinitionUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-106: `GET /api/dynamic-fields/items`
- Endpoint: `/api/dynamic-fields/items`
- Method: `GET`
- Purpose: Get Items With Fields. Get items filtered by dynamic field values

**Query Parameters:**
- field_name: Filter by specific field name
- field_value: Filter by specific field value
- limit: Maximum results (default: 100)
- skip: Skip results (default: 0)

**Example:** `/api/dynamic-fields/items?field_name=warranty_period&field_value=2 years`
- Tags: dynamic-fields
- Request Schema: Parameters: query `field_name` required=False schema=anyOf(string, null); query `field_value` required=False schema=anyOf(string, null); query `limit` required=False schema=integer; query `skip` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-107: `GET /api/dynamic-fields/statistics/{field_name}`
- Endpoint: `/api/dynamic-fields/statistics/{field_name}`
- Method: `GET`
- Purpose: Get Field Statistics. Get statistics for a specific dynamic field

**Returns statistics like:**
- Total items with this field
- Min/Max/Avg for numeric fields
- Value distribution for select fields
- Tags: dynamic-fields
- Request Schema: Parameters: path `field_name` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-108: `POST /api/dynamic-fields/values`
- Endpoint: `/api/dynamic-fields/values`
- Method: `POST`
- Purpose: Set Field Value. Set value for a dynamic field on an item

**Example:**
```json
{
 "item_code": "ITEM001",
 "field_name": "warranty_period",
 "value": "2 years"
}
```
- Tags: dynamic-fields
- Request Schema: Body: application/json: component `FieldValueSet`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-109: `POST /api/dynamic-fields/values/bulk`
- Endpoint: `/api/dynamic-fields/values/bulk`
- Method: `POST`
- Purpose: Set Field Values Bulk. Set field values for multiple items at once

**Permissions Required:** bulk_edit_items

**Example:**
```json
{
 "item_codes": ["ITEM001", "ITEM002", "ITEM003"],
 "field_values": {
 "warranty_period": "2 years",
 "supplier": "ABC Corp"
 }
}
```
- Tags: dynamic-fields
- Request Schema: Body: application/json: component `BulkFieldValueSet`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-110: `GET /api/dynamic-fields/values/{item_code}`
- Endpoint: `/api/dynamic-fields/values/{item_code}`
- Method: `GET`
- Purpose: Get Item Field Values. Get all dynamic field values for an item

**Returns:**
```json
{
 "warranty_period": {
 "value": "2 years",
 "set_by": "admin",
 "updated_at": "2025-01-01T10:00:00Z"
 },
 "supplier": {
 "value": "ABC Corp",
 "set_by": "supervisor1",
 "updated_at": "2025-01-02T14:30:00Z"
 }
}
```
- Tags: dynamic-fields
- Request Schema: Parameters: path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-111: `POST /api/dynamic-reports/generate`
- Endpoint: `/api/dynamic-reports/generate`
- Method: `POST`
- Purpose: Generate Report. Generate a report from template or custom data

**Permissions Required:** generate_reports

**Options:**
1. Use saved template: Provide `template_id`
2. Use custom template: Provide `template_data`
3. Override filters: Provide `runtime_filters`

**Example with Template:**
```json
{
 "template_id": "507f1f77bcf86cd799439011",
 "runtime_filters": {
 "warehouse": "Main Warehouse"
 }
}
```

**Example with Custom Template:**
```json
{
 "template_data": {
 "name": "Custom Report",
 "report_type": "items",
 "fields": [
 {"name": "item_code", "label": "Code"},
 {"name": "item_name", "label": "Name"}
 ],
 "format": "excel"
 }
}
```

**Returns:** Report metadata with download link
- Tags: dynamic-reports
- Request Schema: Body: application/json: component `ReportGeneration`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-112: `GET /api/dynamic-reports/history`
- Endpoint: `/api/dynamic-reports/history`
- Method: `GET`
- Purpose: Get Generated Reports. Get history of generated reports

**Query Parameters:**
- limit: Maximum number of reports (default: 50)

**Returns:** List of recently generated reports
- Tags: dynamic-reports
- Request Schema: Parameters: query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-113: `GET /api/dynamic-reports/quick/items-with-fields`
- Endpoint: `/api/dynamic-reports/quick/items-with-fields`
- Method: `GET`
- Purpose: Quick Report Items With Fields. Quick report: All items with their dynamic field values

**Query Parameters:**
- format: Output format (excel, csv, json) - default: excel

**Returns:** Immediate file download
- Tags: dynamic-reports
- Request Schema: Parameters: query `format` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-114: `GET /api/dynamic-reports/quick/variance-summary`
- Endpoint: `/api/dynamic-reports/quick/variance-summary`
- Method: `GET`
- Purpose: Quick Report Variance Summary. Quick report: Variance summary with filters

**Query Parameters:**
- start_date: Filter from date (ISO format)
- end_date: Filter to date (ISO format)
- warehouse: Filter by warehouse
- format: Output format (excel, csv, json) - default: excel
- Tags: dynamic-reports
- Request Schema: Parameters: query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `format` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-115: `GET /api/dynamic-reports/templates`
- Endpoint: `/api/dynamic-reports/templates`
- Method: `GET`
- Purpose: Get Report Templates. Get all report templates

**Query Parameters:**
- report_type: Filter by report type (optional)
- Tags: dynamic-reports
- Request Schema: Parameters: query `report_type` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-116: `POST /api/dynamic-reports/templates`
- Endpoint: `/api/dynamic-reports/templates`
- Method: `POST`
- Purpose: Create Report Template. Create a new report template

**Permissions Required:** manage_reports

**Report Types:**
- items: Item master data reports
- sessions: Counting session reports
- variance: Variance analysis reports
- audit: Audit log reports
- custom: Custom aggregated reports

**Supported Formats:**
- excel: Excel spreadsheet (.xlsx)
- csv: Comma-separated values (.csv)
- json: JSON format (.json)
- pdf: PDF document (.pdf)

**Example:**
```json
{
 "name": "Monthly Variance Report",
 "description": "Variance analysis by warehouse",
 "report_type": "variance",
 "fields": [
 {"name": "warehouse", "label": "Warehouse"},
 {"name": "item_code", "label": "Item Code"},
 {"name": "variance", "label": "Variance"}
 ],
 "filters": {
 "session_date": {"$gte": "2025-01-01"}
 },
 "grouping": ["warehouse"],
 "aggregations": {
 "variance": "sum"
 },
 "format": "excel"
}
```
- Tags: dynamic-reports
- Request Schema: Body: application/json: component `ReportTemplate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-117: `GET /api/dynamic-reports/{report_id}/download`
- Endpoint: `/api/dynamic-reports/{report_id}/download`
- Method: `GET`
- Purpose: Download Report. Download a generated report file

**Path Parameters:**
- report_id: ID of the generated report

**Returns:** File download stream
- Tags: dynamic-reports
- Request Schema: Parameters: path `report_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-118: `GET /api/enterprise/audit/compliance-report`
- Endpoint: `/api/enterprise/audit/compliance-report`
- Method: `GET`
- Purpose: Get Compliance Report. Generate compliance audit report
- Tags: Enterprise
- Request Schema: Parameters: query `days` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-119: `GET /api/enterprise/audit/logs`
- Endpoint: `/api/enterprise/audit/logs`
- Method: `GET`
- Purpose: Get Audit Logs. Get audit logs with filtering
- Tags: Enterprise
- Request Schema: Parameters: query `event_type` required=False schema=anyOf(string, null); query `username` required=False schema=anyOf(string, null); query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null); query `severity` required=False schema=anyOf(string, null); query `limit` required=False schema=integer; query `skip` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-120: `GET /api/enterprise/audit/verify-integrity`
- Endpoint: `/api/enterprise/audit/verify-integrity`
- Method: `GET`
- Purpose: Verify Audit Integrity. Verify audit log integrity (tamper detection)
- Tags: Enterprise
- Request Schema: Parameters: query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-121: `GET /api/enterprise/circuit-breakers`
- Endpoint: `/api/enterprise/circuit-breakers`
- Method: `GET`
- Purpose: Get Circuit Breakers. Get status of all circuit breakers
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-122: `GET /api/enterprise/features`
- Endpoint: `/api/enterprise/features`
- Method: `GET`
- Purpose: Get Feature Flags. Get all feature flags
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-123: `POST /api/enterprise/features`
- Endpoint: `/api/enterprise/features`
- Method: `POST`
- Purpose: Create Feature Flag. Create a new feature flag
- Tags: Enterprise
- Request Schema: Body: application/json: component `FeatureFlagRequest`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-124: `GET /api/enterprise/features/enabled`
- Endpoint: `/api/enterprise/features/enabled`
- Method: `GET`
- Purpose: Get Enabled Features. Get all enabled features for current user
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of string
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-125: `DELETE /api/enterprise/features/{key}`
- Endpoint: `/api/enterprise/features/{key}`
- Method: `DELETE`
- Purpose: Delete Feature Flag. Delete a feature flag
- Tags: Enterprise
- Request Schema: Parameters: path `key` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-126: `GET /api/enterprise/features/{key}`
- Endpoint: `/api/enterprise/features/{key}`
- Method: `GET`
- Purpose: Check Feature. Check if a feature is enabled for current user
- Tags: Enterprise
- Request Schema: Parameters: path `key` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-127: `PATCH /api/enterprise/features/{key}`
- Endpoint: `/api/enterprise/features/{key}`
- Method: `PATCH`
- Purpose: Update Feature Flag. Update a feature flag
- Tags: Enterprise
- Request Schema: Parameters: path `key` required=True schema=string | Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-128: `POST /api/enterprise/features/{key}/disable`
- Endpoint: `/api/enterprise/features/{key}/disable`
- Method: `POST`
- Purpose: Disable Feature. Disable a feature flag
- Tags: Enterprise
- Request Schema: Parameters: path `key` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-129: `POST /api/enterprise/features/{key}/enable`
- Endpoint: `/api/enterprise/features/{key}/enable`
- Method: `POST`
- Purpose: Enable Feature. Enable a feature flag
- Tags: Enterprise
- Request Schema: Parameters: path `key` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-130: `POST /api/enterprise/governance/apply-retention`
- Endpoint: `/api/enterprise/governance/apply-retention`
- Method: `POST`
- Purpose: Apply Retention Policies. Apply retention policies (delete expired data)
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-131: `GET /api/enterprise/governance/compliance-report`
- Endpoint: `/api/enterprise/governance/compliance-report`
- Method: `GET`
- Purpose: Get Governance Compliance Report. Get data governance compliance report
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-132: `GET /api/enterprise/governance/data-requests`
- Endpoint: `/api/enterprise/governance/data-requests`
- Method: `GET`
- Purpose: Get Pending Data Requests. Get pending GDPR data subject requests
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-133: `POST /api/enterprise/governance/data-requests`
- Endpoint: `/api/enterprise/governance/data-requests`
- Method: `POST`
- Purpose: Create Data Request. Create a GDPR data subject request
- Tags: Enterprise
- Request Schema: Body: application/json: component `DataSubjectRequestCreate`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-134: `POST /api/enterprise/governance/data-requests/{request_id}/process`
- Endpoint: `/api/enterprise/governance/data-requests/{request_id}/process`
- Method: `POST`
- Purpose: Process Data Request. Process a GDPR data subject request
- Tags: Enterprise
- Request Schema: Parameters: path `request_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-135: `GET /api/enterprise/governance/inventory`
- Endpoint: `/api/enterprise/governance/inventory`
- Method: `GET`
- Purpose: Get Data Inventory. Get data inventory with classifications
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-136: `GET /api/enterprise/governance/retention-policies`
- Endpoint: `/api/enterprise/governance/retention-policies`
- Method: `GET`
- Purpose: Get Retention Policies. Get all data retention policies
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-137: `POST /api/enterprise/governance/retention-policies`
- Endpoint: `/api/enterprise/governance/retention-policies`
- Method: `POST`
- Purpose: Set Retention Policy. Set or update a retention policy
- Tags: Enterprise
- Request Schema: Body: application/json: component `RetentionPolicyRequest`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-138: `GET /api/enterprise/metrics`
- Endpoint: `/api/enterprise/metrics`
- Method: `GET`
- Purpose: Get Enterprise Metrics. Get enterprise metrics
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-139: `GET /api/enterprise/metrics/prometheus`
- Endpoint: `/api/enterprise/metrics/prometheus`
- Method: `GET`
- Purpose: Get Prometheus Metrics. Get metrics in Prometheus format
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-140: `GET /api/enterprise/security/events`
- Endpoint: `/api/enterprise/security/events`
- Method: `GET`
- Purpose: Get Security Events. Get recent security events
- Tags: Enterprise
- Request Schema: Parameters: query `limit` required=False schema=integer; query `event_type` required=False schema=anyOf(string, null); query `severity` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-141: `POST /api/enterprise/security/ip-list`
- Endpoint: `/api/enterprise/security/ip-list`
- Method: `POST`
- Purpose: Add To Ip List. Add IP to whitelist or blacklist
- Tags: Enterprise
- Request Schema: Body: application/json: component `IPListEntry`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-142: `DELETE /api/enterprise/security/ip-list/{ip_address}`
- Endpoint: `/api/enterprise/security/ip-list/{ip_address}`
- Method: `DELETE`
- Purpose: Remove From Ip List. Remove IP from list
- Tags: Enterprise
- Request Schema: Parameters: path `ip_address` required=True schema=string; query `list_type` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-143: `GET /api/enterprise/security/ip-lists`
- Endpoint: `/api/enterprise/security/ip-lists`
- Method: `GET`
- Purpose: Get Ip Lists. Get IP whitelist and blacklist
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-144: `GET /api/enterprise/security/locked-accounts`
- Endpoint: `/api/enterprise/security/locked-accounts`
- Method: `GET`
- Purpose: Get Locked Accounts. Get all currently locked accounts
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-145: `DELETE /api/enterprise/security/sessions/{user_id}`
- Endpoint: `/api/enterprise/security/sessions/{user_id}`
- Method: `DELETE`
- Purpose: Terminate User Sessions. Terminate all sessions for a user
- Tags: Enterprise
- Request Schema: Parameters: path `user_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-146: `GET /api/enterprise/security/sessions/{user_id}`
- Endpoint: `/api/enterprise/security/sessions/{user_id}`
- Method: `GET`
- Purpose: Get User Sessions. Get all active sessions for a user
- Tags: Enterprise
- Request Schema: Parameters: path `user_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-147: `GET /api/enterprise/security/summary`
- Endpoint: `/api/enterprise/security/summary`
- Method: `GET`
- Purpose: Get Security Summary. Get security status summary
- Tags: Enterprise
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-148: `POST /api/enterprise/security/unlock-account`
- Endpoint: `/api/enterprise/security/unlock-account`
- Method: `POST`
- Purpose: Unlock Account. Manually unlock a locked account
- Tags: Enterprise
- Request Schema: Body: application/json: component `UnlockAccountRequest`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-149: `GET /api/erp/config`
- Endpoint: `/api/erp/config`
- Method: `GET`
- Purpose: Get Erp Config. Get ERP configuration and connection status for the frontend.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-150: `GET /api/erp/items`
- Endpoint: `/api/erp/items`
- Method: `GET`
- Purpose: Get All Items. Get all items or search items from MongoDB
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `search` required=False schema=anyOf(string, null); query `page` required=False schema=integer; query `page_size` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-151: `GET /api/erp/items/barcode/{barcode}`
- Endpoint: `/api/erp/items/barcode/{barcode}`
- Method: `GET`
- Purpose: Get Item By Barcode. Get item details by barcode from MongoDB.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `barcode` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `ERPItem`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-152: `POST /api/erp/items/{item_code}/refresh-stock`
- Endpoint: `/api/erp/items/{item_code}/refresh-stock`
- Method: `POST`
- Purpose: Refresh Item Stock. Refresh item stock from ERP and update MongoDB
(Now just returns the data from MongoDB as ERP is disabled)
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-153: `POST /api/erp/test`
- Endpoint: `/api/erp/test`
- Method: `POST`
- Purpose: Test Erp Connection. Manually test the ERP connection.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-154: `DELETE /api/error-logs`
- Endpoint: `/api/error-logs`
- Method: `DELETE`
- Purpose: Delete Error Logs. Clear all error logs.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-155: `GET /api/error-logs`
- Endpoint: `/api/error-logs`
- Method: `GET`
- Purpose: Get Error Logs. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `severity` required=False schema=anyOf(string, null); query `error_type` required=False schema=anyOf(string, null); query `endpoint` required=False schema=anyOf(string, null); query `resolved` required=False schema=anyOf(boolean, null); query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-156: `GET /api/error-logs/stats`
- Endpoint: `/api/error-logs/stats`
- Method: `GET`
- Purpose: Get Error Stats. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-157: `GET /api/error-logs/{log_id}`
- Endpoint: `/api/error-logs/{log_id}`
- Method: `GET`
- Purpose: Get Error Detail. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `log_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-158: `PUT /api/error-logs/{log_id}/resolve`
- Endpoint: `/api/error-logs/{log_id}/resolve`
- Method: `PUT`
- Purpose: Resolve Error. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `log_id` required=True schema=string | Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-159: `GET /api/exports/results`
- Endpoint: `/api/exports/results`
- Method: `GET`
- Purpose: List Export Results. List export results
- Tags: exports
- Request Schema: Parameters: query `schedule_id` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-160: `GET /api/exports/results/{result_id}/download`
- Endpoint: `/api/exports/results/{result_id}/download`
- Method: `GET`
- Purpose: Download Export Result. Download an export result file
- Tags: exports
- Request Schema: Parameters: path `result_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-161: `GET /api/exports/schedules`
- Endpoint: `/api/exports/schedules`
- Method: `GET`
- Purpose: List Export Schedules. List all export schedules
- Tags: exports
- Request Schema: Parameters: query `enabled_only` required=False schema=boolean
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-162: `POST /api/exports/schedules`
- Endpoint: `/api/exports/schedules`
- Method: `POST`
- Purpose: Create Export Schedule. Create a new export schedule
- Tags: exports
- Request Schema: Body: application/json: component `ExportScheduleCreate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-163: `DELETE /api/exports/schedules/{schedule_id}`
- Endpoint: `/api/exports/schedules/{schedule_id}`
- Method: `DELETE`
- Purpose: Delete Export Schedule. Delete an export schedule
- Tags: exports
- Request Schema: Parameters: path `schedule_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-164: `GET /api/exports/schedules/{schedule_id}`
- Endpoint: `/api/exports/schedules/{schedule_id}`
- Method: `GET`
- Purpose: Get Export Schedule. Get details of a specific export schedule
- Tags: exports
- Request Schema: Parameters: path `schedule_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-165: `PUT /api/exports/schedules/{schedule_id}`
- Endpoint: `/api/exports/schedules/{schedule_id}`
- Method: `PUT`
- Purpose: Update Export Schedule. Update an export schedule
- Tags: exports
- Request Schema: Parameters: path `schedule_id` required=True schema=string | Body: application/json: component `ExportScheduleUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-166: `POST /api/exports/schedules/{schedule_id}/execute`
- Endpoint: `/api/exports/schedules/{schedule_id}/execute`
- Method: `POST`
- Purpose: Execute Export Schedule. Manually execute an export schedule
- Tags: exports
- Request Schema: Parameters: path `schedule_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-167: `GET /api/health/`
- Endpoint: `/api/health/`
- Method: `GET`
- Purpose: Health Check. Basic health check endpoint
Returns 200 if service is running

Usage: Monitoring systems, load balancers
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-168: `GET /api/health/detailed`
- Endpoint: `/api/health/detailed`
- Method: `GET`
- Purpose: Detailed Health Check. Detailed health check with metrics
Includes version, uptime, database status, and performance metrics

Usage: Monitoring dashboards, troubleshooting
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-169: `GET /api/health/live`
- Endpoint: `/api/health/live`
- Method: `GET`
- Purpose: Liveness Check. Kubernetes liveness probe
Returns 200 if application is alive (not deadlocked)

Usage: k8s livenessProbe
Failure action: Restart container
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-170: `GET /api/health/ready`
- Endpoint: `/api/health/ready`
- Method: `GET`
- Purpose: Readiness Check. Kubernetes readiness probe
Returns 200 if application is ready to serve traffic
Checks: Database connections, critical services, connection pools

Usage: k8s readinessProbe
Failure action: Remove from load balancer
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-171: `GET /api/health/startup`
- Endpoint: `/api/health/startup`
- Method: `GET`
- Purpose: Startup Check. Kubernetes startup probe
Returns 200 when application has finished starting up
Used for slow-starting applications

Usage: k8s startupProbe
Failure action: Restart container after failureThreshold
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-172: `GET /api/item-batches/{item_code}`
- Endpoint: `/api/item-batches/{item_code}`
- Method: `GET`
- Purpose: Get Item Batches. Get batches/variants for a specific item code.
Used by the frontend to show all variants (same item code, different barcodes/stock).
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-173: `GET /api/items/search`
- Endpoint: `/api/items/search`
- Method: `GET`
- Purpose: Search Items Compatibility. Compatibility endpoint for legacy clients that call `/api/items/search?query=...`.
Reuses the new `/api/erp/items?search=...` implementation.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `query` required=False schema=anyOf(string, null); query `search` required=False schema=anyOf(string, null); query `page` required=False schema=integer; query `page_size` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-174: `GET /api/items/search/filters`
- Endpoint: `/api/items/search/filters`
- Method: `GET`
- Purpose: Get search filter values. Returns distinct categories and warehouses for client-side filters.
- Tags: Search
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_SearchFiltersResponse_`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-175: `GET /api/items/search/optimized`
- Endpoint: `/api/items/search/optimized`
- Method: `GET`
- Purpose: Optimized item search. Search items with relevance scoring and pagination.

 **Scoring Priority:**
 1. Exact barcode match (1000 points)
 2. Partial barcode prefix match (500+ points)
 3. Exact item_code match (400 points)
 4. Name prefix match (300+ points)
 5. Name contains query (200+ points)
 6. Fuzzy name match (0-100 points)

 **Usage Tips:**
 - Use with 300ms debounce on frontend
 - Barcode scans return instant exact matches
 - Minimum query length is 2 characters
- Tags: Search
- Request Schema: Parameters: query `q` required=True schema=string; query `limit` required=False schema=integer; query `offset` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_OptimizedSearchResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-176: `POST /api/items/search/optimized`
- Endpoint: `/api/items/search/optimized`
- Method: `POST`
- Purpose: Optimized item search (POST). POST version for search - allows body parameters for complex queries
- Tags: Search
- Request Schema: Parameters: query `q` required=True schema=string; query `limit` required=False schema=integer; query `offset` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_OptimizedSearchResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-177: `GET /api/items/search/suggestions`
- Endpoint: `/api/items/search/suggestions`
- Method: `GET`
- Purpose: Get autocomplete suggestions. Returns up to 5 name suggestions for autocomplete
- Tags: Search
- Request Schema: Parameters: query `q` required=True schema=string; query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_SuggestionsResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-178: `GET /api/legacy/sessions/analytics`
- Endpoint: `/api/legacy/sessions/analytics`
- Method: `GET`
- Purpose: Get Sessions Analytics. Get aggregated session analytics (supervisor only)
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-179: `GET /api/legacy/sessions/{session_id}`
- Endpoint: `/api/legacy/sessions/{session_id}`
- Method: `GET`
- Purpose: Get Session By Id. Get a specific session by ID
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-180: `GET /api/locations/warehouses`
- Endpoint: `/api/locations/warehouses`
- Method: `GET`
- Purpose: Get Warehouses. Fetch warehouses with priority.

SQL -> Mongo -> default (create missing in Mongo).
- Tags: Locations
- Request Schema: Parameters: query `zone` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-181: `GET /api/locations/zones`
- Endpoint: `/api/locations/zones`
- Method: `GET`
- Purpose: Get Zones. Fetch all zones (floors) from ERP, with offline fallback
- Tags: Locations
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-182: `GET /api/mapping/columns`
- Endpoint: `/api/mapping/columns`
- Method: `GET`
- Purpose: Get Columns. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: Database Mapping
- Request Schema: Parameters: query `host` required=True schema=string; query `database` required=True schema=string; query `table_name` required=True schema=string; query `port` required=False schema=integer; query `user` required=False schema=anyOf(string, null); query `password` required=False schema=anyOf(string, null); query `schema` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-183: `GET /api/mapping/current`
- Endpoint: `/api/mapping/current`
- Method: `GET`
- Purpose: Get Current Mapping. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: Database Mapping
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-184: `POST /api/mapping/preview`
- Endpoint: `/api/mapping/preview`
- Method: `POST`
- Purpose: Preview Mapping. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: Database Mapping
- Request Schema: Parameters: query `host` required=True schema=string; query `database` required=True schema=string; query `port` required=False schema=integer; query `user` required=False schema=anyOf(string, null); query `password` required=False schema=anyOf(string, null) | Body: application/json: component `MappingConfig`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-185: `POST /api/mapping/save`
- Endpoint: `/api/mapping/save`
- Method: `POST`
- Purpose: Save Mapping. Saves both connection parameters and mapping configuration.
Expects data = { "connection": {...}, "mapping": {...} }
- Tags: Database Mapping
- Request Schema: Body: application/json: object properties=[] required=[]
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-186: `GET /api/mapping/tables`
- Endpoint: `/api/mapping/tables`
- Method: `GET`
- Purpose: Get Tables. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: Database Mapping
- Request Schema: Parameters: query `host` required=True schema=string; query `database` required=True schema=string; query `port` required=False schema=integer; query `user` required=False schema=anyOf(string, null); query `password` required=False schema=anyOf(string, null); query `schema` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-187: `GET /api/mapping/test_direct`
- Endpoint: `/api/mapping/test_direct`
- Method: `GET`
- Purpose: Test Direct. Return a minimal payload for mapping smoke tests.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-188: `GET /api/metrics`
- Endpoint: `/api/metrics`
- Method: `GET`
- Purpose: Get Prometheus Metrics. Get metrics in Prometheus text format
This endpoint can be scraped by Prometheus for monitoring
- Tags: metrics
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-189: `GET /api/metrics/health`
- Endpoint: `/api/metrics/health`
- Method: `GET`
- Purpose: Get Health Metrics. Get health status metrics with database status
- Tags: metrics
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-190: `GET /api/metrics/json`
- Endpoint: `/api/metrics/json`
- Method: `GET`
- Purpose: Get Metrics Json. Get metrics in JSON format for dashboards
- Tags: metrics
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-191: `GET /api/metrics/staff-performance`
- Endpoint: `/api/metrics/staff-performance`
- Method: `GET`
- Purpose: Get Staff Performance. Get staff performance metrics
- Tags: metrics
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-192: `GET /api/metrics/stats`
- Endpoint: `/api/metrics/stats`
- Method: `GET`
- Purpose: Get Metrics Stats. Get system statistics and metrics
- Tags: metrics
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-193: `GET /api/notes`
- Endpoint: `/api/notes`
- Method: `GET`
- Purpose: List Notes. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `q` required=False schema=anyOf(string, null); query `page` required=False schema=integer; query `page_size` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-194: `POST /api/notes`
- Endpoint: `/api/notes`
- Method: `POST`
- Purpose: Create Note. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `NoteCreate`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-195: `DELETE /api/notes/{note_id}`
- Endpoint: `/api/notes/{note_id}`
- Method: `DELETE`
- Purpose: Delete Note. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `note_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-196: `GET /api/notifications`
- Endpoint: `/api/notifications`
- Method: `GET`
- Purpose: Get Notifications. Get user's notifications.

Returns in-app notifications with optional filtering.
- Tags: Notifications
- Request Schema: Parameters: query `unread_only` required=False schema=boolean; query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `NotificationListResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-197: `GET /api/notifications/`
- Endpoint: `/api/notifications/`
- Method: `GET`
- Purpose: Get Notifications. Get user's notifications.

Returns in-app notifications with optional filtering.
- Tags: Notifications
- Request Schema: Parameters: query `unread_only` required=False schema=boolean; query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `NotificationListResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-198: `POST /api/notifications/batch`
- Endpoint: `/api/notifications/batch`
- Method: `POST`
- Purpose: Send Batch Notifications. Send notifications to multiple users at once.
- Tags: Notifications
- Request Schema: Body: application/json: component `BatchNotificationRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-199: `POST /api/notifications/devices`
- Endpoint: `/api/notifications/devices`
- Method: `POST`
- Purpose: Register Notification Device. Register a push token for the current user.
- Tags: Notifications
- Request Schema: Body: application/json: component `NotificationDeviceRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-200: `POST /api/notifications/devices/unregister`
- Endpoint: `/api/notifications/devices/unregister`
- Method: `POST`
- Purpose: Unregister Notification Device. Disable a push token for the current user.
- Tags: Notifications
- Request Schema: Body: application/json: component `NotificationDeviceRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-201: `POST /api/notifications/mark-all-read`
- Endpoint: `/api/notifications/mark-all-read`
- Method: `POST`
- Purpose: Mark All Notifications As Read. Mark all notifications as read
- Tags: Notifications
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-202: `GET /api/notifications/unread-count`
- Endpoint: `/api/notifications/unread-count`
- Method: `GET`
- Purpose: Get Unread Count. Get count of unread notifications (for badge)
- Tags: Notifications
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-203: `DELETE /api/notifications/{notification_id}`
- Endpoint: `/api/notifications/{notification_id}`
- Method: `DELETE`
- Purpose: Delete Notification. Delete a notification
- Tags: Notifications
- Request Schema: Parameters: path `notification_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-204: `POST /api/notifications/{notification_id}/read`
- Endpoint: `/api/notifications/{notification_id}/read`
- Method: `POST`
- Purpose: Mark Notification As Read. Mark a notification as read
- Tags: Notifications
- Request Schema: Parameters: path `notification_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-205: `GET /api/permissions/available`
- Endpoint: `/api/permissions/available`
- Method: `GET`
- Purpose: List Available Permissions. List all available permissions in the system
- Tags: permissions
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-206: `GET /api/permissions/roles`
- Endpoint: `/api/permissions/roles`
- Method: `GET`
- Purpose: List Role Permissions. List permissions for each role
- Tags: permissions
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-207: `GET /api/permissions/users/{username}`
- Endpoint: `/api/permissions/users/{username}`
- Method: `GET`
- Purpose: Get User Permissions Api. Get permissions for a specific user
- Tags: permissions
- Request Schema: Parameters: path `username` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-208: `POST /api/permissions/users/{username}/add`
- Endpoint: `/api/permissions/users/{username}/add`
- Method: `POST`
- Purpose: Add User Permissions. Add custom permissions to a user
- Tags: permissions
- Request Schema: Parameters: path `username` required=True schema=string | Body: application/json: component `PermissionUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-209: `POST /api/permissions/users/{username}/disable`
- Endpoint: `/api/permissions/users/{username}/disable`
- Method: `POST`
- Purpose: Disable User Permissions. Disable specific permissions for a user
- Tags: permissions
- Request Schema: Parameters: path `username` required=True schema=string | Body: application/json: component `PermissionUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-210: `POST /api/permissions/users/{username}/enable`
- Endpoint: `/api/permissions/users/{username}/enable`
- Method: `POST`
- Purpose: Enable User Permissions. Re-enable previously disabled permissions for a user
- Tags: permissions
- Request Schema: Parameters: path `username` required=True schema=string | Body: application/json: component `PermissionUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-211: `POST /api/permissions/users/{username}/remove`
- Endpoint: `/api/permissions/users/{username}/remove`
- Method: `POST`
- Purpose: Remove User Permissions. Remove custom permissions from a user
- Tags: permissions
- Request Schema: Parameters: path `username` required=True schema=string | Body: application/json: component `PermissionUpdate`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-212: `POST /api/pi/chat`
- Endpoint: `/api/pi/chat`
- Method: `POST`
- Purpose: Chat With Pi. Proxy a chat completion request to the pi-server.
Requires Admin or Supervisor role.
- Tags: AI Assistant
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-213: `GET /api/pi/history`
- Endpoint: `/api/pi/history`
- Method: `GET`
- Purpose: Get Chat History. Retrieve chat history for the current user.
- Tags: AI Assistant
- Request Schema: Parameters: query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-214: `GET /api/pi/status`
- Endpoint: `/api/pi/status`
- Method: `GET`
- Purpose: Get Pi Status. Check if the pi-server sidecar is reachable.
- Tags: AI Assistant
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-215: `GET /api/racks/available`
- Endpoint: `/api/racks/available`
- Method: `GET`
- Purpose: Get Available Racks. Get list of available racks

Filters:
- floor: Optional floor filter
- status: Only returns available or paused racks
- Tags: Rack Management
- Request Schema: Parameters: query `floor` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: array of component `AvailableRack`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-216: `GET /api/racks/floors`
- Endpoint: `/api/racks/floors`
- Method: `GET`
- Purpose: Get Floors. Get list of all floors with racks
- Tags: Rack Management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of string
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-217: `GET /api/racks/user/active`
- Endpoint: `/api/racks/user/active`
- Method: `GET`
- Purpose: Get User Active Racks. Get all racks claimed by current user
- Tags: Rack Management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of component `RackStatus`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-218: `POST /api/racks/{rack_id}/claim`
- Endpoint: `/api/racks/{rack_id}/claim`
- Method: `POST`
- Purpose: Claim Rack. Claim a rack for exclusive use

Process:
1. Check if rack is available
2. Acquire Redis lock
3. Create session
4. Update rack status
5. Broadcast update
- Tags: Rack Management
- Request Schema: Parameters: path `rack_id` required=True schema=string; query `redis_service` required=True schema=UNDEFINED BEHAVIOR | Body: application/json: component `RackClaimRequest`
- Response Schema: `200` Successful Response - application/json: component `RackClaimResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-219: `POST /api/racks/{rack_id}/pause`
- Endpoint: `/api/racks/{rack_id}/pause`
- Method: `POST`
- Purpose: Pause Rack. Pause work on rack (keep lock)
- Tags: Rack Management
- Request Schema: Parameters: path `rack_id` required=True schema=string; query `redis_service` required=True schema=UNDEFINED BEHAVIOR
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-220: `POST /api/racks/{rack_id}/release`
- Endpoint: `/api/racks/{rack_id}/release`
- Method: `POST`
- Purpose: Release Rack. Release rack lock

Process:
1. Verify ownership
2. Release Redis lock
3. Update rack status
4. Update session status
5. Broadcast update
- Tags: Rack Management
- Request Schema: Parameters: path `rack_id` required=True schema=string; query `redis_service` required=True schema=UNDEFINED BEHAVIOR
- Response Schema: `200` Successful Response - application/json: component `RackReleaseResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-221: `POST /api/racks/{rack_id}/resume`
- Endpoint: `/api/racks/{rack_id}/resume`
- Method: `POST`
- Purpose: Resume Rack. Resume work on paused rack
- Tags: Rack Management
- Request Schema: Parameters: path `rack_id` required=True schema=string; query `redis_service` required=True schema=UNDEFINED BEHAVIOR
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-222: `GET /api/racks/{rack_id}/status`
- Endpoint: `/api/racks/{rack_id}/status`
- Method: `GET`
- Purpose: Get Rack Status. Get current rack status
- Tags: Rack Management
- Request Schema: Parameters: path `rack_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `RackStatus`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-223: `POST /api/recount/assign`
- Endpoint: `/api/recount/assign`
- Method: `POST`
- Purpose: Assign Recount Request. Assign recount request to a staff member.
- Tags: Recount
- Request Schema: Body: application/json: component `RecountAssignRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-224: `GET /api/recount/list`
- Endpoint: `/api/recount/list`
- Method: `GET`
- Purpose: List Recount Requests. List recount requests with filters.
- Tags: Recount
- Request Schema: Parameters: query `status` required=False schema=anyOf(string, null); query `assigned_to` required=False schema=anyOf(string, null); query `priority` required=False schema=anyOf(string, null); query `limit` required=False schema=integer; query `offset` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-225: `POST /api/recount/request`
- Endpoint: `/api/recount/request`
- Method: `POST`
- Purpose: Create Recount Request. Create a new recount request from a rejected count line.
- Tags: Recount
- Request Schema: Body: application/json: component `RecountCreateRequest`
- Response Schema: `200` Successful Response - application/json: component `RecountResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-226: `GET /api/recount/staff/{username}/tasks`
- Endpoint: `/api/recount/staff/{username}/tasks`
- Method: `GET`
- Purpose: Get Staff Recount Tasks. Get recount tasks assigned to a staff member.
- Tags: Recount
- Request Schema: Parameters: path `username` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-227: `GET /api/recount/stats/summary`
- Endpoint: `/api/recount/stats/summary`
- Method: `GET`
- Purpose: Get Recount Summary. Get recount statistics summary.
- Tags: Recount
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-228: `GET /api/recount/{recount_id}`
- Endpoint: `/api/recount/{recount_id}`
- Method: `GET`
- Purpose: Get Recount Request. Get single recount request details.
- Tags: Recount
- Request Schema: Parameters: path `recount_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `RecountResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-229: `POST /api/recount/{recount_id}/cancel`
- Endpoint: `/api/recount/{recount_id}/cancel`
- Method: `POST`
- Purpose: Cancel Recount Request. Cancel a recount request.
- Tags: Recount
- Request Schema: Parameters: path `recount_id` required=True schema=string; query `reason` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-230: `POST /api/recount/{recount_id}/complete`
- Endpoint: `/api/recount/{recount_id}/complete`
- Method: `POST`
- Purpose: Complete Recount Request. Complete a recount request with results.
- Tags: Recount
- Request Schema: Parameters: path `recount_id` required=True schema=string | Body: application/json: component `RecountUpdateRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-231: `GET /api/reports/collections`
- Endpoint: `/api/reports/collections`
- Method: `GET`
- Purpose: Get Available Collections. Get available collections and their fields
- Tags: Reporting
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-232: `GET /api/reports/compare`
- Endpoint: `/api/reports/compare`
- Method: `GET`
- Purpose: List Comparisons. List comparison jobs
- Tags: Reporting
- Request Schema: Parameters: query `created_by` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-233: `POST /api/reports/compare`
- Endpoint: `/api/reports/compare`
- Method: `POST`
- Purpose: Compare Snapshots. Compare two snapshots
- Tags: Reporting
- Request Schema: Body: application/json: component `CompareSnapshotsRequest`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-234: `GET /api/reports/compare/{job_id}`
- Endpoint: `/api/reports/compare/{job_id}`
- Method: `GET`
- Purpose: Get Comparison. Get comparison job
- Tags: Reporting
- Request Schema: Parameters: path `job_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-235: `POST /api/reports/export/csv`
- Endpoint: `/api/reports/export/csv`
- Method: `POST`
- Purpose: Export Report Csv. Export report as CSV file.
- Tags: Reports
- Request Schema: Body: application/json: component `ReportRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-236: `POST /api/reports/export/xlsx`
- Endpoint: `/api/reports/export/xlsx`
- Method: `POST`
- Purpose: Export Report Xlsx. Export report as Excel XLSX file.
- Tags: Reports
- Request Schema: Body: application/json: component `ReportRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-237: `GET /api/reports/filters/{report_type}`
- Endpoint: `/api/reports/filters/{report_type}`
- Method: `GET`
- Purpose: Get Report Filter Options. Get available filter options for a specific report type.
Returns distinct values for filterable fields.
- Tags: Reports
- Request Schema: Parameters: path `report_type` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-238: `POST /api/reports/generate`
- Endpoint: `/api/reports/generate`
- Method: `POST`
- Purpose: Generate Report. Generate a report with specified filters.
Returns data in JSON format by default.
- Tags: Reports
- Request Schema: Body: application/json: component `ReportRequest`
- Response Schema: `200` Successful Response - application/json: component `ReportResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-239: `POST /api/reports/query/preview`
- Endpoint: `/api/reports/query/preview`
- Method: `POST`
- Purpose: Preview Query. Preview query results without saving
- Tags: Reporting
- Request Schema: Body: application/json: component `QuerySpec`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-240: `GET /api/reports/snapshots`
- Endpoint: `/api/reports/snapshots`
- Method: `GET`
- Purpose: List Snapshots. List snapshots with filters
- Tags: Reporting
- Request Schema: Parameters: query `created_by` required=False schema=anyOf(string, null); query `snapshot_type` required=False schema=anyOf(string, null); query `tags` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: array of object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-241: `POST /api/reports/snapshots`
- Endpoint: `/api/reports/snapshots`
- Method: `POST`
- Purpose: Create Snapshot. Create a new snapshot
- Tags: Reporting
- Request Schema: Body: application/json: component `CreateSnapshotRequest`
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-242: `DELETE /api/reports/snapshots/{snapshot_id}`
- Endpoint: `/api/reports/snapshots/{snapshot_id}`
- Method: `DELETE`
- Purpose: Delete Snapshot. Delete snapshot
- Tags: Reporting
- Request Schema: Parameters: path `snapshot_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-243: `GET /api/reports/snapshots/{snapshot_id}`
- Endpoint: `/api/reports/snapshots/{snapshot_id}`
- Method: `GET`
- Purpose: Get Snapshot. Get snapshot with pagination
- Tags: Reporting
- Request Schema: Parameters: path `snapshot_id` required=True schema=string; query `skip` required=False schema=integer; query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-244: `GET /api/reports/snapshots/{snapshot_id}/export`
- Endpoint: `/api/reports/snapshots/{snapshot_id}/export`
- Method: `GET`
- Purpose: Export Snapshot. Export snapshot to file

Formats: csv, xlsx, json
- Tags: Reporting
- Request Schema: Parameters: path `snapshot_id` required=True schema=string; query `format` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-245: `POST /api/reports/snapshots/{snapshot_id}/refresh`
- Endpoint: `/api/reports/snapshots/{snapshot_id}/refresh`
- Method: `POST`
- Purpose: Refresh Snapshot. Refresh snapshot with latest data
- Tags: Reporting
- Request Schema: Parameters: path `snapshot_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-246: `GET /api/reports/types`
- Endpoint: `/api/reports/types`
- Method: `GET`
- Purpose: Get Report Types. Get available report types with descriptions.
- Tags: Reports
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-247: `GET /api/sessions`
- Endpoint: `/api/sessions`
- Method: `GET`
- Purpose: Get Sessions. Get all sessions with pagination
- Tags: Session Management
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `status` required=False schema=anyOf(string, null); query `user_id` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: component `PaginatedResponse_Session_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-248: `POST /api/sessions`
- Endpoint: `/api/sessions`
- Method: `POST`
- Purpose: Create Session. Create a new session with snapshot/config persistence and single-session enforcement.
- Tags: Session Management
- Request Schema: Body: application/json: component `SessionCreate`
- Response Schema: `200` Successful Response - application/json: component `Session`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-249: `GET /api/sessions/`
- Endpoint: `/api/sessions/`
- Method: `GET`
- Purpose: Get Sessions. Get all sessions with pagination
- Tags: Session Management
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `status` required=False schema=anyOf(string, null); query `user_id` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: component `PaginatedResponse_Session_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-250: `POST /api/sessions/`
- Endpoint: `/api/sessions/`
- Method: `POST`
- Purpose: Create Session. Create a new session with snapshot/config persistence and single-session enforcement.
- Tags: Session Management
- Request Schema: Body: application/json: component `SessionCreate`
- Response Schema: `200` Successful Response - application/json: component `Session`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-251: `GET /api/sessions/active`
- Endpoint: `/api/sessions/active`
- Method: `GET`
- Purpose: Get Active Sessions. Get all active sessions

Filters:
- user_id: Filter by specific user
- rack_id: Filter by specific rack
- Tags: Session Management
- Request Schema: Parameters: query `user_id` required=False schema=anyOf(string, null); query `rack_id` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: array of component `SessionDetail`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-252: `GET /api/sessions/analytics`
- Endpoint: `/api/sessions/analytics`
- Method: `GET`
- Purpose: Get Sessions Analytics. Get aggregated session analytics for supervisor/admin dashboards.
- Tags: Session Management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-253: `POST /api/sessions/bulk/close`
- Endpoint: `/api/sessions/bulk/close`
- Method: `POST`
- Purpose: Bulk Close Sessions. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: Session Management
- Request Schema: Body: application/json: component `BulkSessionCloseRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-254: `POST /api/sessions/bulk/export`
- Endpoint: `/api/sessions/bulk/export`
- Method: `POST`
- Purpose: Bulk Export Sessions. Bulk export sessions (supervisor only)
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `format` required=False schema=string | Body: application/json: array of string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-255: `POST /api/sessions/logout-all`
- Endpoint: `/api/sessions/logout-all`
- Method: `POST`
- Purpose: Logout All Sessions. Logout all active sessions for the current user (Phase 1 Governance)
Mandatory endpoint to resolve AUTH_SESSION_CONFLICT
- Tags: Session Management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-256: `GET /api/sessions/user-workflows`
- Endpoint: `/api/sessions/user-workflows`
- Method: `GET`
- Purpose: Get User Workflows. Return the currently running workflow grouped by user.
- Tags: Session Management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of component `UserWorkflowSummary`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-257: `GET /api/sessions/user/history`
- Endpoint: `/api/sessions/user/history`
- Method: `GET`
- Purpose: Get User Session History. Get user's session history (completed sessions)
- Tags: Session Management
- Request Schema: Parameters: query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: array of component `SessionDetail`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-258: `GET /api/sessions/{session_id}`
- Endpoint: `/api/sessions/{session_id}`
- Method: `GET`
- Purpose: Get Session Detail. Get detailed session information
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `SessionDetail`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-259: `POST /api/sessions/{session_id}/complete`
- Endpoint: `/api/sessions/{session_id}/complete`
- Method: `POST`
- Purpose: Complete Session. Complete session and release rack.

This legacy endpoint preserves the historical owner-compatible close flow.
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-260: `POST /api/sessions/{session_id}/finalize`
- Endpoint: `/api/sessions/{session_id}/finalize`
- Method: `POST`
- Purpose: Finalize Session. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string | Body: application/json: anyOf(component `SessionFinalizeRequest`, null)
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-261: `POST /api/sessions/{session_id}/heartbeat`
- Endpoint: `/api/sessions/{session_id}/heartbeat`
- Method: `POST`
- Purpose: Session Heartbeat. Session heartbeat - maintain locks and presence

Should be called every 20-30 seconds by active clients

Actions:
1. Update user heartbeat in Redis
2. Renew rack lock if session has rack
3. Update session last_heartbeat in MongoDB
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `HeartbeatResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-262: `GET /api/sessions/{session_id}/integrity`
- Endpoint: `/api/sessions/{session_id}/integrity`
- Method: `GET`
- Purpose: Check Session Integrity. Check if master data has changed since session start (FR-M-34)
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `SessionIntegrityResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-263: `GET /api/sessions/{session_id}/items/{item_code}/scan-status`
- Endpoint: `/api/sessions/{session_id}/items/{item_code}/scan-status`
- Method: `GET`
- Purpose: Check Item Scan Status. Check if item has been scanned in this session and where
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `session_id` required=True schema=string; path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-264: `GET /api/sessions/{session_id}/stats`
- Endpoint: `/api/sessions/{session_id}/stats`
- Method: `GET`
- Purpose: Get Session Stats. Get session statistics
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `SessionStats`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-265: `PUT /api/sessions/{session_id}/status`
- Endpoint: `/api/sessions/{session_id}/status`
- Method: `PUT`
- Purpose: Update Session Status. Update session status through canonical lifecycle transitions.
- Tags: Session Management
- Request Schema: Parameters: path `session_id` required=True schema=string; query `status` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SessionLifecycleService` transaction/OCC boundary where supported.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-266: `POST /api/supervisor/verify-pin`
- Endpoint: `/api/supervisor/verify-pin`
- Method: `POST`
- Purpose: Verify Supervisor Pin. Verify supervisor PIN and log the override action.
- Tags: Supervisor
- Request Schema: Body: application/json: component `PinVerificationRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-267: `POST /api/sync/batch`
- Endpoint: `/api/sync/batch`
- Method: `POST`
- Purpose: Sync Batch. Batch sync endpoint - sync multiple records in one request

Features:
- Rate limiting: 10 requests per minute per user
- Validates all records before syncing
- Detects conflicts (duplicate serials, invalid data, etc.)
- Uses circuit breaker for resilience
- Returns detailed success/conflict/error breakdown
- Tags: Sync
- Request Schema: Body: application/json: component `BatchSyncRequest`
- Response Schema: `200` Successful Response - application/json: component `BatchSyncResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: 10 requests per minute per user in `backend/api/sync_batch_api.py`; Redis-backed rate limiting is required in production.
- Idempotency Behavior: `client_record_id` drives record idempotency and backend `idempotency_operations` entries.
- Retry Behavior: Retry with the same `client_record_id`; conflicts move to conflict/manual-review state; 401 requires reauthentication; 429 requires backoff.
- Transaction Boundaries: `CountLineWriteService.process_write(...)` transaction boundary with governance and transaction skips forbidden.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-268: `POST /api/sync/changes`
- Endpoint: `/api/sync/changes`
- Method: `POST`
- Purpose: Trigger Change Sync. Trigger change detection sync when the service is available.
- Tags: sync
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-269: `GET /api/sync/changes/stats`
- Endpoint: `/api/sync/changes/stats`
- Method: `GET`
- Purpose: Get Change Sync Stats. Return change detection stats if the service is available.
- Tags: sync
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-270: `GET /api/sync/conflicts`
- Endpoint: `/api/sync/conflicts`
- Method: `GET`
- Purpose: List Conflicts. List sync conflicts with optional filters
- Tags: sync_conflicts
- Request Schema: Parameters: query `status` required=False schema=anyOf(string, null); query `session_id` required=False schema=anyOf(string, null); query `user` required=False schema=anyOf(string, null); query `entity_type` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-271: `POST /api/sync/conflicts/auto-resolve`
- Endpoint: `/api/sync/conflicts/auto-resolve`
- Method: `POST`
- Purpose: Auto Resolve Conflicts. Auto-resolve pending conflicts using a strategy
- Tags: sync_conflicts
- Request Schema: Parameters: query `strategy` required=False schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SyncConflictsService`; approved or locked count-line conflicts fork instead of overwrite.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-272: `POST /api/sync/conflicts/batch-resolve`
- Endpoint: `/api/sync/conflicts/batch-resolve`
- Method: `POST`
- Purpose: Batch Resolve Conflicts. Batch resolve sync conflicts
- Tags: sync_conflicts
- Request Schema: Body: application/json: component `BatchConflictResolutionRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SyncConflictsService`; approved or locked count-line conflicts fork instead of overwrite.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-273: `GET /api/sync/conflicts/stats/summary`
- Endpoint: `/api/sync/conflicts/stats/summary`
- Method: `GET`
- Purpose: Get Conflict Statistics. Get statistics about sync conflicts
- Tags: sync_conflicts
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-274: `GET /api/sync/conflicts/{conflict_id}`
- Endpoint: `/api/sync/conflicts/{conflict_id}`
- Method: `GET`
- Purpose: Get Conflict Details. Get detailed information about a specific conflict
- Tags: sync_conflicts
- Request Schema: Parameters: path `conflict_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-275: `POST /api/sync/conflicts/{conflict_id}/resolve`
- Endpoint: `/api/sync/conflicts/{conflict_id}/resolve`
- Method: `POST`
- Purpose: Resolve Conflict. Resolve a sync conflict
- Tags: sync_conflicts
- Request Schema: Parameters: path `conflict_id` required=True schema=string | Body: application/json: component `ConflictResolutionRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: `SyncConflictsService`; approved or locked count-line conflicts fork instead of overwrite.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-276: `POST /api/sync/erp`
- Endpoint: `/api/sync/erp`
- Method: `POST`
- Purpose: Trigger Erp Sync. Trigger ERP sync when the service is available.
- Tags: sync
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-277: `POST /api/sync/heartbeat`
- Endpoint: `/api/sync/heartbeat`
- Method: `POST`
- Purpose: Session Heartbeat. Session heartbeat - maintain rack lock and user presence

Should be called every 20-30 seconds by active clients
- Tags: Sync
- Request Schema: Parameters: query `session_id` required=True schema=string; query `rack_id` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-278: `GET /api/sync/stats`
- Endpoint: `/api/sync/stats`
- Method: `GET`
- Purpose: Get Sync Stats. Get sync statistics
Returns: Historical sync statistics
- Tags: sync
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-279: `GET /api/sync/status`
- Endpoint: `/api/sync/status`
- Method: `GET`
- Purpose: Get Sync Status. Get current sync status
Returns: Connection status, sync progress, statistics
- Tags: sync
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-280: `POST /api/sync/trigger`
- Endpoint: `/api/sync/trigger`
- Method: `POST`
- Purpose: Trigger Manual Sync. Manually trigger a sync (admin action)
Returns: Success status
- Tags: sync
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-281: `POST /api/test-support/cleanup`
- Endpoint: `/api/test-support/cleanup`
- Method: `POST`
- Purpose: Cleanup Synthetic Fixtures. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: test-support
- Request Schema: Body: application/json: component `SyntheticCleanupRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-282: `POST /api/test-support/erp-items`
- Endpoint: `/api/test-support/erp-items`
- Method: `POST`
- Purpose: Upsert Synthetic Erp Item. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: test-support
- Request Schema: Body: application/json: component `SyntheticErpItemRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-283: `PATCH /api/test-support/erp-items/{item_code}`
- Endpoint: `/api/test-support/erp-items/{item_code}`
- Method: `PATCH`
- Purpose: Patch Synthetic Erp Item. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: test-support
- Request Schema: Parameters: path `item_code` required=True schema=string | Body: application/json: component `SyntheticErpItemPatchRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-284: `POST /api/test-support/inspect`
- Endpoint: `/api/test-support/inspect`
- Method: `POST`
- Purpose: Inspect Synthetic Fixtures. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: test-support
- Request Schema: Body: application/json: component `SyntheticInspectRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-285: `POST /api/test-support/item-variances`
- Endpoint: `/api/test-support/item-variances`
- Method: `POST`
- Purpose: Create Synthetic Item Variance. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: test-support
- Request Schema: Body: application/json: component `SyntheticVarianceRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-286: `POST /api/test-support/scope-runtime`
- Endpoint: `/api/test-support/scope-runtime`
- Method: `POST`
- Purpose: Scope Runtime Fixtures. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: test-support
- Request Schema: Body: application/json: component `SyntheticCleanupRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-287: `POST /api/unknown-items`
- Endpoint: `/api/unknown-items`
- Method: `POST`
- Purpose: Report Unknown Item. Create an unknown item report (staff/supervisor/admin).
- Tags: Unknown Items
- Request Schema: Body: application/json: component `UnknownItemReportRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-288: `DELETE /api/user/settings`
- Endpoint: `/api/user/settings`
- Method: `DELETE`
- Purpose: Reset User Settings. Reset the current user's settings to defaults.
- Tags: User Settings
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `UserSettingsResponse`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-289: `GET /api/user/settings`
- Endpoint: `/api/user/settings`
- Method: `GET`
- Purpose: Get User Settings. Get the current user's settings.

Returns default settings if user has no custom settings stored.
- Tags: User Settings
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `UserSettingsResponse`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-290: `PATCH /api/user/settings`
- Endpoint: `/api/user/settings`
- Method: `PATCH`
- Purpose: Update User Settings. Update the current user's settings.

Only provided fields will be updated; others remain unchanged.
- Tags: User Settings
- Request Schema: Body: application/json: component `UserSettingsUpdate`
- Response Schema: `200` Successful Response - application/json: component `UserSettingsResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-291: `GET /api/users`
- Endpoint: `/api/users`
- Method: `GET`
- Purpose: List Users. List all users with pagination and filtering.
Requires admin role.
- Tags: user-management
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `search` required=False schema=anyOf(string, null); query `role` required=False schema=anyOf(string, null); query `is_active` required=False schema=anyOf(boolean, null); query `sort_by` required=False schema=string; query `sort_order` required=False schema=string
- Response Schema: `200` Successful Response - application/json: component `UserListResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-292: `POST /api/users`
- Endpoint: `/api/users`
- Method: `POST`
- Purpose: Create User. Create a new user.
Requires admin role.
- Tags: user-management
- Request Schema: Body: application/json: component `CreateUserRequest`
- Response Schema: `201` Successful Response - application/json: component `UserDetailResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-293: `GET /api/users/assignable/staff`
- Endpoint: `/api/users/assignable/staff`
- Method: `GET`
- Purpose: List Assignable Staff. List active staff users available for recount assignment.
Accessible to supervisors/admins who can request recounts.
- Tags: user-management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: array of component `AssignableUserItem`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-294: `POST /api/users/bulk`
- Endpoint: `/api/users/bulk`
- Method: `POST`
- Purpose: Bulk User Action. Perform bulk actions on users.
Requires admin role.
- Tags: user-management
- Request Schema: Body: application/json: component `BulkUserAction`
- Response Schema: `200` Successful Response - application/json: component `BulkActionResult`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-295: `GET /api/users/me/preferences`
- Endpoint: `/api/users/me/preferences`
- Method: `GET`
- Purpose: Get My Preferences. Get current user's preferences.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `UserPreferencesInDB`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-296: `PUT /api/users/me/preferences`
- Endpoint: `/api/users/me/preferences`
- Method: `PUT`
- Purpose: Update My Preferences. Update current user's preferences.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Body: application/json: component `UserPreferencesUpdate`
- Response Schema: `200` Successful Response - application/json: component `UserPreferencesInDB`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-297: `GET /api/users/roles/available`
- Endpoint: `/api/users/roles/available`
- Method: `GET`
- Purpose: Get Available Roles. Get list of available roles and their permissions.
Any authenticated user can view this.
- Tags: user-management
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-298: `DELETE /api/users/{user_id}`
- Endpoint: `/api/users/{user_id}`
- Method: `DELETE`
- Purpose: Delete User. Delete a user.
Requires admin role.
- Tags: user-management
- Request Schema: Parameters: path `user_id` required=True schema=string
- Response Schema: `204` Successful Response; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-299: `GET /api/users/{user_id}`
- Endpoint: `/api/users/{user_id}`
- Method: `GET`
- Purpose: Get User. Get detailed information about a specific user.
Requires admin role.
- Tags: user-management
- Request Schema: Parameters: path `user_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `UserDetailResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-300: `PUT /api/users/{user_id}`
- Endpoint: `/api/users/{user_id}`
- Method: `PUT`
- Purpose: Update User. Update an existing user.
Requires admin role.
- Tags: user-management
- Request Schema: Parameters: path `user_id` required=True schema=string | Body: application/json: component `UpdateUserRequest`
- Response Schema: `200` Successful Response - application/json: component `UserDetailResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-301: `POST /api/users/{user_id}/reset-password`
- Endpoint: `/api/users/{user_id}/reset-password`
- Method: `POST`
- Purpose: Reset User Password. Reset a user's password.
Requires admin role.
- Tags: user-management
- Request Schema: Parameters: path `user_id` required=True schema=string | Body: application/json: component `ResetPasswordRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-302: `POST /api/users/{user_id}/reset-pin`
- Endpoint: `/api/users/{user_id}/reset-pin`
- Method: `POST`
- Purpose: Reset User Pin. Reset a user's PIN.
Requires admin role.
- Tags: user-management
- Request Schema: Parameters: path `user_id` required=True schema=string | Body: application/json: component `ResetPinRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-303: `POST /api/v1/enrichment/bulk`
- Endpoint: `/api/v1/enrichment/bulk`
- Method: `POST`
- Purpose: Bulk Import Enrichments Endpoint. Bulk import enrichment data (e.g., from Excel upload)
Admin/Supervisor can upload Excel with enrichment data
- Tags: Enrichment
- Request Schema: Body: application/json: component `BulkEnrichmentRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-304: `GET /api/v1/enrichment/completeness/{item_code}`
- Endpoint: `/api/v1/enrichment/completeness/{item_code}`
- Method: `GET`
- Purpose: Check Data Completeness. Check data completeness for a specific item
Returns which fields are missing
- Tags: Enrichment
- Request Schema: Parameters: path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `DataCompletenessResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-305: `GET /api/v1/enrichment/incomplete`
- Endpoint: `/api/v1/enrichment/incomplete`
- Method: `GET`
- Purpose: Get Incomplete Items. Get items with incomplete data (missing serial#, MRP, HSN, etc.)
Used to assign enrichment tasks to staff
- Tags: Enrichment
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `limit` required=False schema=integer; query `skip` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-306: `GET /api/v1/enrichment/leaderboard`
- Endpoint: `/api/v1/enrichment/leaderboard`
- Method: `GET`
- Purpose: Get Enrichment Leaderboard Endpoint. Get enrichment leaderboard
Shows top contributors to data enrichment
- Tags: Enrichment
- Request Schema: Parameters: query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-307: `POST /api/v1/enrichment/record`
- Endpoint: `/api/v1/enrichment/record`
- Method: `POST`
- Purpose: Record Item Enrichment. Record data enrichment for an item

Staff can add/correct:
- Serial numbers
- MRP
- HSN codes
- Barcodes
- Location/Rack
- Item condition
- Notes
- Tags: Enrichment
- Request Schema: Body: application/json: component `EnrichmentRequest`
- Response Schema: `200` Successful Response - application/json: component `EnrichmentResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-308: `GET /api/v1/enrichment/stats`
- Endpoint: `/api/v1/enrichment/stats`
- Method: `GET`
- Purpose: Get Enrichment Statistics. Get enrichment statistics for a date range
Shows overall enrichment progress and activity
- Tags: Enrichment
- Request Schema: Parameters: query `start_date` required=False schema=anyOf(string, null); query `end_date` required=False schema=anyOf(string, null); query `user_id` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-309: `POST /api/v1/enrichment/validate`
- Endpoint: `/api/v1/enrichment/validate`
- Method: `POST`
- Purpose: Validate Enrichment Data Endpoint. Validate enrichment data before submission
Frontend can use this to validate user input
- Tags: Enrichment
- Request Schema: Body: application/json: component `EnrichmentRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-310: `POST /api/v2/connections/pool/health-check`
- Endpoint: `/api/v2/connections/pool/health-check`
- Method: `POST`
- Purpose: Trigger Health Check. Manually trigger a connection pool health check
Requires authentication
- Tags: API v2, Connections v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `backend__api__response_models__ApiResponse_dict_str__Any__`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-311: `GET /api/v2/connections/pool/stats`
- Endpoint: `/api/v2/connections/pool/stats`
- Method: `GET`
- Purpose: Get Connection Pool Stats. Get detailed connection pool statistics
Requires authentication
- Tags: API v2, Connections v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `backend__api__response_models__ApiResponse_dict_str__Any__`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-312: `GET /api/v2/connections/pool/status`
- Endpoint: `/api/v2/connections/pool/status`
- Method: `GET`
- Purpose: Get Connection Pool Status. Get connection pool status and metrics
Requires authentication
- Tags: API v2, Connections v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_ConnectionPoolStatusResponse_`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-313: `GET /api/v2/erp/items/barcode/{barcode}/enhanced`
- Endpoint: `/api/v2/erp/items/barcode/{barcode}/enhanced`
- Method: `GET`
- Purpose: Get Item By Barcode Enhanced. Enhanced barcode lookup with multiple data sources, caching, and performance monitoring.
Also checks for 'is_misplaced' status if session context is provided.
- Tags: Enhanced Items
- Request Schema: Parameters: path `barcode` required=True schema=string; query `force_source` required=False schema=anyOf(string, null); query `include_metadata` required=False schema=boolean; query `session_id` required=False schema=anyOf(string, null); query `rack_no` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-314: `POST /api/v2/erp/items/database/optimize`
- Endpoint: `/api/v2/erp/items/database/optimize`
- Method: `POST`
- Purpose: Optimize Database Performance. Optimize database performance (supervisor only)
- Tags: Enhanced Items
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-315: `GET /api/v2/erp/items/database/status`
- Endpoint: `/api/v2/erp/items/database/status`
- Method: `GET`
- Purpose: Get Database Status. Get comprehensive database status and health information
- Tags: Enhanced Items
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-316: `GET /api/v2/erp/items/export/csv`
- Endpoint: `/api/v2/erp/items/export/csv`
- Method: `GET`
- Purpose: Export Items Csv. Export filtered items to ERPNext-compatible CSV
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `subcategory` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `verified` required=False schema=anyOf(boolean, null); query `search` required=False schema=anyOf(string, null); query `max_rows` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-317: `GET /api/v2/erp/items/export/json`
- Endpoint: `/api/v2/erp/items/export/json`
- Method: `GET`
- Purpose: Export Items Json. Export filtered items as JSON.
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `subcategory` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `verified` required=False schema=anyOf(boolean, null); query `search` required=False schema=anyOf(string, null); query `max_rows` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-318: `GET /api/v2/erp/items/export/xlsx`
- Endpoint: `/api/v2/erp/items/export/xlsx`
- Method: `GET`
- Purpose: Export Items Xlsx. Export filtered items to ERPNext-compatible Excel.
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `subcategory` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `verified` required=False schema=anyOf(boolean, null); query `search` required=False schema=anyOf(string, null); query `max_rows` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-319: `GET /api/v2/erp/items/filtered`
- Endpoint: `/api/v2/erp/items/filtered`
- Method: `GET`
- Purpose: Get Filtered Items. Get filtered list of items with various filter options
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `subcategory` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `uom_code` required=False schema=anyOf(string, null); query `verified` required=False schema=anyOf(boolean, null); query `search` required=False schema=anyOf(string, null); query `limit` required=False schema=integer; query `skip` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-320: `GET /api/v2/erp/items/live/users`
- Endpoint: `/api/v2/erp/items/live/users`
- Method: `GET`
- Purpose: Get Live Users. Get list of currently active users (users who have verified items in last hour)
- Tags: Item Verification
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-321: `GET /api/v2/erp/items/live/verifications`
- Endpoint: `/api/v2/erp/items/live/verifications`
- Method: `GET`
- Purpose: Get Live Verifications. Get live feed of recent item verifications
- Tags: Item Verification
- Request Schema: Parameters: query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-322: `GET /api/v2/erp/items/locations`
- Endpoint: `/api/v2/erp/items/locations`
- Method: `GET`
- Purpose: Get Unique Locations. Get unique floors and racks for filtering
- Tags: Enhanced Items
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-323: `GET /api/v2/erp/items/performance/stats`
- Endpoint: `/api/v2/erp/items/performance/stats`
- Method: `GET`
- Purpose: Get Item Api Performance. Get performance statistics for item API operations
- Tags: Enhanced Items
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: no schema declared
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-324: `GET /api/v2/erp/items/search/advanced`
- Endpoint: `/api/v2/erp/items/search/advanced`
- Method: `GET`
- Purpose: Advanced Item Search. Advanced search with multiple criteria, filtering, and sorting
- Tags: Enhanced Items
- Request Schema: Parameters: query `query` required=True schema=string; query `search_fields` required=False schema=array of string; query `limit` required=False schema=integer; query `offset` required=False schema=integer; query `sort_by` required=False schema=string; query `category` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `stock_level` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-325: `GET /api/v2/erp/items/sync`
- Endpoint: `/api/v2/erp/items/sync`
- Method: `GET`
- Purpose: Sync Items For Offline Cache. Incremental item sync for offline caching.

Used by the mobile app to keep its local SQLite item table fresh for offline search.
- Tags: Item Verification
- Request Schema: Parameters: query `since` required=False schema=anyOf(string, null); query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-326: `POST /api/v2/erp/items/sync/realtime`
- Endpoint: `/api/v2/erp/items/sync/realtime`
- Method: `POST`
- Purpose: Trigger Realtime Sync. Trigger real-time sync for specific items or all items (Now disabled as ERP is disconnected)
- Tags: Enhanced Items
- Request Schema: Body: application/json: anyOf(array of string, null)
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-327: `GET /api/v2/erp/items/variances`
- Endpoint: `/api/v2/erp/items/variances`
- Method: `GET`
- Purpose: Get Variances. Get list of items with variances (verified qty != system qty)
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `limit` required=False schema=integer; query `skip` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-328: `GET /api/v2/erp/items/variances/export/csv`
- Endpoint: `/api/v2/erp/items/variances/export/csv`
- Method: `GET`
- Purpose: Export Variances Csv. Export variances to ERPNext-compatible CSV.
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `max_rows` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-329: `GET /api/v2/erp/items/variances/export/xlsx`
- Endpoint: `/api/v2/erp/items/variances/export/xlsx`
- Method: `GET`
- Purpose: Export Variances Xlsx. Export variances to ERPNext-compatible Excel.
- Tags: Item Verification
- Request Schema: Parameters: query `category` required=False schema=anyOf(string, null); query `floor` required=False schema=anyOf(string, null); query `rack` required=False schema=anyOf(string, null); query `warehouse` required=False schema=anyOf(string, null); query `max_rows` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-330: `POST /api/v2/erp/items/{barcode}/refresh-sql-qty`
- Endpoint: `/api/v2/erp/items/{barcode}/refresh-sql-qty`
- Method: `POST`
- Purpose: Refresh Item Qty From Sql. Manually refresh item quantity from SQL Server.
Updates MongoDB if there's a difference.
- Tags: Item Verification
- Request Schema: Parameters: path `barcode` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-331: `PATCH /api/v2/erp/items/{barcode}/update-master`
- Endpoint: `/api/v2/erp/items/{barcode}/update-master`
- Method: `PATCH`
- Purpose: Update Item Master. Update item master details (MRP, Price, Category, etc.)
- Tags: Item Verification
- Request Schema: Parameters: path `barcode` required=True schema=string | Body: application/json: component `ItemUpdateRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-332: `PATCH /api/v2/erp/items/{barcode}/verify`
- Endpoint: `/api/v2/erp/items/{barcode}/verify`
- Method: `PATCH`
- Purpose: Verify Item. Mark an item as verified/unverified with user tracking and timestamp
- Tags: Item Verification
- Request Schema: Parameters: path `barcode` required=True schema=string | Body: application/json: component `VerificationRequest`
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-333: `GET /api/v2/health/`
- Endpoint: `/api/v2/health/`
- Method: `GET`
- Purpose: Health Check V2. Enhanced health check endpoint
Returns detailed health status of all services
- Tags: API v2, Health v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_HealthCheckResponse_`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-334: `GET /api/v2/health/detailed`
- Endpoint: `/api/v2/health/detailed`
- Method: `GET`
- Purpose: Health Check Detailed V2. Detailed health check endpoint (requires authentication)
Returns even more internal details of services
- Tags: API v2, Health v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_HealthCheckResponse_`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-335: `GET /api/v2/health/metrics-detailed`
- Endpoint: `/api/v2/health/metrics-detailed`
- Method: `GET`
- Purpose: Detailed Health Check. Detailed health check (requires authentication)
Returns comprehensive system status including metrics
- Tags: API v2, Health v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `backend__api__response_models__ApiResponse_dict_str__Any__`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-336: `GET /api/v2/items/`
- Endpoint: `/api/v2/items/`
- Method: `GET`
- Purpose: Get Items V2. Get items with pagination (v2)
Returns standardized paginated response
- Tags: API v2, Items v2
- Request Schema: Parameters: query `search` required=False schema=anyOf(string, null); query `page` required=False schema=integer; query `page_size` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_PaginatedResponse_ItemResponse__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-337: `POST /api/v2/items/identify`
- Endpoint: `/api/v2/items/identify`
- Method: `POST`
- Purpose: Identify Item. Visual Search / Identify Item
Accepts an image, extracts machine-readable identifiers, and returns matching items.
- Tags: API v2, Items v2
- Request Schema: Body: multipart/form-data: component `Body_identify_item_api_v2_items_identify_post`
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_PaginatedResponse_ItemResponse__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-338: `GET /api/v2/items/semantic`
- Endpoint: `/api/v2/items/semantic`
- Method: `GET`
- Purpose: Search Items Semantic. Semantic Search (AI-Powered)
Uses sentence-transformers to find items by meaning/context.
- Tags: API v2, Items v2
- Request Schema: Parameters: query `query` required=True schema=string; query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_PaginatedResponse_ItemResponse__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-339: `GET /api/v2/items/{item_code}`
- Endpoint: `/api/v2/items/{item_code}`
- Method: `GET`
- Purpose: Get Item Details. Get item details with optional SQL verification
When verify_sql=true, triggers SQL quantity verification and updates MongoDB
- Tags: API v2, Items v2
- Request Schema: Parameters: path `item_code` required=True schema=string; query `verify_sql` required=False schema=boolean
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_ItemResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-340: `GET /api/v2/items/{item_id}`
- Endpoint: `/api/v2/items/{item_id}`
- Method: `GET`
- Purpose: Get Item V2. Get a single item by ID (v2)
Returns standardized response
- Tags: API v2, Items v2
- Request Schema: Parameters: path `item_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_ItemResponse_`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-341: `GET /api/v2/metrics/pool`
- Endpoint: `/api/v2/metrics/pool`
- Method: `GET`
- Purpose: Get Connection Pool Metrics. Get connection pool metrics for monitoring
Requires authentication
- Tags: API v2, Metrics v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `backend__api__response_models__ApiResponse_dict_str__Any__`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-342: `GET /api/v2/metrics/system`
- Endpoint: `/api/v2/metrics/system`
- Method: `GET`
- Purpose: Get System Metrics. Get system-wide metrics
Requires authentication
- Tags: API v2, Metrics v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `backend__api__response_models__ApiResponse_dict_str__Any__`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-343: `GET /api/v2/reconciliation/session/{session_id}/summary`
- Endpoint: `/api/v2/reconciliation/session/{session_id}/summary`
- Method: `GET`
- Purpose: Get Session Reconciliation Summary. Get aggregated reconciliation summary for a session.
Aggregates all non-superseded count lines and reports:
- count_variance = physical - baseline
- erp_drift = current_sql - baseline
- final_gap = physical - current_sql
- Tags: Reconciliation
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-344: `GET /api/v2/sessions/`
- Endpoint: `/api/v2/sessions/`
- Method: `GET`
- Purpose: Get Sessions V2. Get sessions with pagination (v2)
Returns standardized paginated response

Note: Non-supervisor users only see their own sessions.
- Tags: API v2, Sessions v2
- Request Schema: Parameters: query `page` required=False schema=integer; query `page_size` required=False schema=integer; query `status` required=False schema=anyOf(string, null)
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_PaginatedResponse_SessionResponse__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-345: `GET /api/v2/sessions/watchtower`
- Endpoint: `/api/v2/sessions/watchtower`
- Method: `GET`
- Purpose: Get Watchtower Stats. Get real-time statistics for the Watchtower dashboard.
Returns:
 - Active sessions count
 - Total scans today
 - Active users (last 15 mins)
 - Recent variances
 - Hourly throughput (today)
- Tags: API v2, Sessions v2
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: component `ApiResponse`
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-346: `GET /api/v2/sessions/{session_id}/rack-progress`
- Endpoint: `/api/v2/sessions/{session_id}/rack-progress`
- Method: `GET`
- Purpose: Get Rack Progress. Get progress percentage for each rack in the session's warehouse.
- Tags: API v2, Sessions v2
- Request Schema: Parameters: path `session_id` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `ApiResponse`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-347: `GET /api/v2/supervisor/predictions`
- Endpoint: `/api/v2/supervisor/predictions`
- Method: `GET`
- Purpose: Get Session Predictions. Get AI-calculated risk predictions for items in a session.
Helps supervisors identify potential variances that need double-checking.
- Tags: API v2, Supervisor v2
- Request Schema: Parameters: query `session_id` required=True schema=string; query `limit` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_list_RiskPrediction__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-348: `POST /api/v2/verification/items/{item_code}/verify-qty`
- Endpoint: `/api/v2/verification/items/{item_code}/verify-qty`
- Method: `POST`
- Purpose: Verify Item Quantity. Verify item quantity against SQL Server

Updates MongoDB with verification fields:
- sql_verified_qty: Quantity from SQL Server
- last_sql_verified_at: Timestamp of verification
- variance: Difference between SQL and MongoDB quantities
- mongo_cached_qty_previous: Previous MongoDB quantity
- sql_qty_mismatch_flag: True if quantities don't match
- Tags: SQL Verification
- Request Schema: Parameters: path `item_code` required=True schema=string
- Response Schema: `200` Successful Response - application/json: component `ApiResponse_Dict_str__Any__`; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: UNDEFINED BEHAVIOR: mutation idempotency is not declared for this endpoint.
- Retry Behavior: Retry only when a stable idempotency key or version guard is present; otherwise UNDEFINED BEHAVIOR.
- Transaction Boundaries: UNDEFINED BEHAVIOR: transaction boundary is not declared for this mutation endpoint.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-349: `GET /api/variance-reasons`
- Endpoint: `/api/variance-reasons`
- Method: `GET`
- Purpose: Get Variance Reasons. Get list of variance reasons
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-350: `GET /api/variance/trend`
- Endpoint: `/api/variance/trend`
- Method: `GET`
- Purpose: Get Variance Trend. Get variance trend data for the last N days
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: query `days` required=False schema=integer
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: Bearer JWT/security declaration `[{"HTTPBearer":[]}]`.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-351: `GET /api/version`
- Endpoint: `/api/version`
- Method: `GET`
- Purpose: Get Version. Get application version and build information

Usage: Version checking, debugging, monitoring
- Tags: info
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-352: `GET /api/version/check`
- Endpoint: `/api/version/check`
- Method: `GET`
- Purpose: Check Version. Check client version compatibility and get update information.

Returns:
- is_compatible: Whether the client meets minimum version requirements
- is_latest: Whether the client has the latest version
- update_available: Whether an update is available
- update_type: Type of update available (major, minor, patch)
- force_update: Whether the client must update to continue using the app

Usage: App startup version check, update prompts
- Tags: info
- Request Schema: Parameters: query `client_version` required=True schema=string
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-353: `GET /health/`
- Endpoint: `/health/`
- Method: `GET`
- Purpose: Health Check. Basic health check endpoint
Returns 200 if service is running

Usage: Monitoring systems, load balancers
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-354: `GET /health/detailed`
- Endpoint: `/health/detailed`
- Method: `GET`
- Purpose: Detailed Health Check. Detailed health check with metrics
Includes version, uptime, database status, and performance metrics

Usage: Monitoring dashboards, troubleshooting
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-355: `GET /health/live`
- Endpoint: `/health/live`
- Method: `GET`
- Purpose: Liveness Check. Kubernetes liveness probe
Returns 200 if application is alive (not deadlocked)

Usage: k8s livenessProbe
Failure action: Restart container
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-356: `GET /health/ready`
- Endpoint: `/health/ready`
- Method: `GET`
- Purpose: Readiness Check. Kubernetes readiness probe
Returns 200 if application is ready to serve traffic
Checks: Database connections, critical services, connection pools

Usage: k8s readinessProbe
Failure action: Remove from load balancer
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-357: `GET /health/startup`
- Endpoint: `/health/startup`
- Method: `GET`
- Purpose: Startup Check. Kubernetes startup probe
Returns 200 when application has finished starting up
Used for slow-starting applications

Usage: k8s startupProbe
Failure action: Restart container after failureThreshold
- Tags: health, health
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - application/json: object properties=[] required=[]
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-358: `GET /security.txt`
- Endpoint: `/security.txt`
- Method: `GET`
- Purpose: Security.txt (fallback). Fallback security.txt location
- Tags: security
- Request Schema: No parameters or body schema declared in OpenAPI.
- Response Schema: `200` Successful Response - text/plain: string
- Error Schema: UNDEFINED BEHAVIOR: no endpoint-specific error schema declared.
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

#### API-359: `GET /{full_path}`
- Endpoint: `/{full_path}`
- Method: `GET`
- Purpose: Serve Spa. UNDEFINED BEHAVIOR: no endpoint description declared.
- Tags: UNDEFINED BEHAVIOR: no tag declared.
- Request Schema: Parameters: path `full_path` required=True schema=string
- Response Schema: `200` Successful Response - application/json: no schema declared; `422` Validation Error - application/json: component `HTTPValidationError`
- Error Schema: `422`/application/json: component `HTTPValidationError`
- Auth Requirements: UNDEFINED BEHAVIOR: no OpenAPI security declaration and no global security declaration.
- Rate Limits: UNDEFINED BEHAVIOR: endpoint-specific rate limit is not declared in OpenAPI.
- Idempotency Behavior: Read-only method; retries do not require an idempotency key if route has no write side effect.
- Retry Behavior: Retry on transient network/5xx failures; stale projection reads remain possible.
- Transaction Boundaries: No write transaction expected; read consistency level is not declared.
- Unresolved Risks: UNDEFINED BEHAVIOR: route-level permission matrix, hidden validation branches, audit event names, and exact database writes must be checked in route code before changes.

### Component Schema Catalog
#### Schema `ActiveUserInfo`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["current_session","last_activity","role","status","user_id","username"]`
- Properties:
- `current_session`: required; schema=anyOf(string, null)
- `last_activity`: required; schema=string
- `role`: required; schema=string
- `status`: required; schema=string
- `user_id`: required; schema=string
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `AddQuantityRequest`
- Type: `object`
- Description: Payload for incrementing quantity on an existing count line.
- Required Fields: `["additional_qty"]`
- Properties:
- `additional_qty`: required; schema=number
- `batches`: schema=anyOf(array of object properties=[] required=[], null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse`
- Type: `object`
- Description: Standard API response wrapper
All API endpoints should use this format for consistency
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(no schema declared, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_ConnectionPoolStatusResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `ConnectionPoolStatusResponse`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_Dict_str__Any__`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(object properties=[] required=[], null)
- `error`: schema=anyOf(object properties=[] required=[], null)
- `message`: schema=anyOf(string, null)
- `payload_version`: schema=string; default="1.0"
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_HealthCheckResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `HealthCheckResponse`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_ItemResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `ItemResponse`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_OptimizedSearchResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `OptimizedSearchResponse`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_PaginatedResponse_ItemResponse__`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `PaginatedResponse_ItemResponse_`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_PaginatedResponse_SessionResponse__`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `PaginatedResponse_SessionResponse_`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_SearchFiltersResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `SearchFiltersResponse`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_SuggestionsResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `SuggestionsResponse`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_TokenResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(component `TokenResponse`, null)
- `error`: schema=anyOf(object properties=[] required=[], null)
- `message`: schema=anyOf(string, null)
- `payload_version`: schema=string; default="1.0"
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_dict_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(object properties=[] required=[], null)
- `error`: schema=anyOf(object properties=[] required=[], null)
- `message`: schema=anyOf(string, null)
- `payload_version`: schema=string; default="1.0"
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ApiResponse_list_RiskPrediction__`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(array of component `RiskPrediction`, null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `AssignableUserItem`
- Type: `object`
- Description: User item for supervisor recount assignment.
- Required Fields: `["username"]`
- Properties:
- `full_name`: schema=anyOf(string, null)
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `AvailableRack`
- Type: `object`
- Description: Available rack information
- Required Fields: `["floor","rack_id","status"]`
- Properties:
- `floor`: required; schema=string
- `item_count`: schema=integer; default=0
- `rack_id`: required; schema=string
- `status`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BatchConflictResolutionRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["conflict_ids","resolution"]`
- Properties:
- `conflict_ids`: required; schema=array of string
- `resolution`: required; schema=string
- `resolution_note`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BatchNotificationRequest`
- Type: `object`
- Description: Request for batch notifications
- Required Fields: `["message","notification_type","title","unread_count","user_ids"]`
- Properties:
- `action_url`: schema=anyOf(string, null)
- `message`: required; schema=string
- `notification_type`: required; schema=string
- `priority`: schema=string; default="medium"
- `title`: required; schema=string
- `unread_count`: required; schema=integer
- `user_ids`: required; schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BatchSyncRequest`
- Type: `object`
- Description: Batch sync request supporting modern records and legacy operations
- Required Fields: `[]`
- Properties:
- `batch_id`: schema=anyOf(string, null); description=Client batch ID for tracking
- `operations`: schema=array of component `LegacySyncOperation`; description=Legacy operations array used by earlier clients
- `records`: schema=array of component `SyncRecord`; description=Structured records to sync
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BatchSyncResponse`
- Type: `object`
- Description: Batch sync response
- Required Fields: `["processing_time_ms","total_records"]`
- Properties:
- `batch_id`: schema=anyOf(string, null); description=Batch ID from request
- `conflicts`: schema=array of component `SyncConflict`; description=Records with conflicts
- `errors`: schema=array of component `SyncError`; description=Failed records
- `failed_count`: schema=anyOf(integer, null); description=Legacy summary: failed operations
- `ok`: schema=array of string; description=Successfully synced record IDs
- `processed_count`: schema=anyOf(integer, null); description=Legacy summary: total operations processed
- `processing_time_ms`: required; schema=number; description=Server processing time
- `results`: schema=array of component `SyncResult`; description=Backward compatible per-record results (id/success/message)
- `success_count`: schema=anyOf(integer, null); description=Legacy summary: successful operations
- `total_records`: required; schema=integer; description=Total records in batch
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `Body_identify_item_api_v2_items_identify_post`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["file"]`
- Properties:
- `file`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BulkActionResult`
- Type: `object`
- Description: Result of bulk action
- Required Fields: `["failed_count","failed_ids","message","success_count"]`
- Properties:
- `failed_count`: required; schema=integer
- `failed_ids`: required; schema=array of string
- `message`: required; schema=string
- `success_count`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BulkCountLineUpdate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["count_line_ids"]`
- Properties:
- `count_line_ids`: required; schema=array of string
- `notes`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BulkEnrichmentRequest`
- Type: `object`
- Description: Request model for bulk enrichment
- Required Fields: `["enrichments"]`
- Properties:
- `enrichments`: required; schema=array of component `EnrichmentRequest`; description=List of enrichment records
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BulkFieldValueSet`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["field_values","item_codes"]`
- Properties:
- `field_values`: required; schema=object properties=[] required=[]; description=Field name-value pairs
- `item_codes`: required; schema=array of string; description=List of item codes
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BulkSessionCloseRequest`
- Type: `object`
- Description: Request for bulk closing sessions
- Required Fields: `["session_ids"]`
- Properties:
- `force`: schema=boolean; default=false
- `session_ids`: required; schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `BulkUserAction`
- Type: `object`
- Description: Request for bulk user actions
- Required Fields: `["action","user_ids"]`
- Properties:
- `action`: required; schema=string; pattern="^(activate|deactivate|delete|change_role)$"
- `role`: schema=anyOf(string, null)
- `user_ids`: required; schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CanonicalSessionStatus`
- Type: `string`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Enum Values: `["OPEN","ACTIVE","PAUSED","RECONCILE","COMPLETED","CLOSED","CANCELLED","UNKNOWN"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ColumnMapping`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["app_field","erp_column","is_required","table_name"]`
- Properties:
- `app_field`: required; schema=string
- `erp_column`: required; schema=string
- `is_required`: required; schema=boolean
- `table_name`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ColumnVisibilitySettings`
- Type: `object`
- Description: Per-user visibility settings for optional inventory fields.
- Required Fields: `[]`
- Properties:
- `expiry_date`: schema=boolean; default=true; description=Show expiry date fields
- `mfg_date`: schema=boolean; default=true; description=Show manufacturing date fields
- `mrp`: schema=boolean; default=true; description=Show MRP fields
- `serial_number`: schema=boolean; default=true; description=Show serial number fields
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ColumnVisibilitySettingsUpdate`
- Type: `object`
- Description: Partial update model for column visibility settings.
- Required Fields: `[]`
- Properties:
- `expiry_date`: schema=anyOf(boolean, null); description=Show expiry date fields
- `mfg_date`: schema=anyOf(boolean, null); description=Show manufacturing date fields
- `mrp`: schema=anyOf(boolean, null); description=Show MRP fields
- `serial_number`: schema=anyOf(boolean, null); description=Show serial number fields
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CompareSnapshotsRequest`
- Type: `object`
- Description: Compare snapshots request
- Required Fields: `["snapshot_a_id","snapshot_b_id"]`
- Properties:
- `comparison_name`: schema=anyOf(string, null); description=Comparison name
- `snapshot_a_id`: required; schema=string; description=First snapshot ID
- `snapshot_b_id`: required; schema=string; description=Second snapshot ID
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ConflictResolutionRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["resolution"]`
- Properties:
- `merged_data`: schema=anyOf(object properties=[] required=[], null)
- `resolution`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ConnectionPoolStatusResponse`
- Type: `object`
- Description: Connection pool status response
- Required Fields: `["available","checked_out","created","metrics","pool_size","status","utilization"]`
- Properties:
- `available`: required; schema=integer; description=Number of available connections
- `checked_out`: required; schema=integer; description=Number of connections in use
- `created`: required; schema=integer; description=Number of connections created
- `health_check`: schema=anyOf(object properties=[] required=[], null); description=Last health check results
- `metrics`: required; schema=object properties=[] required=[]; description=Detailed metrics
- `pool_size`: required; schema=integer; description=Configured pool size
- `status`: required; schema=string; description=Pool status: healthy, degraded, unhealthy
- `utilization`: required; schema=number; description=Pool utilization percentage
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CorrectionMetadata`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["reason_code"]`
- Properties:
- `approved_at`: schema=anyOf(string, null)
- `approved_by`: schema=anyOf(string, null)
- `notes`: schema=anyOf(string, null)
- `reason_code`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CorrectionReason`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["code","description"]`
- Properties:
- `code`: required; schema=string
- `description`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CountLineApprovalRequest`
- Type: `object`
- Description: Optional metadata for approving a count line.
- Required Fields: `[]`
- Properties:
- `notes`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CountLineBatchCreate`
- Type: `object`
- Description: Batch create payload for multiple count lines.
- Required Fields: `["lines","session_id"]`
- Properties:
- `lines`: required; schema=array of component `CountLineCreate`
- `session_id`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CountLineCreate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["counted_qty","item_code","session_id"]`
- Properties:
- `barcode`: schema=anyOf(string, null)
- `base_uom`: schema=anyOf(string, null)
- `batch_id`: schema=anyOf(string, null)
- `batches`: schema=anyOf(array of object properties=[] required=[], null)
- `category_correction`: schema=anyOf(string, null)
- `condition_details`: schema=anyOf(string, null)
- `conversion_factor`: schema=anyOf(number, null); default=1.0
- `correction_metadata`: schema=anyOf(component `CorrectionMetadata`, null)
- `correction_reason`: schema=anyOf(component `CorrectionReason`, null)
- `counted_qty`: required; schema=number
- `damage_included`: schema=anyOf(boolean, null)
- `damaged_qty`: schema=anyOf(number, null); default=0
- `expected_location`: schema=anyOf(string, null)
- `expiry_date`: schema=anyOf(string, null)
- `expiry_date_format`: schema=anyOf(component `DateFormatType`, null)
- `floor_id`: schema=anyOf(string, null)
- `floor_no`: schema=anyOf(string, null)
- `found_location`: schema=anyOf(string, null)
- `idempotency_key`: schema=anyOf(string, null)
- `input_qty`: schema=anyOf(number, null)
- `input_uom`: schema=anyOf(string, null)
- `inventory_state`: schema=anyOf(component `InventoryState`, null); default="AVAILABLE"
- `is_misplaced`: schema=anyOf(boolean, null); default=false
- `item_code`: required; schema=string
- `item_condition`: schema=anyOf(string, null)
- `item_name`: schema=anyOf(string, null)
- `location_id`: schema=anyOf(string, null)
- `manufacturing_date`: schema=anyOf(string, null)
- `mark_location`: schema=anyOf(string, null)
- `mfg_date_format`: schema=anyOf(component `DateFormatType`, null)
- `mrp_counted`: schema=anyOf(number, null)
- `mrp_source`: schema=anyOf(string, null)
- `non_returnable_damaged_qty`: schema=anyOf(number, null); default=0
- `photo_base64`: schema=anyOf(string, null)
- `photo_proofs`: schema=anyOf(array of component `PhotoProof`, null)
- `previous_version_id`: schema=anyOf(string, null)
- `quantity_precision`: schema=anyOf(integer, null)
- `rack_id`: schema=anyOf(string, null)
- `rack_no`: schema=anyOf(string, null)
- `recount_of_id`: schema=anyOf(string, null)
- `relocation_status`: schema=anyOf(component `RelocationStatus`, null)
- `remark`: schema=anyOf(string, null)
- `serial_entries`: schema=anyOf(array of component `SerialEntry`, null)
- `serial_numbers`: schema=anyOf(array of string, null)
- `session_id`: required; schema=string
- `split_section`: schema=anyOf(string, null)
- `sr_no`: schema=anyOf(string, null)
- `subcategory_correction`: schema=anyOf(string, null)
- `uom_code`: schema=anyOf(string, null)
- `uom_name`: schema=anyOf(string, null)
- `variance_note`: schema=anyOf(string, null)
- `variance_reason`: schema=anyOf(string, null)
- `variant_barcode`: schema=anyOf(string, null)
- `variant_id`: schema=anyOf(string, null)
- `version`: schema=integer; default=1
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CountLineMergeRequest`
- Type: `object`
- Description: Request to merge duplicate count lines
- Required Fields: `["source_line_ids","target_line_id"]`
- Properties:
- `keep_target_qty`: schema=boolean; default=true
- `source_line_ids`: required; schema=array of string
- `target_line_id`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CountLineRejectRequest`
- Type: `object`
- Description: Optional metadata for requesting a recount.
- Required Fields: `[]`
- Properties:
- `assign_to`: schema=anyOf(string, null)
- `notes`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CountLineUpdateRequest`
- Type: `object`
- Description: Minimal update payload for a count line (used by bulk update tooling).
- Required Fields: `[]`
- Properties:
- `batches`: schema=anyOf(array of object properties=[] required=[], null)
- `counted_qty`: schema=anyOf(number, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CreateSKUFromUnknownRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["category","item_code","item_name","mrp","uom_code"]`
- Properties:
- `category`: required; schema=string
- `item_code`: required; schema=string
- `item_name`: required; schema=string
- `mrp`: required; schema=number
- `resolve_notes`: schema=anyOf(string, null)
- `subcategory`: schema=anyOf(string, null)
- `uom_code`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CreateSnapshotRequest`
- Type: `object`
- Description: Create snapshot request
- Required Fields: `["description","name","query_spec"]`
- Properties:
- `description`: required; schema=string; description=Snapshot description
- `name`: required; schema=string; description=Snapshot name
- `query_spec`: required; schema=component `QuerySpec`
- `snapshot_type`: schema=string; default="custom"; description=Snapshot type
- `tags`: schema=anyOf(array of string, null); description=Tags
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `CreateUserRequest`
- Type: `object`
- Description: Request to create a new user
- Required Fields: `["password","username"]`
- Properties:
- `email`: schema=anyOf(string, null)
- `full_name`: schema=anyOf(string, null)
- `password`: required; schema=string; minLength=8; maxLength=128
- `permissions`: schema=anyOf(array of string, null)
- `pin`: schema=anyOf(string, null)
- `role`: schema=string; pattern="^(staff|supervisor|admin)$"; default="staff"
- `username`: required; schema=string; minLength=3; maxLength=50; pattern="^[a-zA-Z0-9_-]+$"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `DashboardColumnPreference`
- Type: `object`
- Description: User's column visibility preferences.
- Required Fields: `["field","visible"]`
- Properties:
- `field`: required; schema=string
- `visible`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `DashboardConfig`
- Type: `object`
- Description: Dashboard configuration from frontend.
- Required Fields: `[]`
- Properties:
- `auto_refresh`: schema=boolean; default=true
- `columns`: schema=anyOf(array of component `DashboardColumnPreference`, null)
- `filters`: schema=anyOf(object properties=[] required=[], null)
- `page`: schema=integer; minimum=1.0; default=1
- `page_size`: schema=integer; minimum=10.0; maximum=200.0; default=50
- `refresh_interval_seconds`: schema=integer; minimum=5.0; maximum=300.0; default=10
- `sort_by`: schema=anyOf(string, null)
- `sort_order`: schema=string; default="desc"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `DataCompletenessResponse`
- Type: `object`
- Description: Response model for data completeness check
- Required Fields: `["filled_fields","is_complete","item_code","missing_fields","percentage","total_fields"]`
- Properties:
- `filled_fields`: required; schema=integer
- `is_complete`: required; schema=boolean
- `item_code`: required; schema=string
- `missing_fields`: required; schema=array of string
- `percentage`: required; schema=number
- `total_fields`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `DataSubjectRequestCreate`
- Type: `object`
- Description: GDPR data subject request
- Required Fields: `["request_type","subject_id"]`
- Properties:
- `notes`: schema=anyOf(string, null)
- `request_type`: required; schema=string; pattern="^(access|erasure|rectification|portability)$"
- `subject_email`: schema=anyOf(string, null)
- `subject_id`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `DateFormatType`
- Type: `string`
- Description: Date format type for manufacturing and expiry dates
- Required Fields: `[]`
- Enum Values: `["full","month_year","year_only","none"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ERPItem`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `barcode`: schema=string; default=""
- `batch_id`: schema=anyOf(integer, string, null)
- `batch_no`: schema=anyOf(string, null)
- `brand_code`: schema=anyOf(string, null)
- `brand_id`: schema=anyOf(string, null)
- `brand_name`: schema=anyOf(string, null)
- `category`: schema=anyOf(string, null)
- `cgst_percent`: schema=anyOf(number, null)
- `damaged_qty`: schema=anyOf(number, null)
- `expiry_date`: schema=anyOf(string, null)
- `floor`: schema=anyOf(string, null)
- `gst_category`: schema=anyOf(string, null)
- `gst_percent`: schema=anyOf(number, null)
- `hsn_code`: schema=anyOf(string, null)
- `igst_percent`: schema=anyOf(number, null)
- `image_url`: schema=anyOf(string, null)
- `is_serialized`: schema=anyOf(boolean, null)
- `item_code`: schema=string; default=""
- `item_condition`: schema=anyOf(string, null)
- `item_name`: schema=string; default=""
- `last_purchase_cost`: schema=anyOf(number, null)
- `last_purchase_date`: schema=anyOf(string, null)
- `last_purchase_price`: schema=anyOf(number, null)
- `last_purchase_qty`: schema=anyOf(number, null)
- `last_purchase_rate`: schema=anyOf(number, null)
- `last_purchase_supplier`: schema=anyOf(string, null)
- `last_scanned_at`: schema=anyOf(string, null)
- `last_sql_verified_at`: schema=anyOf(string, null)
- `location`: schema=anyOf(string, null)
- `manual_barcode`: schema=anyOf(string, null)
- `manufacturing_date`: schema=anyOf(string, null)
- `mongo_cached_qty_previous`: schema=anyOf(number, null)
- `mrp`: schema=number; default=0.0
- `non_returnable_damaged_qty`: schema=anyOf(number, null)
- `purchase_invoice_no`: schema=anyOf(string, null)
- `purchase_price`: schema=anyOf(number, null)
- `purchase_qty`: schema=anyOf(number, null)
- `purchase_reference`: schema=anyOf(string, null)
- `purchase_type`: schema=anyOf(string, null)
- `purchase_voucher_type`: schema=anyOf(string, null)
- `rack`: schema=anyOf(string, null)
- `sale_price`: schema=anyOf(number, null)
- `sales_price`: schema=anyOf(number, null)
- `serial_number`: schema=anyOf(string, null)
- `sgst_percent`: schema=anyOf(number, null)
- `sql_qty_mismatch_flag`: schema=anyOf(boolean, null)
- `sql_verification_status`: schema=anyOf(string, null)
- `sql_verified_qty`: schema=anyOf(number, null)
- `standard_rate`: schema=anyOf(number, null)
- `stock_qty`: schema=number; default=0.0
- `subcategory`: schema=anyOf(string, null)
- `supplier_city`: schema=anyOf(string, null)
- `supplier_code`: schema=anyOf(string, null)
- `supplier_gst`: schema=anyOf(string, null)
- `supplier_id`: schema=anyOf(string, null)
- `supplier_name`: schema=anyOf(string, null)
- `supplier_phone`: schema=anyOf(string, null)
- `supplier_state`: schema=anyOf(string, null)
- `uom_code`: schema=anyOf(string, null)
- `uom_name`: schema=anyOf(string, null)
- `variance`: schema=anyOf(number, null)
- `verified`: schema=anyOf(boolean, null); default=false
- `verified_at`: schema=anyOf(string, null)
- `verified_by`: schema=anyOf(string, null)
- `verified_floor`: schema=anyOf(string, null)
- `verified_qty`: schema=anyOf(number, null)
- `verified_rack`: schema=anyOf(string, null)
- `warehouse`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `EnrichmentRequest`
- Type: `object`
- Description: Request model for item enrichment
- Required Fields: `["item_code"]`
- Properties:
- `barcode`: schema=anyOf(string, null); description=Barcode (8-13 digits)
- `condition`: schema=anyOf(string, null); description=Item condition: good, damaged, obsolete, new
- `hsn_code`: schema=anyOf(string, null); description=HSN code (4 or 8 digits)
- `item_code`: required; schema=string; description=Item code to enrich
- `location`: schema=anyOf(string, null); description=Physical location/rack
- `mrp`: schema=anyOf(number, null); description=Maximum Retail Price
- `notes`: schema=anyOf(string, null); description=Additional notes
- `serial_number`: schema=anyOf(string, null); description=Serial number
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `EnrichmentResponse`
- Type: `object`
- Description: Response model for enrichment operation
- Required Fields: `["item_code","success"]`
- Properties:
- `completion_percentage`: schema=number; default=0.0
- `corrections_count`: schema=integer; default=0
- `data_complete`: schema=boolean; default=false
- `error`: schema=anyOf(string, null)
- `fields_updated`: schema=array of string; default=[]
- `item_code`: required; schema=string
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ErrorLogEntry`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["details","endpoint","id","level","message","timestamp","user_id"]`
- Properties:
- `details`: required; schema=object properties=[] required=[]
- `endpoint`: required; schema=anyOf(string, null)
- `id`: required; schema=string
- `level`: required; schema=string
- `message`: required; schema=string
- `timestamp`: required; schema=string
- `user_id`: required; schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ErrorReport`
- Type: `object`
- Description: Error report model
- Required Fields: `["message","severity","type"]`
- Properties:
- `context`: schema=anyOf(object properties=[] required=[], null)
- `message`: required; schema=string
- `severity`: required; schema=string
- `timestamp`: schema=anyOf(string, null)
- `type`: required; schema=string
- `user_id`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ExportScheduleCreate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["export_type","frequency","name"]`
- Properties:
- `email_recipients`: schema=array of string
- `export_type`: required; schema=string
- `filters`: schema=object properties=[] required=[]
- `format`: schema=string; default="csv"
- `frequency`: required; schema=string
- `name`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ExportScheduleUpdate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `email_recipients`: schema=anyOf(array of string, null)
- `enabled`: schema=anyOf(boolean, null)
- `filters`: schema=anyOf(object properties=[] required=[], null)
- `format`: schema=anyOf(string, null)
- `frequency`: schema=anyOf(string, null)
- `name`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `FeatureFlagRequest`
- Type: `object`
- Description: Feature flag creation/update request
- Required Fields: `["key","name"]`
- Properties:
- `allowed_roles`: schema=array of string
- `allowed_users`: schema=array of string
- `description`: schema=anyOf(string, null)
- `key`: required; schema=string
- `name`: required; schema=string
- `percentage`: schema=integer; minimum=0.0; maximum=100.0; default=0
- `state`: schema=string; default="disabled"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `FieldDefinitionCreate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["display_label","field_name","field_type"]`
- Properties:
- `db_mapping`: schema=anyOf(string, null); description=Database field mapping
- `default_value`: schema=anyOf(no schema declared, null); description=Default value
- `display_label`: required; schema=string; description=Display label
- `field_name`: required; schema=string; description=Internal field name
- `field_type`: required; schema=string; description=Field type
- `in_reports`: schema=boolean; default=true; description=Include in reports
- `options`: schema=anyOf(array of string, null); description=Options for select types
- `order`: schema=integer; default=0; description=Display order
- `required`: schema=boolean; default=false; description=Is field required
- `searchable`: schema=boolean; default=false; description=Is field searchable
- `validation_rules`: schema=anyOf(object properties=[] required=[], null); description=Validation rules
- `visible`: schema=boolean; default=true; description=Is field visible
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `FieldDefinitionUpdate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `default_value`: schema=anyOf(no schema declared, null)
- `display_label`: schema=anyOf(string, null)
- `enabled`: schema=anyOf(boolean, null)
- `in_reports`: schema=anyOf(boolean, null)
- `options`: schema=anyOf(array of string, null)
- `order`: schema=anyOf(integer, null)
- `required`: schema=anyOf(boolean, null)
- `searchable`: schema=anyOf(boolean, null)
- `validation_rules`: schema=anyOf(object properties=[] required=[], null)
- `visible`: schema=anyOf(boolean, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `FieldValueSet`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["field_name","item_code","value"]`
- Properties:
- `field_name`: required; schema=string; description=Field name
- `item_code`: required; schema=string; description=Item code
- `value`: required; schema=UNDEFINED BEHAVIOR; description=Field value
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `HTTPValidationError`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `detail`: schema=array of component `ValidationError`
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `HealthCheckResponse`
- Type: `object`
- Description: Health check response
- Required Fields: `["services","status"]`
- Properties:
- `services`: required; schema=object properties=[] required=[]; description=Individual service health statuses
- `status`: required; schema=string; description=Overall health status: healthy, degraded, unhealthy
- `timestamp`: schema=string; format="date-time"; description=Health check timestamp
- `version`: schema=anyOf(string, null); description=Application version
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `HeartbeatResponse`
- Type: `object`
- Description: Heartbeat response
- Required Fields: `["id","lock_ttl_remaining","message","rack_lock_renewed","success","user_presence_updated"]`
- Properties:
- `id`: required; schema=string
- `lock_ttl_remaining`: required; schema=integer
- `message`: required; schema=string
- `rack_lock_renewed`: required; schema=boolean
- `success`: required; schema=boolean
- `user_presence_updated`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `IPListEntry`
- Type: `object`
- Description: IP list entry request
- Required Fields: `["ip_address","list_type"]`
- Properties:
- `expires_hours`: schema=anyOf(integer, null)
- `ip_address`: required; schema=string
- `list_type`: required; schema=string; pattern="^(whitelist|blacklist)$"
- `reason`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `InventoryState`
- Type: `string`
- Description: Formal inventory state of the physical stock for a count line.
- Required Fields: `[]`
- Enum Values: `["AVAILABLE","RESERVED","DAMAGED","NON_RETURNABLE","QUARANTINED","IN_TRANSIT","EXPIRED"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ItemResponse`
- Type: `object`
- Description: Item response model
- Required Fields: `["id","name","stock_qty"]`
- Properties:
- `barcode`: schema=anyOf(string, null)
- `category`: schema=anyOf(string, null)
- `id`: required; schema=string
- `item_code`: schema=anyOf(string, null)
- `last_sql_verified_at`: schema=anyOf(string, null)
- `mongo_cached_qty_previous`: schema=anyOf(number, null)
- `mrp`: schema=anyOf(number, null)
- `name`: required; schema=string
- `sql_qty_mismatch_flag`: schema=anyOf(boolean, null)
- `sql_verification_status`: schema=anyOf(string, null)
- `sql_verified_qty`: schema=anyOf(number, null)
- `stock_qty`: required; schema=number
- `subcategory`: schema=anyOf(string, null)
- `uom_name`: schema=anyOf(string, null)
- `variance`: schema=anyOf(number, null)
- `warehouse`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ItemUpdateRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `category`: schema=anyOf(string, null)
- `mrp`: schema=anyOf(number, null)
- `sales_price`: schema=anyOf(number, null)
- `subcategory`: schema=anyOf(string, null)
- `uom`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `KPIResponse`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["active_sessions","active_users","items_verified_today","pending_variances","timestamp","total_stock_value","verification_percentage","verified_stock_value"]`
- Properties:
- `active_sessions`: required; schema=integer
- `active_users`: required; schema=integer
- `items_verified_today`: required; schema=integer
- `pending_variances`: required; schema=integer
- `timestamp`: required; schema=string
- `total_stock_value`: required; schema=number
- `verification_percentage`: required; schema=number
- `verified_stock_value`: required; schema=number
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `LegacySyncOperation`
- Type: `object`
- Description: Legacy offline queue operation structure
- Required Fields: `["data","id","type"]`
- Properties:
- `data`: required; schema=object properties=[] required=[]
- `id`: required; schema=string
- `timestamp`: schema=anyOf(string, null)
- `type`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `MapUnknownItemRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["item_code"]`
- Properties:
- `item_code`: required; schema=string
- `resolve_notes`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `MappingConfig`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["columns","tables"]`
- Properties:
- `columns`: required; schema=object properties=[] required=[]
- `query_options`: schema=object properties=[] required=[]
- `tables`: required; schema=object properties=[] required=[]
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `NoteCreate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["content","title"]`
- Properties:
- `content`: required; schema=string; minLength=1; maxLength=5000
- `title`: required; schema=string; minLength=1; maxLength=200
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `NotificationDeviceRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["token"]`
- Properties:
- `platform`: schema=anyOf(string, null)
- `token`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `NotificationListResponse`
- Type: `object`
- Description: List of notifications with count
- Required Fields: `["notifications","total","unread_count"]`
- Properties:
- `notifications`: required; schema=array of object properties=[] required=[]
- `total`: required; schema=integer
- `unread_count`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `OptimizedSearchResponse`
- Type: `object`
- Description: Optimized search response with metadata
- Required Fields: `["items","metadata","page","page_size","total"]`
- Properties:
- `items`: required; schema=array of component `SearchItemResponse`
- `metadata`: required; schema=component `SearchMetadata`
- `page`: required; schema=integer
- `page_size`: required; schema=integer
- `total`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PaginatedResponse_ItemResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["has_next","has_previous","items","page","page_size","total","total_pages"]`
- Properties:
- `has_next`: required; schema=boolean; description=Whether there is a next page
- `has_previous`: required; schema=boolean; description=Whether there is a previous page
- `items`: required; schema=array of component `ItemResponse`; description=List of items
- `page`: required; schema=integer; minimum=1.0; description=Current page number
- `page_size`: required; schema=integer; minimum=1.0; maximum=100.0; description=Items per page
- `total`: required; schema=integer; description=Total number of items
- `total_pages`: required; schema=integer; description=Total number of pages
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PaginatedResponse_SessionResponse_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["has_next","has_previous","items","page","page_size","total","total_pages"]`
- Properties:
- `has_next`: required; schema=boolean; description=Whether there is a next page
- `has_previous`: required; schema=boolean; description=Whether there is a previous page
- `items`: required; schema=array of component `SessionResponse`; description=List of items
- `page`: required; schema=integer; minimum=1.0; description=Current page number
- `page_size`: required; schema=integer; minimum=1.0; maximum=100.0; description=Items per page
- `total`: required; schema=integer; description=Total number of items
- `total_pages`: required; schema=integer; description=Total number of pages
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PaginatedResponse_Session_`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["has_next","has_previous","items","page","page_size","total","total_pages"]`
- Properties:
- `has_next`: required; schema=boolean; description=Whether there is a next page
- `has_previous`: required; schema=boolean; description=Whether there is a previous page
- `items`: required; schema=array of component `Session`; description=List of items
- `page`: required; schema=integer; minimum=1.0; description=Current page number
- `page_size`: required; schema=integer; minimum=1.0; maximum=100.0; description=Items per page
- `total`: required; schema=integer; description=Total number of items
- `total_pages`: required; schema=integer; description=Total number of pages
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PasswordResetConfirm`
- Type: `object`
- Description: Confirm password reset using the token.
- Required Fields: `["confirm_password","new_password","reset_token"]`
- Properties:
- `confirm_password`: required; schema=string
- `new_password`: required; schema=string
- `reset_token`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PasswordResetRequest`
- Type: `object`
- Description: Request for a password reset OTP.
- Required Fields: `[]`
- Properties:
- `phone_number`: schema=anyOf(string, null)
- `username`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PasswordResetVerify`
- Type: `object`
- Description: Verify OTP and get a reset token.
- Required Fields: `["otp"]`
- Properties:
- `otp`: required; schema=string
- `phone_number`: schema=anyOf(string, null)
- `username`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PerformanceMetric`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["error_count","latency_ms","throughput_rps","timestamp"]`
- Properties:
- `error_count`: required; schema=integer
- `latency_ms`: required; schema=number
- `throughput_rps`: required; schema=number
- `timestamp`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PermissionUpdate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["permissions"]`
- Properties:
- `permissions`: required; schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PhotoProof`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["id","timestamp","url"]`
- Properties:
- `id`: required; schema=string
- `timestamp`: required; schema=string; format="date-time"
- `url`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PinChangeRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["current_password","new_pin"]`
- Properties:
- `current_password`: required; schema=string
- `new_pin`: required; schema=string; minLength=4; maxLength=4; pattern="^\\d{4}$"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PinLogin`
- Type: `object`
- Description: PIN-based login for staff users (4-digit numeric PIN).
- Required Fields: `["pin"]`
- Properties:
- `pin`: required; schema=string
- `username`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PinLoginRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["pin","username"]`
- Properties:
- `pin`: required; schema=string
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PinSetup`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["confirm_pin","pin"]`
- Properties:
- `confirm_pin`: required; schema=string
- `pin`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `PinVerificationRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["action","pin","reason","staff_username","supervisor_username"]`
- Properties:
- `action`: required; schema=string
- `entity_id`: schema=anyOf(string, null)
- `entity_type`: schema=anyOf(string, null)
- `pin`: required; schema=string
- `reason`: required; schema=string
- `staff_username`: required; schema=string
- `supervisor_username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `QuerySpec`
- Type: `object`
- Description: Query specification
- Required Fields: `["collection"]`
- Properties:
- `aggregations`: schema=anyOf(object properties=[] required=[], null); description=Aggregations
- `collection`: required; schema=string; description=Collection to query
- `filters`: schema=anyOf(object properties=[] required=[], null); description=Filter conditions
- `group_by`: schema=anyOf(array of string, null); description=Group by fields
- `limit`: schema=anyOf(integer, null); description=Limit results
- `sort`: schema=anyOf(object properties=[] required=[], null); description=Sort specification
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RackClaimRequest`
- Type: `object`
- Description: Rack claim request
- Required Fields: `["floor"]`
- Properties:
- `floor`: required; schema=string; description=Floor where rack is located
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RackClaimResponse`
- Type: `object`
- Description: Rack claim response
- Required Fields: `["floor","lock_ttl","message","rack_id","session_id","success"]`
- Properties:
- `floor`: required; schema=string
- `lock_ttl`: required; schema=integer
- `message`: required; schema=string
- `rack_id`: required; schema=string
- `session_id`: required; schema=string
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RackReleaseResponse`
- Type: `object`
- Description: Rack release response
- Required Fields: `["message","rack_id","success"]`
- Properties:
- `message`: required; schema=string
- `rack_id`: required; schema=string
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RackStatus`
- Type: `object`
- Description: Rack status information
- Required Fields: `["floor","rack_id","status","updated_at"]`
- Properties:
- `claimed_by`: schema=anyOf(string, null)
- `floor`: required; schema=string
- `lock_expires_at`: schema=anyOf(number, null)
- `rack_id`: required; schema=string
- `session_id`: schema=anyOf(string, null)
- `status`: required; schema=string
- `updated_at`: required; schema=number
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RecountAssignRequest`
- Type: `object`
- Description: Request to assign recount to staff
- Required Fields: `["assign_to","recount_id"]`
- Properties:
- `assign_to`: required; schema=string
- `notes`: schema=anyOf(string, null)
- `recount_id`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RecountCreateRequest`
- Type: `object`
- Description: Request to create a recount
- Required Fields: `["count_line_id","reason"]`
- Properties:
- `allow_self_assignment`: schema=boolean; default=false
- `assign_to`: schema=anyOf(string, null)
- `count_line_id`: required; schema=string
- `due_date`: schema=anyOf(string, null)
- `notes`: schema=anyOf(string, null)
- `priority`: schema=component `RecountPriority`; default="medium"
- `reason`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RecountPriority`
- Type: `string`
- Description: Recount priority levels
- Required Fields: `[]`
- Enum Values: `["low","medium","high","urgent"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RecountResponse`
- Type: `object`
- Description: Recount response
- Required Fields: `["assigned_to","barcode","completed_at","count_line_id","created_at","created_by","due_date","id","item_code","item_name","priority","reason","result_qty","status","updated_at"]`
- Properties:
- `assigned_to`: required; schema=anyOf(string, null)
- `barcode`: required; schema=anyOf(string, null)
- `completed_at`: required; schema=anyOf(string, null)
- `count_line_id`: required; schema=string
- `created_at`: required; schema=string
- `created_by`: required; schema=string
- `due_date`: required; schema=anyOf(string, null)
- `id`: required; schema=string
- `item_code`: required; schema=anyOf(string, null)
- `item_name`: required; schema=string
- `priority`: required; schema=string
- `reason`: required; schema=string
- `result_qty`: required; schema=anyOf(number, null)
- `status`: required; schema=string
- `updated_at`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RecountStatus`
- Type: `string`
- Description: Recount request status
- Required Fields: `[]`
- Enum Values: `["pending","assigned","in_progress","completed","cancelled","expired"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RecountUpdateRequest`
- Type: `object`
- Description: Request to update recount status
- Required Fields: `[]`
- Properties:
- `notes`: schema=anyOf(string, null)
- `result_qty`: schema=anyOf(number, null)
- `status`: schema=anyOf(component `RecountStatus`, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RelocationStatus`
- Type: `string`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Enum Values: `["PENDING","MOVED","IGNORED"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportField`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["name"]`
- Properties:
- `format`: schema=anyOf(string, null); description=Format specification
- `label`: schema=anyOf(string, null); description=Display label
- `name`: required; schema=string; description=Field name
- `source`: schema=string; default="database"; description=Source: database or dynamic
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportFilter`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `category`: schema=anyOf(string, null)
- `date_from`: schema=anyOf(string, null)
- `date_to`: schema=anyOf(string, null)
- `floor`: schema=anyOf(string, null)
- `status`: schema=anyOf(string, null)
- `user_id`: schema=anyOf(string, null)
- `warehouse`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportGeneration`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `runtime_filters`: schema=anyOf(object properties=[] required=[], null); description=Runtime filters
- `template_data`: schema=anyOf(component `ReportTemplate`, null); description=Custom template
- `template_id`: schema=anyOf(string, null); description=Template ID
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["report_type"]`
- Properties:
- `filters`: schema=anyOf(component `ReportFilter`, null)
- `format`: schema=string; pattern="^(json|csv|xlsx)$"; default="json"
- `include_summary`: schema=boolean; default=true
- `report_type`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportResponse`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["data","summary"]`
- Properties:
- `data`: required; schema=array of object properties=[] required=[]
- `summary`: required; schema=component `ReportSummary`
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportSummary`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["filters_applied","generated_at","report_name","report_type","total_records"]`
- Properties:
- `filters_applied`: required; schema=object properties=[] required=[]
- `generated_at`: required; schema=string
- `report_name`: required; schema=string
- `report_type`: required; schema=string
- `total_records`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ReportTemplate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["description","fields","name","report_type"]`
- Properties:
- `aggregations`: schema=object properties=[] required=[]; description=Aggregation functions
- `description`: required; schema=string; description=Template description
- `fields`: required; schema=array of component `ReportField`; description=Fields to include
- `filters`: schema=object properties=[] required=[]; description=Filter criteria
- `format`: schema=string; default="excel"; description=Output format
- `grouping`: schema=anyOf(array of string, null); description=Group by fields
- `name`: required; schema=string; description=Template name
- `report_type`: required; schema=string; description=Report type
- `sorting`: schema=array of object properties=[] required=[]; description=Sort configuration
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ResetPasswordRequest`
- Type: `object`
- Description: Request to reset a user's password.
- Required Fields: `["new_password"]`
- Properties:
- `new_password`: required; schema=string; minLength=8; maxLength=128
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ResetPinRequest`
- Type: `object`
- Description: Request to reset a user's PIN.
- Required Fields: `["new_pin"]`
- Properties:
- `new_pin`: required; schema=string; pattern="^\\d{4}$"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RetentionPolicyRequest`
- Type: `object`
- Description: Retention policy request
- Required Fields: `["collection_name","retention_days"]`
- Properties:
- `archive_before_delete`: schema=boolean; default=true
- `collection_name`: required; schema=string
- `description`: schema=anyOf(string, null)
- `retention_days`: required; schema=integer; minimum=1.0; maximum=3650.0
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `RiskPrediction`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["category","item_code","item_name","reason","risk_score"]`
- Properties:
- `category`: required; schema=string
- `item_code`: required; schema=string
- `item_name`: required; schema=string
- `reason`: required; schema=string
- `risk_score`: required; schema=number
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SearchFiltersResponse`
- Type: `object`
- Description: Search filters response (distinct metadata)
- Required Fields: `["categories","warehouses"]`
- Properties:
- `categories`: required; schema=array of string
- `warehouses`: required; schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SearchItemResponse`
- Type: `object`
- Description: Search result item
- Required Fields: `["id","item_name"]`
- Properties:
- `barcode`: schema=anyOf(string, null); description=Barcode
- `batch_id`: schema=anyOf(integer, string, null); description=Batch ID
- `category`: schema=anyOf(string, null); description=Category
- `id`: required; schema=string; description=Item ID
- `item_code`: schema=anyOf(string, null); description=Item code
- `item_name`: required; schema=string; description=Item name
- `manual_barcode`: schema=anyOf(string, null); description=Manual barcode
- `match_type`: schema=string; default="none"; description=Type of match found
- `mrp`: schema=anyOf(number, null); description=MRP/Price
- `relevance_score`: schema=number; default=0.0; description=Search relevance score
- `sale_price`: schema=anyOf(number, null); description=Sale Price
- `stock_qty`: schema=number; default=0.0; description=Stock quantity
- `subcategory`: schema=anyOf(string, null); description=Subcategory
- `unit2_barcode`: schema=anyOf(string, null); description=Unit 2 barcode
- `unit_m_barcode`: schema=anyOf(string, null); description=Unit M barcode
- `uom_name`: schema=anyOf(string, null); description=Unit of measure
- `warehouse`: schema=anyOf(string, null); description=Warehouse
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SearchMetadata`
- Type: `object`
- Description: Search metadata
- Required Fields: `["query"]`
- Properties:
- `has_more`: schema=boolean; default=false; description=Whether more results are available
- `query`: required; schema=string; description=Original search query
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SerialEntry`
- Type: `object`
- Description: Enhanced serial entry with per-serial attributes
- Required Fields: `["serial_number"]`
- Properties:
- `expiry_date`: schema=anyOf(string, null)
- `expiry_date_format`: schema=anyOf(component `DateFormatType`, null)
- `manufacturing_date`: schema=anyOf(string, null)
- `mfg_date_format`: schema=anyOf(component `DateFormatType`, null)
- `mrp`: schema=anyOf(number, null)
- `serial_number`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `Session`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["staff_name","staff_user","warehouse"]`
- Properties:
- `barcode`: schema=anyOf(string, null)
- `closed_at`: schema=anyOf(string, null)
- `completed_at`: schema=anyOf(string, null)
- `config_version_id`: schema=anyOf(string, null)
- `damage_items`: schema=integer; default=0
- `finalization_status`: schema=anyOf(string, null)
- `finalized_at`: schema=anyOf(string, null)
- `finalized_by`: schema=anyOf(string, null)
- `id`: schema=string
- `last_heartbeat`: schema=anyOf(string, null)
- `location_id`: schema=anyOf(string, null)
- `location_key`: schema=anyOf(string, null)
- `location_name`: schema=anyOf(string, null)
- `location_type`: schema=anyOf(string, null)
- `notes`: schema=anyOf(string, null)
- `pending_items`: schema=integer; default=0
- `rack_no`: schema=anyOf(string, null)
- `reconciled_at`: schema=anyOf(string, null)
- `snapshot_hash`: schema=anyOf(string, null)
- `snapshot_items_ref`: schema=anyOf(string, null)
- `staff_name`: required; schema=string
- `staff_user`: required; schema=string
- `started_at`: schema=string; format="date-time"
- `status`: schema=string; default="OPEN"
- `total_items`: schema=integer; default=0
- `total_variance`: schema=number; default=0
- `type`: schema=string; default="STANDARD"
- `verified_items`: schema=integer; default=0
- `warehouse`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SessionCreate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["warehouse"]`
- Properties:
- `location_name`: schema=anyOf(string, null)
- `location_type`: schema=anyOf(string, null)
- `rack_no`: schema=anyOf(string, null)
- `type`: schema=anyOf(string, null); default="STANDARD"
- `warehouse`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SessionDetail`
- Type: `object`
- Description: Detailed session information
- Required Fields: `["id","last_heartbeat","started_at","status","user_id"]`
- Properties:
- `completed_at`: schema=anyOf(number, null)
- `finalization_status`: schema=anyOf(string, null)
- `finalized_at`: schema=anyOf(number, null)
- `finalized_by`: schema=anyOf(string, null)
- `floor`: schema=anyOf(string, null)
- `id`: required; schema=string
- `item_count`: schema=integer; default=0
- `last_heartbeat`: required; schema=number
- `location_name`: schema=anyOf(string, null)
- `location_type`: schema=anyOf(string, null)
- `rack_id`: schema=anyOf(string, null)
- `staff_name`: schema=anyOf(string, null)
- `started_at`: required; schema=number
- `status`: required; schema=string
- `total_items`: schema=integer; default=0
- `total_variance`: schema=number; default=0.0
- `user_id`: required; schema=string
- `verified_count`: schema=integer; default=0
- `warehouse`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SessionFinalizeRequest`
- Type: `object`
- Description: Optional metadata supplied when finalizing a session.
- Required Fields: `[]`
- Properties:
- `note`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SessionIntegrityResponse`
- Type: `object`
- Description: Session integrity check response (FR-M-34)
- Required Fields: `["affected_items","message","session_start","updates_detected","valid"]`
- Properties:
- `affected_items`: required; schema=integer
- `last_sync`: schema=anyOf(number, null)
- `message`: required; schema=string
- `session_start`: required; schema=number
- `updates_detected`: required; schema=boolean
- `valid`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SessionResponse`
- Type: `object`
- Description: Session response model
- Required Fields: `["created_at","created_by","id","name","status","type","warehouse"]`
- Properties:
- `created_at`: required; schema=string; format="date-time"
- `created_by`: required; schema=string
- `id`: required; schema=string
- `name`: required; schema=string
- `status`: required; schema=string
- `type`: required; schema=string
- `updated_at`: schema=anyOf(string, null)
- `warehouse`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SessionStats`
- Type: `object`
- Description: Session statistics
- Required Fields: `["damage_items","duration_seconds","id","items_per_minute","pending_items","total_items","verified_items"]`
- Properties:
- `completion_percent`: schema=number; default=0.0
- `damage_items`: required; schema=integer
- `duration_seconds`: required; schema=number
- `estimated_time_remaining`: schema=number; default=0.0
- `id`: required; schema=string
- `items_per_minute`: required; schema=number
- `pending_items`: required; schema=integer
- `remaining_items`: schema=integer; default=0
- `scanned_items`: schema=integer; default=0
- `total_items`: required; schema=integer
- `verified_items`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SuggestionsResponse`
- Type: `object`
- Description: Autocomplete suggestions response
- Required Fields: `["query","suggestions"]`
- Properties:
- `query`: required; schema=string
- `suggestions`: required; schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyncConflict`
- Type: `object`
- Description: Sync conflict details
- Required Fields: `["client_record_id","conflict_type","message"]`
- Properties:
- `client_record_id`: required; schema=string
- `conflict_type`: required; schema=string
- `details`: schema=object properties=[] required=[]
- `message`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyncError`
- Type: `object`
- Description: Sync error details
- Required Fields: `["client_record_id","error_type","message"]`
- Properties:
- `client_record_id`: required; schema=string
- `error_type`: required; schema=string
- `message`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyncRecord`
- Type: `object`
- Description: Single record to sync
- Required Fields: `["client_record_id","created_at","floor_id","item_code","location_id","rack_id","session_id","updated_at","verified_qty"]`
- Properties:
- `category`: schema=anyOf(string, null); description=Category
- `client_record_id`: required; schema=string; description=Unique client-side record ID
- `created_at`: required; schema=string; description=Client creation timestamp
- `damaged_qty`: schema=number; default=0; description=Damage quantity
- `evidence_photos`: schema=array of string; description=Photo URLs
- `floor`: schema=anyOf(string, null); description=Floor
- `floor_id`: required; schema=string; description=Floor ID
- `item_code`: required; schema=string; description=Item code
- `item_condition`: schema=anyOf(string, null); description=Item condition
- `location_id`: required; schema=string; description=Location ID
- `mfg_date`: schema=anyOf(string, null); description=Manufacturing date
- `mrp`: schema=anyOf(number, null); description=MRP
- `rack_id`: required; schema=string; description=Rack ID
- `serial_numbers`: schema=array of string; description=Serial numbers
- `session_id`: required; schema=string; description=Session ID
- `status`: schema=string; default="finalized"; description=Record status (partial/finalized)
- `subcategory`: schema=anyOf(string, null); description=Subcategory
- `uom`: schema=anyOf(string, null); description=Unit of measure
- `updated_at`: required; schema=string; description=Client update timestamp
- `verified_qty`: required; schema=number; description=Verified quantity
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyncResult`
- Type: `object`
- Description: Per-record sync result for backward compatibility
- Required Fields: `["id","success"]`
- Properties:
- `id`: required; schema=string; description=Client record identifier
- `message`: schema=anyOf(string, null); description=Optional error or conflict message for the record
- `success`: required; schema=boolean; description=Whether the record synced successfully
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyntheticCleanupRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["test_run_id"]`
- Properties:
- `barcodes`: schema=array of string
- `count_line_ids`: schema=array of string
- `item_codes`: schema=array of string
- `session_ids`: schema=array of string
- `test_run_id`: required; schema=string; minLength=8; maxLength=120; pattern="^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$"
- `warehouse_fragments`: schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyntheticErpItemPatchRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["test_run_id"]`
- Properties:
- `category`: schema=anyOf(string, null)
- `floor`: schema=anyOf(string, null)
- `item_name`: schema=anyOf(string, null)
- `manual_barcode`: schema=anyOf(string, null)
- `mrp`: schema=anyOf(number, null)
- `rack`: schema=anyOf(string, null)
- `sales_price`: schema=anyOf(number, null)
- `stock_qty`: schema=anyOf(number, null)
- `subcategory`: schema=anyOf(string, null)
- `test_run_id`: required; schema=string; minLength=8; maxLength=120; pattern="^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$"
- `warehouse`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyntheticErpItemRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["barcode","item_code","item_name","stock_qty","test_run_id"]`
- Properties:
- `barcode`: required; schema=string; pattern="^(51|52|53)\\d{4}$"
- `category`: schema=string; default="E2E"
- `floor`: schema=string; default="E2E-F1"
- `item_code`: required; schema=string
- `item_name`: required; schema=string
- `manual_barcode`: schema=anyOf(string, null)
- `mrp`: schema=number; default=1.0
- `rack`: schema=string; default="E2E-R1"
- `sales_price`: schema=anyOf(number, null)
- `stock_qty`: required; schema=number
- `subcategory`: schema=string; default="Business"
- `test_run_id`: required; schema=string; minLength=8; maxLength=120; pattern="^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$"
- `uom_name`: schema=string; default="PCS"
- `warehouse`: schema=string; default="e2e-main"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyntheticInspectRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["test_run_id"]`
- Properties:
- `barcodes`: schema=array of string
- `count_line_ids`: schema=array of string
- `item_codes`: schema=array of string
- `max_records`: schema=integer; minimum=1.0; maximum=200.0; default=25
- `session_ids`: schema=array of string
- `test_run_id`: required; schema=string; minLength=8; maxLength=120; pattern="^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$"
- `warehouse_fragments`: schema=array of string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SyntheticVarianceRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["item_code","item_name","system_qty","test_run_id","verified_qty"]`
- Properties:
- `category`: schema=string; default="E2E"
- `count_line_id`: schema=anyOf(string, null)
- `floor`: schema=string; default="E2E-F1"
- `item_code`: required; schema=string
- `item_name`: required; schema=string
- `rack`: schema=string; default="E2E-R1"
- `session_id`: schema=string; default="e2e-session"
- `subcategory`: schema=string; default="Business"
- `system_qty`: required; schema=number
- `test_run_id`: required; schema=string; minLength=8; maxLength=120; pattern="^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$"
- `variance`: schema=anyOf(number, null)
- `verified_at`: schema=anyOf(string, null)
- `verified_by`: schema=string; default="supervisor"
- `verified_qty`: required; schema=number
- `warehouse`: schema=string; default="e2e-main"
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SystemParameters`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `api_rate_limit`: schema=integer; minimum=10.0; maximum=10000.0; default=100; description=API rate limit per minute
- `api_timeout`: schema=integer; minimum=5.0; maximum=300.0; default=30; description=API request timeout in seconds
- `auto_sync_enabled`: schema=boolean; default=true; description=Enable automatic sync
- `cache_enabled`: schema=boolean; default=true; description=Enable caching
- `cache_max_size`: schema=integer; minimum=100.0; maximum=10000.0; default=1000; description=Maximum cache entries
- `cache_ttl`: schema=integer; minimum=60.0; maximum=86400.0; default=3600; description=Cache TTL in seconds
- `enable_audit_log`: schema=boolean; default=true; description=Enable audit logging
- `enable_compression`: schema=boolean; default=true; description=Enable response compression
- `enable_cors`: schema=boolean; default=true; description=Enable CORS
- `jwt_expiration`: schema=integer; minimum=3600.0; maximum=604800.0; default=86400; description=JWT expiration in seconds
- `log_level`: schema=string; pattern="^(DEBUG|INFO|WARN|ERROR)$"; default="INFO"; description=Log level
- `log_retention_days`: schema=integer; minimum=1.0; maximum=365.0; default=30; description=Log retention in days
- `max_concurrent_sessions`: schema=integer; minimum=10.0; maximum=500.0; default=50; description=Maximum concurrent sessions
- `max_request_size`: schema=integer; minimum=1048576.0; maximum=104857600.0; default=10485760; description=Max request size in bytes
- `mongo_pool_size`: schema=integer; minimum=1.0; maximum=100.0; default=10; description=MongoDB connection pool size
- `password_min_length`: schema=integer; minimum=6.0; maximum=32.0; default=8; description=Minimum password length
- `password_require_lowercase`: schema=boolean; default=true; description=Require lowercase in password
- `password_require_numbers`: schema=boolean; default=true; description=Require numbers in password
- `password_require_uppercase`: schema=boolean; default=true; description=Require uppercase in password
- `query_timeout`: schema=integer; minimum=5.0; maximum=300.0; default=30; description=Database query timeout in seconds
- `session_timeout`: schema=integer; minimum=300.0; maximum=86400.0; default=3600; description=Session timeout in seconds
- `sql_pool_size`: schema=integer; minimum=1.0; maximum=20.0; default=5; description=SQL Server connection pool size
- `sync_batch_size`: schema=integer; minimum=10.0; maximum=1000.0; default=100; description=Sync batch size
- `sync_interval`: schema=integer; minimum=60.0; maximum=86400.0; default=3600; description=ERP sync interval in seconds
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `SystemStatusResponse`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["api_health","avg_response_time_ms","cpu_usage_percent","error_rate_percent","memory_usage_mb","mongodb_status","sqlserver_status","timestamp","uptime_seconds"]`
- Properties:
- `api_health`: required; schema=string
- `avg_response_time_ms`: required; schema=number
- `cpu_usage_percent`: required; schema=number
- `error_rate_percent`: required; schema=number
- `memory_usage_mb`: required; schema=number
- `mongodb_status`: required; schema=string
- `sqlserver_status`: required; schema=string
- `timestamp`: required; schema=string
- `uptime_seconds`: required; schema=integer
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `TokenResponse`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["access_token","expires_in","refresh_token","user"]`
- Properties:
- `access_token`: required; schema=string
- `expires_in`: required; schema=integer
- `refresh_token`: required; schema=string
- `token_type`: schema=string; default="bearer"
- `user`: required; schema=component `UserInfo`
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UnknownItemReportRequest`
- Type: `object`
- Description: Report an unknown barcode/item encountered during counting.

Keep this schema flexible: clients may attach extra metadata which we persist.
- Required Fields: `["floor_id","location_id","rack_id","session_id"]`
- Properties:
- `barcode`: schema=anyOf(string, null)
- `counted_qty`: schema=anyOf(number, null)
- `floor_id`: required; schema=string
- `floor_no`: schema=anyOf(string, null)
- `location_id`: required; schema=string
- `notes`: schema=anyOf(string, null)
- `rack_id`: required; schema=string
- `rack_no`: schema=anyOf(string, null)
- `session_id`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UnlockAccountRequest`
- Type: `object`
- Description: Account unlock request
- Required Fields: `["username"]`
- Properties:
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UpdateUserRequest`
- Type: `object`
- Description: Request to update a user
- Required Fields: `[]`
- Properties:
- `disabled_permissions`: schema=anyOf(array of string, null)
- `email`: schema=anyOf(string, null)
- `full_name`: schema=anyOf(string, null)
- `is_active`: schema=anyOf(boolean, null)
- `password`: schema=anyOf(string, null)
- `permissions`: schema=anyOf(array of string, null)
- `pin`: schema=anyOf(string, null)
- `role`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserDetailResponse`
- Type: `object`
- Description: Detailed user response
- Required Fields: `["id","username"]`
- Properties:
- `created_at`: schema=anyOf(string, null)
- `custom_permissions`: schema=array of string; default=[]
- `disabled_permissions`: schema=array of string; default=[]
- `email`: schema=anyOf(string, null)
- `full_name`: schema=anyOf(string, null)
- `has_pin`: schema=boolean; default=false
- `id`: required; schema=string
- `is_active`: schema=boolean; default=true
- `last_login`: schema=anyOf(string, null)
- `permissions`: schema=array of string; default=[]
- `role`: schema=string; default="staff"
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserInfo`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["full_name","id","role","username"]`
- Properties:
- `email`: schema=anyOf(string, null)
- `employee_id`: schema=anyOf(string, null)
- `full_name`: required; schema=string
- `has_pin`: schema=boolean; default=false
- `id`: required; schema=string
- `is_active`: schema=boolean; default=true
- `permissions`: schema=array of string
- `phone`: schema=anyOf(string, null)
- `role`: required; schema=string
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserListItem`
- Type: `object`
- Description: User item in list response
- Required Fields: `["id","username"]`
- Properties:
- `created_at`: schema=anyOf(string, null)
- `email`: schema=anyOf(string, null)
- `full_name`: schema=anyOf(string, null)
- `id`: required; schema=string
- `is_active`: schema=boolean; default=true
- `last_login`: schema=anyOf(string, null)
- `permissions_count`: schema=integer; default=0
- `role`: schema=string; default="staff"
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserListResponse`
- Type: `object`
- Description: Paginated user list response
- Required Fields: `["page","page_size","total","total_pages","users"]`
- Properties:
- `page`: required; schema=integer
- `page_size`: required; schema=integer
- `total`: required; schema=integer
- `total_pages`: required; schema=integer
- `users`: required; schema=array of component `UserListItem`
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserLogin`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["password","username"]`
- Properties:
- `password`: required; schema=string
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserPreferencesInDB`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["user_id"]`
- Properties:
- `_id`: schema=anyOf(string, null)
- `enable_haptic_feedback`: schema=boolean; default=true
- `enable_sound_effects`: schema=boolean; default=true
- `font_scale`: schema=number; default=1.0
- `primary_color`: schema=string; default="#007AFF"
- `theme`: schema=string; default="system"
- `user_id`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserPreferencesUpdate`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Properties:
- `enable_haptic_feedback`: schema=anyOf(boolean, null)
- `enable_sound_effects`: schema=anyOf(boolean, null)
- `font_scale`: schema=anyOf(number, null)
- `primary_color`: schema=anyOf(string, null)
- `theme`: schema=anyOf(string, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserRegister`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["full_name","password","username"]`
- Properties:
- `employee_id`: schema=anyOf(string, null)
- `full_name`: required; schema=string
- `password`: required; schema=string
- `phone`: schema=anyOf(string, null)
- `role`: schema=string; default="staff"
- `username`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserSettings`
- Type: `object`
- Description: User settings stored in MongoDB user_settings documents.
- Required Fields: `[]`
- Properties:
- `auto_sync_enabled`: schema=boolean; default=true; description=Automatically sync data in the background
- `auto_sync_interval`: schema=integer; minimum=5.0; maximum=120.0; default=15; description=Background sync interval in minutes
- `backup_frequency`: schema=string; default="weekly"; description=Preferred backup reminder cadence
- `biometric_auth`: schema=boolean; default=false; description=Allow biometric login when available
- `cache_expiration`: schema=integer; minimum=1.0; maximum=168.0; default=24; description=Cache expiration in hours
- `column_visibility`: schema=component `ColumnVisibilitySettings`; description=Visibility for optional inventory detail fields
- `debounce_delay`: schema=integer; minimum=0.0; maximum=2000.0; default=300; description=Default debounce delay in milliseconds
- `export_format`: schema=string; default="csv"; description=Default export file format
- `font_size`: schema=integer; minimum=12.0; maximum=22.0; default=16; description=Preferred base font size in points
- `font_style`: schema=string; default="system"; description=Preferred font family style
- `image_cache`: schema=boolean; default=true; description=Cache item and evidence images locally
- `lazy_loading`: schema=boolean; default=true; description=Enable lazy loading for large lists
- `max_queue_size`: schema=integer; minimum=100.0; maximum=10000.0; default=1000; description=Maximum queued offline actions
- `notification_approval_alerts`: schema=boolean; default=true; description=Show supervisor approval and rejection alerts
- `notification_badge`: schema=boolean; default=true; description=Show notification badges
- `notification_recount_alerts`: schema=boolean; default=true; description=Show recount assignment and recount result alerts
- `notification_session_reminder_alerts`: schema=boolean; default=true; description=Show long-running session reminder alerts
- `notification_sound`: schema=boolean; default=true; description=Play notification sounds
- `notification_sync_failure_alerts`: schema=boolean; default=true; description=Show offline sync failure alerts
- `notifications_enabled`: schema=boolean; default=true; description=Enable in-app notifications
- `offline_mode`: schema=boolean; default=false; description=Prefer offline-first app behavior
- `operational_mode`: schema=string; default="routine"; description=Preferred app operating mode
- `require_auth`: schema=boolean; default=true; description=Require authentication when reopening the app
- `scanner_auto_submit`: schema=boolean; default=true; description=Auto-submit scanner results when possible
- `scanner_sound`: schema=boolean; default=true; description=Enable sound feedback for scanner flows
- `scanner_timeout`: schema=integer; minimum=5.0; maximum=120.0; default=30; description=Scanner timeout in seconds
- `scanner_vibration`: schema=boolean; default=true; description=Enable vibration feedback for scanner flows
- `session_timeout`: schema=integer; minimum=5.0; maximum=240.0; default=30; description=Auto-lock timeout in minutes
- `show_item_images`: schema=boolean; default=true; description=Show item images in inventory views
- `show_item_prices`: schema=boolean; default=true; description=Show pricing information in inventory views
- `show_item_stock`: schema=boolean; default=true; description=Show stock values in inventory views
- `sync_on_reconnect`: schema=boolean; default=true; description=Retry sync automatically when connection returns
- `theme`: schema=string; default="light"; description=UI theme mode: light or dark
- `updated_at`: schema=anyOf(string, null); description=Timestamp of last settings update
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserSettingsResponse`
- Type: `object`
- Description: Response model for user settings endpoints.
- Required Fields: `["data"]`
- Properties:
- `data`: required; schema=component `UserSettings`; description=User settings
- `message`: schema=string; default=""; description=Human-readable message
- `status`: schema=string; default="success"; description=Response status
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserSettingsUpdate`
- Type: `object`
- Description: Partial update model for user settings.
- Required Fields: `[]`
- Properties:
- `auto_sync_enabled`: schema=anyOf(boolean, null); description=Automatically sync data in the background
- `auto_sync_interval`: schema=anyOf(integer, null); description=Background sync interval in minutes
- `backup_frequency`: schema=anyOf(string, null); description=Preferred backup reminder cadence
- `biometric_auth`: schema=anyOf(boolean, null); description=Allow biometric login when available
- `cache_expiration`: schema=anyOf(integer, null); description=Cache expiration in hours
- `column_visibility`: schema=anyOf(component `ColumnVisibilitySettingsUpdate`, null); description=Visibility for optional inventory detail fields
- `debounce_delay`: schema=anyOf(integer, null); description=Default debounce delay in milliseconds
- `export_format`: schema=anyOf(string, null); description=Default export file format
- `font_size`: schema=anyOf(integer, null); description=Preferred base font size in points
- `font_style`: schema=anyOf(string, null); description=Preferred font family style
- `image_cache`: schema=anyOf(boolean, null); description=Cache item and evidence images locally
- `lazy_loading`: schema=anyOf(boolean, null); description=Enable lazy loading for large lists
- `max_queue_size`: schema=anyOf(integer, null); description=Maximum queued offline actions
- `notification_approval_alerts`: schema=anyOf(boolean, null); description=Show supervisor approval and rejection alerts
- `notification_badge`: schema=anyOf(boolean, null); description=Show notification badges
- `notification_recount_alerts`: schema=anyOf(boolean, null); description=Show recount assignment and recount result alerts
- `notification_session_reminder_alerts`: schema=anyOf(boolean, null); description=Show long-running session reminder alerts
- `notification_sound`: schema=anyOf(boolean, null); description=Play notification sounds
- `notification_sync_failure_alerts`: schema=anyOf(boolean, null); description=Show offline sync failure alerts
- `notifications_enabled`: schema=anyOf(boolean, null); description=Enable in-app notifications
- `offline_mode`: schema=anyOf(boolean, null); description=Prefer offline-first app behavior
- `operational_mode`: schema=anyOf(string, null); description=Preferred app operating mode
- `require_auth`: schema=anyOf(boolean, null); description=Require authentication when reopening the app
- `scanner_auto_submit`: schema=anyOf(boolean, null); description=Auto-submit scanner results when possible
- `scanner_sound`: schema=anyOf(boolean, null); description=Enable sound feedback for scanner flows
- `scanner_timeout`: schema=anyOf(integer, null); description=Scanner timeout in seconds
- `scanner_vibration`: schema=anyOf(boolean, null); description=Enable vibration feedback for scanner flows
- `session_timeout`: schema=anyOf(integer, null); description=Auto-lock timeout in minutes
- `show_item_images`: schema=anyOf(boolean, null); description=Show item images in inventory views
- `show_item_prices`: schema=anyOf(boolean, null); description=Show pricing information in inventory views
- `show_item_stock`: schema=anyOf(boolean, null); description=Show stock values in inventory views
- `sync_on_reconnect`: schema=anyOf(boolean, null); description=Retry sync automatically when connection returns
- `theme`: schema=anyOf(string, null); description=UI theme mode: light or dark
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `UserWorkflowSummary`
- Type: `object`
- Description: Running workflow snapshot grouped by user.
- Required Fields: `["presence_status","username","workflow_stage"]`
- Properties:
- `active_session_id`: schema=anyOf(string, null)
- `assigned_recounts`: schema=integer; default=0
- `floor`: schema=anyOf(string, null)
- `full_name`: schema=anyOf(string, null)
- `items_counted`: schema=integer; default=0
- `last_activity`: schema=anyOf(string, null)
- `next_action`: schema=component `WorkflowNextAction`; default="NONE"
- `open_session_count`: schema=integer; default=0
- `pending_approvals`: schema=integer; default=0
- `pending_review_since`: schema=anyOf(string, null)
- `presence_status`: required; schema=component `WorkflowPresenceStatus`
- `priority_band`: schema=component `WorkflowPriorityBand`; default="LOW"
- `priority_score`: schema=integer; default=0
- `progress_percent`: schema=number; default=0.0
- `rack_id`: schema=anyOf(string, null)
- `recount_assigned_at`: schema=anyOf(string, null)
- `reviewed_items`: schema=integer; default=0
- `role`: schema=string; default="staff"
- `session_started_at`: schema=anyOf(string, null)
- `session_status`: schema=anyOf(component `CanonicalSessionStatus`, null)
- `session_type`: schema=anyOf(string, null)
- `total_items`: schema=integer; default=0
- `total_variance`: schema=number; default=0.0
- `username`: required; schema=string
- `warehouse`: schema=anyOf(string, null)
- `workflow_stage`: required; schema=component `WorkflowStage`
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `ValidationError`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["loc","msg","type"]`
- Properties:
- `ctx`: schema=object properties=[] required=[]
- `input`: schema=UNDEFINED BEHAVIOR
- `loc`: required; schema=array of anyOf(string, integer)
- `msg`: required; schema=string
- `type`: required; schema=string
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `VerificationRequest`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["verified"]`
- Properties:
- `count_line_id`: schema=anyOf(string, null)
- `damaged_qty`: schema=anyOf(number, null); default=0.0
- `floor`: schema=anyOf(string, null)
- `is_serialized`: schema=anyOf(boolean, null)
- `item_condition`: schema=anyOf(string, null); default="Good"
- `non_returnable_damaged_qty`: schema=anyOf(number, null); default=0.0
- `notes`: schema=anyOf(string, null)
- `rack`: schema=anyOf(string, null)
- `serial_number`: schema=anyOf(string, null)
- `session_id`: schema=anyOf(string, null)
- `verified`: required; schema=boolean
- `verified_qty`: schema=anyOf(number, null)
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `WorkflowNextAction`
- Type: `string`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Enum Values: `["REVIEW_PENDING","HANDLE_RECOUNT","RESUME_PAUSED_SESSION","FOLLOW_UP_INACTIVE_SESSION","MONITOR_ACTIVE_COUNT","CLOSE_SESSION","NONE"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `WorkflowPresenceStatus`
- Type: `string`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Enum Values: `["ONLINE","IDLE","OFFLINE"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `WorkflowPriorityBand`
- Type: `string`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Enum Values: `["LOW","MEDIUM","HIGH","CRITICAL"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `WorkflowStage`
- Type: `string`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `[]`
- Enum Values: `["IDLE","COUNTING","PAUSED","RECONCILING","AWAITING_REVIEW","RECOUNT_QUEUE"]`
- Properties:
- UNDEFINED BEHAVIOR: component has no property metadata in OpenAPI.
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `backend__api__response_models__ApiResponse_dict_str__Any__`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(object properties=[] required=[], null); description=Response data
- `error`: schema=anyOf(object properties=[] required=[], null); description=Error details if success is false
- `message`: schema=anyOf(string, null); description=Human-readable message
- `payload_version`: schema=string; default="1.0"; description=API Payload Version
- `request_id`: schema=anyOf(string, null); description=Request ID for tracking
- `success`: required; schema=boolean; description=Whether the request was successful
- `timestamp`: schema=string; format="date-time"; description=Response timestamp
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

#### Schema `backend__api__schemas__ApiResponse_dict_str__Any__`
- Type: `object`
- Description: UNDEFINED BEHAVIOR: no OpenAPI schema description.
- Required Fields: `["success"]`
- Properties:
- `data`: schema=anyOf(object properties=[] required=[], null)
- `error`: schema=anyOf(object properties=[] required=[], null)
- `message`: schema=anyOf(string, null)
- `payload_version`: schema=string; default="1.0"
- `success`: required; schema=boolean
- Unresolved Risks: UNDEFINED BEHAVIOR: business validations outside OpenAPI must be documented at service level.

**Unresolved Risks**
- UNDEFINED BEHAVIOR: several APIs lack complete descriptions, errors, rate limits, and permission matrices.
- SECURITY RISK: test-support endpoints in test OpenAPI must not be exposed in production.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- The API catalog is structurally complete but not semantically complete. OpenAPI alone does not prove permission dependencies, database writes, transaction boundaries, audit events, or rate limits.
- Every mutation endpoint must define: owning service, allowed roles, idempotency key requirement, request version field, transaction boundary, audit event, rollback/recovery path, retry classification, and offline classification.
- Every read endpoint must define: consistency source, projection staleness behavior, pagination, filtering limits, permission scope, cache headers where applicable, and observability metric.
- Every API family with `UNDEFINED BEHAVIOR` fields must remain blocked for behavior-changing implementation until route code is inspected and this section is updated.
## 25. Database Schema Specifications

**Database Model**
- MongoDB is primary application store.
- SQL Server is read-only ERP and not part of Mongo collection catalog.
- Required V3 projections: items_snapshot, batch_records, serial_records, damage_logs, variance_logs, approvals, sync_queue, erp_snapshot, serial_registry.

#### Collection `activity_logs`
- Purpose: user activity records
- Indexes: `user:1, timestamp:-1` options `{"name":"idx_user_activity"}`; `action:1, timestamp:-1` options `{"name":"idx_action_time"}`; `status:1, timestamp:-1` options `{"name":"idx_status_activity"}`; `timestamp:-1` options `{"name":"idx_timestamp"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `api_metrics`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `approval_policies`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `approvals`
- Purpose: required approval projection
- Indexes: `approval_id:1` options `{"name":"idx_approvals_id","unique":true}`; `session_id:1, approved_at:-1` options `{"name":"idx_approvals_session_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: approval/projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `audit_logs`
- Purpose: structured audit records
- Indexes: `timestamp:-1` options `{"name":"idx_audit_timestamp"}`; `event_type:1, timestamp:-1` options `{"name":"idx_audit_event_time"}`; `actor_id:1, timestamp:-1` options `{"name":"idx_audit_actor_time"}`; `actor_username:1, timestamp:-1` options `{"name":"idx_audit_username_time"}`; `resource_id:1, timestamp:-1` options `{"name":"idx_audit_resource_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `audit_projection_fallbacks`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `auth_otps`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `auth_reset_tokens`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `batch_records`
- Purpose: required batch projection
- Indexes: `session_id:1, item_code:1, batch_id:1` options `{"name":"idx_batch_records_unique","unique":true}`; `item_code:1, updated_at:-1` options `{"name":"idx_batch_records_item_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `chat_history`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `config_version_history`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `config_versions`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `conflict_forks`
- Purpose: immutable conflict alternatives for approved/locked records
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: SyncConflictsService
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `count_line_drafts`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `count_lines`
- Purpose: transition-phase count line working collection governed by CountLineWriteService
- Indexes: `session_id:1, counted_at:-1` options `{"name":"idx_session_counts"}`; `item_code:1, session_id:1` options `{"name":"idx_item_session"}`; `verified:1, session_id:1` options `{"name":"idx_verified"}`; `rack_no:1, session_id:1` options `{"name":"idx_rack_counts"}`; `idempotency_key:1` options `{"name":"idx_count_line_idempotency","sparse":true,"unique":true}`; `semantic_hash:1` options `{"name":"idx_count_line_semantic_hash","sparse":true,"unique":true}`; `session_id:1, item_code:1, floor_no:1, rack_no:1` options `{"name":"idx_duplicate_detection"}`; `id:1` options `{"name":"idx_count_line_id","sparse":true}`; `item_code:1, serial_numbers:1` options `{"name":"idx_count_line_item_serial","sparse":true}`
- Relationships: references sessions, items, location context, serial registry, snapshots, approvals, and projections.
- Write Authority: CountLineWriteService only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `count_lines_archive`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `damage_logs`
- Purpose: required damage projection
- Indexes: `event_id:1` options `{"name":"idx_damage_event","unique":true}`; `session_id:1, timestamp:-1` options `{"name":"idx_damage_session_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `data_archive`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `dynamic_field_definitions`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `dynamic_field_values`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `enrichments`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `enterprise_audit_logs`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `erp_config`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `erp_items`
- Purpose: Mongo ERP item cache populated from read-only SQL Server
- Indexes: `item_code:1` options `{"name":"idx_item_code"}`; `barcode:1` options `{"name":"idx_barcode"}`; `autobarcode:1` options `{"name":"idx_autobarcode","sparse":true}`; `category:1, subcategory:1` options `{"name":"idx_category"}`; `warehouse:1, item_code:1` options `{"name":"idx_warehouse_item"}`; `stock_qty:1` options `{"name":"idx_stock"}`; `floor:1, rack:1` options `{"name":"idx_location"}`; `item_name:text, description:text` options `{"name":"idx_text_search"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: SQLSyncService, SQLVerificationService, and governed enrichment paths; SQL Server remains read-only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `erp_snapshot`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `session_id:1, item_code:1` options `{"name":"idx_erp_snapshot_session_item","unique":true}`; `updated_at:-1` options `{"name":"idx_erp_snapshot_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `erp_sync_metadata`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `error_logs`
- Purpose: application error records
- Indexes: `severity:1, timestamp:-1` options `{"name":"idx_severity"}`; `error_type:1, timestamp:-1` options `{"name":"idx_error_type"}`; `endpoint:1, timestamp:-1` options `{"name":"idx_endpoint"}`; `resolved:1, timestamp:-1` options `{"name":"idx_resolved"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `event_applied`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `event_id:1` options `{"name":"idx_event_applied_event_id","unique":true}`; `session_id:1, applied_at:-1` options `{"name":"idx_event_applied_session_time"}`; `item_id:1, applied_at:-1` options `{"name":"idx_event_applied_item_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `event_log`
- Purpose: append-only long-term stock verification source of truth
- Indexes: `aggregate_id:1, timestamp:1` options `{"name":"idx_event_aggregate_time"}`; `event_type:1, timestamp:-1` options `{"name":"idx_event_type_time"}`; `idempotency_key:1` options `{"name":"idx_event_idempotency","sparse":true,"unique":true}`; `metadata.idempotency_key:1` options `{"name":"idx_event_metadata_idempotency","sparse":true,"unique":true}`; `metadata.request_idempotency_key:1` options `{"name":"idx_event_request_idempotency"}`; `scan_fingerprint:1` options `{"name":"idx_event_scan_fingerprint","sparse":true,"unique":true}`; `payload.session_id:1, timestamp:-1` options `{"name":"idx_event_session_time"}`
- Relationships: feeds required projections and event_applied tracking.
- Write Authority: EventService append-only
- Retention Policy: long-term source of truth; archival/deletion policy not defined.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `export_results`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `export_schedules`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `feature_flags`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `financial_projection`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `generated_reports`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `governance_events`
- Purpose: governance and invariant audit events
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `idempotency_operations`
- Purpose: write idempotency ledger
- Indexes: `operation_id:1` options `{"name":"idx_operation_id","unique":true}`; `created_at:1` options `{"expireAfterSeconds":2592000,"name":"idx_operation_ttl"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: sync/write services
- Retention Policy: TTL index expires after 2,592,000 seconds (30 days).
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `item_serials`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `item_id:1, serial_number:1` options `{"name":"idx_serial_item_unique","sparse":true,"unique":true}`; `serial_number:1` options `{"name":"idx_serial_lookup"}`; `item_code:1` options `{"name":"idx_serial_item"}`; `item_id:1` options `{"name":"idx_serial_item_id"}`; `session_id:1, created_at:-1` options `{"name":"idx_session_serials"}`; `rack_id:1` options `{"name":"idx_rack_serials"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `item_variances`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `items`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `items_snapshot`
- Purpose: required item projection
- Indexes: `session_id:1, item_code:1` options `{"name":"idx_items_snapshot_session_item","unique":true}`; `session_id:1, updated_at:-1` options `{"name":"idx_items_snapshot_session_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `locks`
- Purpose: Mongo-backed distributed locks
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: LockService
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `login_attempts`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `manual_items`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `metrics`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `migrations`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `name`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `notification_devices`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `notifications`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `orphan_reconciliation_log`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `pin_authentication`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `products`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `barcode:1` options `{"name":"idx_product_barcode","unique":true}`; `last_updated:-1` options `{"name":"idx_product_updated"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `rack_registry`
- Purpose: rack claim and lock registry
- Indexes: `rack_id:1` options `{"name":"idx_rack_id","unique":true}`; `status:1, floor:1` options `{"name":"idx_available_racks"}`; `claimed_by:1, status:1` options `{"name":"idx_user_racks"}`; `lock_expires_at:1` options `{"name":"idx_lock_expiry","sparse":true}`; `session_id:1` options `{"name":"idx_rack_session","sparse":true}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: rack APIs and lock services
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `rate_limits`
- Purpose: rate limit buckets
- Indexes: `window_start:1` options `{"expireAfterSeconds":600,"name":"idx_rate_limit_ttl"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: TTL index expires after 600 seconds.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `recount_requests`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `refresh_tokens`
- Purpose: refresh token persistence and revocation
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `registered`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `report_compare_jobs`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `job_id:1` options `{"name":"idx_job_id","unique":true}`; `created_by:1, created_at:-1` options `{"name":"idx_user_jobs"}`; `status:1, created_at:-1` options `{"name":"idx_job_status"}`; `snapshot_a_id:1, snapshot_b_id:1` options `{"name":"idx_snapshots"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `report_files`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `report_snapshots`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `snapshot_id:1` options `{"name":"idx_snapshot_id","unique":true}`; `created_by:1, created_at:-1` options `{"name":"idx_user_snapshots"}`; `snapshot_type:1, created_at:-1` options `{"name":"idx_type_time"}`; `query_hash:1` options `{"name":"idx_query_hash","sparse":true}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `report_templates`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `security_events`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `serial_reconciliations`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `serial_records`
- Purpose: required serial projection
- Indexes: `item_id:1, serial_no:1` options `{"name":"idx_serial_records_item_serial","sparse":true,"unique":true}`; `serial_no:1` options `{"name":"idx_serial_records_serial_lookup"}`; `session_id:1, item_code:1, batch_id:1, serial_no:1` options `{"name":"idx_serial_records_composite","unique":true}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `serial_registry`
- Purpose: required item-scoped serial registry
- Indexes: `item_id:1, serial_no:1` options `{"name":"idx_serial_registry_item_serial","sparse":true,"unique":true}`; `serial_no:1` options `{"name":"idx_serial_registry_serial_lookup"}`; `item_code:1, updated_at:-1` options `{"name":"idx_serial_registry_item_time"}`; `item_id:1, updated_at:-1` options `{"name":"idx_serial_registry_item_id_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: projection/validation services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `session_dashboard_projection`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `session_items`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `session_snapshots`
- Purpose: immutable session-start baseline
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: SessionLifecycleService.record_session_snapshot only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `sessions`
- Purpose: canonical session lifecycle collection
- Indexes: `session_id:1` options `{"name":"idx_session","unique":true}`; `id:1` options `{"name":"idx_session_id_field","sparse":true,"unique":true}`; `created_by:1, created_at:-1` options `{"name":"idx_user_time"}`; `staff_user:1, status:1, warehouse:1` options `{"name":"idx_staff_active"}`; `status:1, created_at:-1` options `{"name":"idx_status"}`; `warehouse:1, status:1` options `{"name":"idx_warehouse_status"}`; `location_key:1` options `{"name":"idx_sessions_active_location_key","partialFilterExpression":{"location_key":{"$exists":true,"$gt":""},"status":{"$in":["OPEN","ACTIVE","PAUSED","RECONCILE"]}},"unique":true}`
- Relationships: owns count lines, snapshots, approvals, variances, locks, and session projections.
- Write Authority: SessionLifecycleService only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `stock_snapshots`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `sync_conflicts`
- Purpose: offline/server conflict records
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: SyncConflictsService
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `sync_metadata`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `sync_queue`
- Purpose: required sync projection/queue
- Indexes: `queue_id:1` options `{"name":"idx_sync_queue_id","unique":true}`; `status:1, updated_at:-1` options `{"name":"idx_sync_queue_status_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: sync/projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `system_events`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `system_settings`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `unknown_items`
- Purpose: unknown item governance records
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UnknownItemService
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `unregistered`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `user_preferences`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `user_presence`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `user_settings`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `users`
- Purpose: application user accounts
- Indexes: `username:1` options `{"name":"idx_username_unique","unique":true}`; `phone_number:1` options `{"name":"idx_phone_unique","sparse":true,"unique":true}`; `pin_lookup_hash:1` options `{"name":"idx_pin_lookup","sparse":true}`; `is_active:1, username:1` options `{"name":"idx_active_users"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `validation_logs`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `variance_logs`
- Purpose: required variance projection
- Indexes: `event_id:1` options `{"name":"idx_variance_event","unique":true}`; `session_id:1, timestamp:-1` options `{"name":"idx_variance_session_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: projection services only
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `variance_summary_projection`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `variance_threshold_configs`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `variances`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `verification_conflicts`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `verification_logs`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `verification_records`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: `client_record_id:1` options `{"name":"idx_client_record_id","unique":true}`; `session_id:1, created_at:-1` options `{"name":"idx_session_timeline"}`; `rack_id:1, floor:1` options `{"name":"idx_rack_floor"}`; `item_code:1, sync_status:1` options `{"name":"idx_item_sync"}`; `sync_status:1, updated_at:-1` options `{"name":"idx_sync_monitoring"}`; `serial_numbers:1` options `{"name":"idx_serial_numbers","sparse":true}`; `status:1, created_at:-1` options `{"name":"idx_status_time"}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `verification_sessions`
- Purpose: legacy/mirror session collection
- Indexes: `session_id:1` options `{"name":"idx_session_id","unique":true}`; `user_id:1, status:1` options `{"name":"idx_user_sessions"}`; `rack_id:1, status:1` options `{"name":"idx_rack_sessions"}`; `status:1, last_heartbeat:-1` options `{"name":"idx_active_sessions"}`; `floor:1, status:1` options `{"name":"idx_floor_sessions"}`; `completed_at:-1` options `{"name":"idx_completed","sparse":true}`
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: SessionLifecycleService mirror plus legacy paths; ARCHITECTURAL CONFLICT if direct writes remain
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: DATA INTEGRITY RISK: direct or conflicting writes can corrupt stock truth, session state, serial uniqueness, ERP cache, or conflict audit trail.

#### Collection `verified_items_projection`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

#### Collection `warehouses`
- Purpose: UNDEFINED BEHAVIOR: purpose not explicitly documented in inspected sources.
- Indexes: UNDEFINED BEHAVIOR: no index definition found in `backend/db/indexes.py`.
- Relationships: UNDEFINED BEHAVIOR: explicit relationship schema is not documented.
- Write Authority: UNDEFINED BEHAVIOR: write authority not explicitly documented; architecture review required before mutation.
- Retention Policy: UNDEFINED BEHAVIOR: retention policy is not documented.
- Conflict Risks: UNDEFINED BEHAVIOR: collection-specific concurrency/conflict model must be verified before writes.

**Unresolved Risks**
- REQUIRED INPUT: JSON schema validation, field retention, PII classification, and owners are incomplete.
- DATA INTEGRITY RISK: collections without indexes may have duplicate/performance risks.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Index definitions are not schema definitions. Each collection still needs JSON schema or equivalent validation, field ownership, PII classification, retention, migration path, and allowed writer list.
- Projection collections must state source event/write, rebuild strategy, lag metric, drift detector, and reconciliation owner.
- Collections marked `UNDEFINED BEHAVIOR` for write authority must be treated as read-only for new work until an owner is assigned.
## 26. Collection-Level Governance

**Rules**
- Collections with explicit write authority in Section 25 must not be mutated outside owning services.
- UNDEFINED BEHAVIOR collections require architecture review before writes.
- Business deletes are forbidden unless archived/governed.
- Projection rebuilds require dry-run, approval log, confirmation, and verification.
- Serial uniqueness remains item-scoped.

**Unresolved Risks**
- REQUIRED INPUT: collection owner/reviewer matrix incomplete.
- DATA INTEGRITY RISK: legacy collections may still be active without governance.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Collection governance must include create, update, delete, archive, repair, export, and retention authorities separately.
- Direct deletes of stock/session/serial/batch/audit data are forbidden unless a documented archive/compensating event path exists.
- Collection-level concurrency must name unique indexes, OCC fields, locks, and idempotency keys, not only service owners.
## 27. Feature Flags

**Backend Flags**
- V3_EVENT_SHADOW_WRITE, V3_EVENT_ENFORCE_WRITES, V3_PROJECTION_SHADOW, V3_PROJECTION_READS, V3_ENFORCE_LOCATION_SESSION_LOCK, V3_ENFORCE_GLOBAL_SERIALS, V3_ENFORCE_BACKEND_UOM, PROJECTION_WRITE_LOCK_ENABLED.
**Frontend Flags**
- Supervisor activityLogs/offlineQueue/syncConflicts/variances true; hard-disabled supervisor segments db-mapping/error-logs/export/export-results/export-schedules/notes/watchtower; admin ai-assistant disabled.
**Unresolved Risks**
- DATA INTEGRITY RISK: event/projection flags can create split truth if toggled without migration.
- REQUIRED INPUT: complete flag registry and environment defaults missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Every feature flag needs owner, purpose, default per environment, rollout criteria, rollback criteria, data migration dependency, metric, and alert.
- Flags that change event/projection enforcement, serial uniqueness, UOM rules, session locks, auth, or SQL behavior are high-risk and require change approval.
- Removed or stale flags must be retired with tests so disabled code paths do not preserve dead governance bypasses.
## 28. Control Plane

**Control Surfaces**
- Admin dashboard/users/permissions/SQL config/unknown items/security/logs/settings/realtime.
- Supervisor dashboard/sessions/session detail/variances/sync conflicts/offline queue/activity logs/user workflows/items.
- Dangerous controls require server permissions, audit, impact preview, and human checkpoint where persistent data changes.
**Unresolved Risks**
- SECURITY RISK: admin exposure outside LAN needs strong control.
- REQUIRED INPUT: production-enabled controls versus CLI-only controls not defined.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Control-plane actions must be classified as read-only, reversible local mutation, persistent data mutation, security mutation, or external/deployment mutation.
- Persistent/security/external actions require impact preview, permission check, audit event, rollback plan, and human checkpoint where repo rules require it.
- Admin UI must display environment, current user role, action scope, affected collection/service, dry-run availability, and last successful verification for risky actions.
## 29. Retry Policies

**Policies**
- Frontend reconnect delay 2000 ms; sync interval min 5 min; manual threshold 5; batch size 50.
- Sync circuit breaker threshold 5 failures, 3 successes, 30 s timeout, half-open max 2.
- GET retry transient failures; count/sync retry same idempotency; auth respects lockout; transitions refresh version.
**Unresolved Risks**
- REQUIRED INPUT: global jitter, retry budget, and max duration missing.
- SCALABILITY RISK: reconnect storms possible without jitter.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Retry policy must distinguish user retry, automatic retry, background retry, operator retry, and prohibited retry.
- Automatic retries require idempotency, backoff with jitter, max attempts, max age, and circuit-breaker behavior.
- Retrying stale session transitions, approvals, conflicts, admin config changes, and exports without refreshed version state is a DATA INTEGRITY RISK.
## 30. Idempotency Design

**Idempotency**
- Sync client_record_id, count idempotency_key and semantic_hash, event idempotency/scan_fingerprint, frontend queue derived keys.
- Reuse same key for retries; never generate new key for same logical write.
**Unresolved Risks**
- DATA INTEGRITY RISK: 30-day idempotency TTL may be too short for late offline devices.
- UNDEFINED BEHAVIOR: many non-count mutations lack idempotency contracts.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Idempotency scope must be defined per operation: user, device, session, item, location, record, or global.
- Idempotency storage TTL must exceed the longest supported offline queue age and operational replay window. Current 30-day ledger TTL needs business approval.
- Idempotency collisions must return existing result or explicit conflict, never create a second business write.
## 31. Cache Strategy

**Cache**
- Frontend AsyncStorage caches items/sessions/count_lines/user/last_sync.
- Backend Mongo erp_items caches SQL; projections cache dashboards/reports; Redis caches transient lock/rate/pubsub state.
- Session snapshot freezes baseline and must not be overwritten by later ERP sync.
**Unresolved Risks**
- REQUIRED INPUT: cache TTLs incomplete.
- DATA INTEGRITY RISK: stale ERP cache must be visible and monitored.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Cache strategy must state owner, TTL, invalidation trigger, stale-read UI, refresh trigger, conflict trigger, and whether cache contents are sensitive.
- Session snapshots are immutable baselines and must not be invalidated like normal cache.
- Frontend item cache search must not become authoritative for stock decisions; server validation remains final.
## 32. Sync Queue Design

**Queue Design**
- pending -> syncing -> removed on success; pending_retry for transient/auth; blocked_conflict for conflict/duplicate; failed_manual_review after threshold.
- Backend rejects empty records and legacy operations; validates records, rate limits, and uses circuit breaker.
**Unresolved Risks**
- SECURITY RISK: queue encryption undefined.
- DATA INTEGRITY RISK: session/unknown item offline semantics require stricter definition.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Sync queue must preserve original payload, normalized payload, validation errors, retry count, last attempt, next attempt, status reason, and server response reference.
- Queue pruning must be user-visible and auditable if it can drop unsynced business data.
- Unsupported queue types must not be silently marked manual review without enough diagnostic payload for recovery.
## 33. Error Handling Standards

**Standards**
- Contract UOM errors FRACTION_NOT_ALLOWED and PRECISION_EXCEEDED.
- Auth errors distinguish expired/invalid/inactive.
- Legacy sync operations HTTP 410.
- UI shows inline validation, sanitized API errors, auth route-to-login, conflict/manual-review states.
**Unresolved Risks**
- UNDEFINED BEHAVIOR: global error envelope inconsistent across ApiResponse, FastAPI, and domain errors.
- SECURITY RISK: log-forging findings require audit.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Error contracts must define code, message, user-safe message, developer diagnostic id, retryable flag, field path, severity, and remediation action.
- Security-sensitive errors must not reveal secrets, token content, SQL details, stack traces, or internal collection names to unauthorized users.
- Frontend must map backend error codes to stable UI states and offline queue states.
## 34. Observability & Monitoring

**Monitoring**
- Track auth failures, count write latency/failures, queue length/age, sync conflicts, ERP sync age, projection lag, Redis lock failures, WebSocket stats, security scan status.
**Unresolved Risks**
- REQUIRED INPUT: metrics backend, dashboards, alert thresholds, on-call routing, log retention missing.
- SCALABILITY RISK: lag/queue failures can accumulate silently without alerts.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Monitoring must cover golden signals plus domain signals: latency, errors, traffic, saturation, queue age, projection lag, event/projection drift, ERP sync age, lock contention, conflict age, approval age, and security blocks.
- Alerts require thresholds, owner, severity, runbook, and false-positive handling. Missing thresholds are `REQUIRED INPUT`.
- Monitoring must include data-integrity canaries, not only infrastructure health.
## 35. Metrics & Telemetry

**Telemetry**
- Business: sessions/items/variances/approvals/recounts.
- Sync: queue records/conflicts/retries/circuit state.
- ERP: SQL latency/rows/schema drift/conflicts.
- Security: 401/403/rate/CORS/LAN/secrets.
- Performance: API/Mongo/projection/screen/scanner-to-save latency.
**Unresolved Risks**
- REQUIRED INPUT: metric names, units, labels, cardinality limits, retention, SLOs missing.
- SCALABILITY RISK: item/serial/session labels can be high-cardinality.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Telemetry labels must avoid unbounded cardinality. Item code, serial, barcode, session id, and user id require hashing, sampling, or exclusion policy.
- Business metrics must reconcile with durable collections so dashboards can be audited.
- Metrics carrying operational or personal data require retention and access policy.
## 36. Performance Constraints

**Constraints**
- Index file says optimized for 20 concurrent users.
- Frontend sync batch 50; SQL batch 500; GZip min 1000 bytes; dashboards need projections.
- Edge cases: large serial arrays, long offline queues, projection rebuilds, SQL full sync, WebSocket broadcast loops.
**Unresolved Risks**
- REQUIRED INPUT: target item/serial/session/device/concurrent counts missing.
- SCALABILITY RISK: scale beyond 20 users unverified.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Performance constraints must include max payload sizes, max serials per count, max offline queue, max report rows, max WebSocket clients, max SQL batch, and max projection lag.
- Large exports, serial arrays, and offline sync bursts require pagination/chunking and backpressure.
- Performance tests must use production-like item/serial/session volumes; synthetic small fixtures are insufficient.
## 37. Scalability Constraints

**Scaling**
- Mongo indexes exist for core queries; Redis required for distributed semantics; WebSocket state process-local; offline queues unbounded by enforcement.
- Multi-worker requires shared fanout/replay; multi-warehouse requires global location/session uniqueness.
**Unresolved Risks**
- SCALABILITY RISK: no load-test evidence.
- REQUIRED INPUT: worker count, Redis HA, Mongo sizing, SQL volume missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Scalability design must specify horizontal backend scaling, worker affinity, Redis HA, Mongo indexes/sharding strategy if needed, SQL sync parallelism, and mobile reconnect storm handling.
- WebSocket scaling is blocked until fanout, reconnect, and shared connection state are designed.
- Queue and projection throughput must be capacity-tested against target warehouse operations.
## 38. LAN-Only Enforcement

**LAN Enforcement**
- ENABLE_LAN_ENFORCEMENT middleware allows health/docs/openapi/metrics and private/loopback IPs, blocks public/invalid/missing IP with NETWORK_NOT_ALLOWED.
**Unresolved Risks**
- SECURITY RISK: trusted proxy header policy undefined.
- REQUIRED INPUT: production bypass path list requires approval.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- LAN enforcement must define trusted proxy behavior. If reverse proxy headers are trusted without a trusted proxy list, public clients can spoof private IPs.
- Bypass paths must be minimal and production-approved. Docs/OpenAPI exposure may itself be a security risk in production.
- LAN enforcement is not a replacement for authentication, authorization, TLS, or rate limiting.
## 39. Mobile Device Constraints

**Mobile Constraints**
- Scanner/camera/hardware keyboard, offline count, 44x44 targets, safe areas, text scaling, reduced motion, battery/network interruption tolerance.
- Local queue includes sensitive item/evidence/session data and device_id.
**Unresolved Risks**
- SECURITY RISK: MDM, encryption, wipe, photo storage policy missing.
- UNDEFINED BEHAVIOR: GPS privacy/handling not defined.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Mobile constraints must include scanner model support, camera permission denial, background app suspension, low storage, clock skew, battery saver, network flapping, and app upgrade during queued writes.
- Offline payload storage must define encryption, backup exclusion, wipe policy, and corruption recovery.
- Device clock timestamps must be treated as client metadata; server accepted time remains authoritative.
## 40. Barcode & Serial Handling

**Barcode/Serial**
- Barcode logic must use _normalize_barcode_input in backend/api/erp_api.py.
- Validation drift exists between ERP API, ValidationService, and frontend utilities.
- Serial uniqueness is item-scoped; global uniqueness forbidden.
- Serial statuses include Active, Damaged, Expired, Not Working, Lost, Transferred, Returned, Scrapped, Pending Verification, Duplicate Suspected.
**Unresolved Risks**
- ARCHITECTURAL CONFLICT: barcode format rules conflict.
- DATA INTEGRITY RISK: item_id versus item_code scoping must be verified.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Barcode rules must be centralized and versioned. Frontend permissive validation can only improve UX; backend normalization/validation is authoritative.
- Serial uniqueness must be enforced in validation, sync, UI precheck, indexes, projection rebuild, and conflict resolution. Each layer must preserve item scope.
- Bulk serial scans need duplicate-in-batch detection, duplicate-on-server detection, partial failure handling, and manual correction flow.
## 41. Batch Handling

**Batch**
- Batch fields include batch_id/number/code, mfg/expiry, MRP, condition, quantity state.
- batch_records unique key session_id + item_code + batch_id.
- Expiry before manufacture rejected; mismatch triggers review; MRP changes can trigger risk.
**Unresolved Risks**
- REQUIRED INPUT: categories requiring batch capture missing.
- DATA INTEGRITY RISK: batch identity naming must be normalized.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Batch handling must define required batch capture by item/category, batch identity source, allowed manual batch creation, and relationship to ERP batch data.
- Batch projection uniqueness must match business identity; if MRP/expiry/condition are part of identity, this must be explicitly documented.
- Offline batch conflicts require supervisor review when server batch metadata differs from cached metadata.
## 42. Risk Detection Rules

**Risk Rules**
- Flags: LARGE_VARIANCE, MRP_MISMATCH, MRP_REDUCED_SIGNIFICANTLY, HIGH_VALUE_VARIANCE, SERIAL_MISSING_HIGH_VALUE, MISSING_CORRECTION_REASON, MRP_CHANGE_WITHOUT_REASON, PHOTO_PROOF_REQUIRED, MISPLACED_ITEM, STRICT_MODE_VARIANCE.
**Unresolved Risks**
- REQUIRED INPUT: exact thresholds by category/value/risk missing.
- DATA INTEGRITY RISK: hardcoded thresholds violate config-driven design.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Risk rules must be versioned, configurable, testable, and persisted with each decision. A later threshold change must not rewrite historical risk meaning.
- Risk evaluation must state whether it is synchronous at count write, asynchronous projection, or both.
- Missing threshold configuration must fail closed or route to review; the chosen behavior is `REQUIRED INPUT` if not in source.
## 43. Supervisor Controls

**Supervisor**
- Dashboard, sessions, session detail, items, variances, sync conflicts, offline queue, activity logs, user workflows.
- Must show queue/conflict/variance counts, stale data, permission-limited actions, reasons, audit trail.
**Unresolved Risks**
- REQUIRED INPUT: override/force unlock/accept-local/finalize authority incomplete.
- SECURITY RISK: hidden routes do not equal backend denial.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Supervisor controls must define which actions are read-only, which mutate business data, which require second approval, and which are admin-only.
- Supervisor conflict/variance actions must show original count, current server state, snapshot baseline, risk flags, evidence, and audit history.
- Concurrent supervisors acting on the same item require lock/version conflict UI and server enforcement.
## 44. Admin Controls

**Admin**
- Dashboard, control panel, users, permissions, SQL config, unknown items, security, logs, settings, realtime, reports redirects.
- High-risk actions: users/permissions, SQL config, security settings, unknown item governance, logs/reports, repair/backfill/deploy if surfaced.
**Unresolved Risks**
- SECURITY RISK: admin exposure requires LAN/auth/rate/audit.
- REQUIRED INPUT: separation of duties not defined.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Admin controls must distinguish configuration management from data repair. Data repair is approval-gated and should not be a casual UI action.
- Security-sensitive admin changes require reauthentication or step-up confirmation if product requires it; current requirement is `REQUIRED INPUT`.
- Admin logs/reports must redact secrets and personal data by permission scope.
## 45. Migration Strategy

**Migration**
- Areas: event enforcement, session states, verification_sessions mirror, serial indexes, offline store, SQL interval.
- Must inspect, dry-run, scope, log approval, ask confirmation, execute, verify for data mutations.
**Unresolved Risks**
- DATA INTEGRITY RISK: event/projection backfills and index changes need approval.
- REQUIRED INPUT: ordering/cutover/rollback criteria missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Migration strategy must include inventory, dry-run, backup/archive, forward migration, backward migration, verification query, monitoring window, and abort criteria.
- Event/projection migrations must compare pre/post counts, hashes, sample documents, and dashboard consistency.
- Migrations touching stock truth, sessions, snapshots, serial indexes, or auth require human checkpoint.
## 46. Backward Compatibility

**Compatibility**
- Legacy sync operations HTTP 410; legacy session statuses mapped; verification_sessions mirror remains; WebSocket query token remains; PIN route docs drift.
**Unresolved Risks**
- REQUIRED INPUT: supported mobile app versions/deprecation schedule missing.
- SECURITY RISK: legacy query token and mirrors expand attack/drift surface.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Backward compatibility must identify supported client versions, deprecated endpoints, removal dates, server compatibility shims, and telemetry proving usage has stopped.
- Legacy compatibility must not preserve security weaknesses or governance bypasses indefinitely.
- Clients receiving HTTP 410 need documented upgrade and recovery behavior.
## 47. Testing Strategy

**Testing**
- Commands: make agent-ci, make python-test, make node-test, make ci, make lint, make format.
- Required: unit, service, API, frontend, E2E, security, load.
**Unresolved Risks**
- REQUIRED INPUT: coverage thresholds and release-blocking matrix missing.
- DATA INTEGRITY RISK: stock/sync/session/UOM changes require focused tests.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Testing strategy must require tests at the layer where logic lives. Frontend validator tests do not replace backend validation tests; backend service tests do not replace sync conflict E2E tests.
- Every architecture contradiction needs a regression test after resolution.
- Data repair and migration scripts require dry-run tests, approval-log tests, and post-run verification tests.
## 48. E2E Test Matrix

**E2E Matrix**
- Auth, staff online, staff offline, sync conflict, serial, batch, UOM, session, approval, ERP, realtime, admin.
**Unresolved Risks**
- REQUIRED INPUT: device/browser/scanner/network fixture matrix missing.
- SCALABILITY RISK: E2E does not replace load/chaos testing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- E2E matrix must include device offline duration, delayed sync, duplicate scan burst, concurrent supervisor decision, SQL outage, Redis outage, Mongo transient failure, app restart with queued writes, and app upgrade with queued writes.
- E2E scenarios must assert database/projection/audit outcomes, not only UI success messages.
- Scanner hardware paths and manual-entry fallback must both be tested.
## 49. Failure Recovery Strategy

**Recovery**
- Offline retry/manual review, reauth, lock TTL/force-release, conflict fork/recount, projection rebuild, SQL resync, WebSocket reconnect.
**Unresolved Risks**
- REQUIRED INPUT: runbooks incomplete.
- DATA INTEGRITY RISK: repair scripts are approval-gated.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Failure recovery must name owner and runbook for every class: auth, sync, conflict, lock, projection, SQL, report, export, WebSocket, mobile queue, and deployment.
- Recovery must preserve auditability and source-of-truth order. Manual database edits are not an acceptable recovery path without governed repair.
- User-visible recovery states must prevent duplicate business action during uncertainty.
## 50. Disaster Recovery

**DR**
- Backup/restore Mongo source/projections/auth/audit, SQL read-only availability, Redis transient impact, device queue recovery, secret rotation.
- Restore event_log/snapshots/count_lines before projections; rebuild only through approval-gated workflow.
**Unresolved Risks**
- REQUIRED INPUT: RTO/RPO/backup cadence/restore tests/encryption owner missing.
- DATA INTEGRITY RISK: untested projection rebuild can restore inconsistent dashboards.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- DR must prove restore order: Mongo durable truth, auth/users, event/count/session/snapshot data, projections, Redis transient state, frontend re-sync.
- DR tests must include projection rebuild from restored truth and serial uniqueness validation.
- RTO/RPO remain `REQUIRED INPUT`; without them backup frequency and restore automation cannot be production-grade.
## 51. Deployment Architecture

**Deployment**
- Makefile full stack/backend/frontend/CI/security/deploy; production compose requires .env.prod.
- No deployment/rollback/infra mutation without confirmation.
- Production requires explicit CORS, strong secrets, no debug/mock/default users, hardened containers.
**Unresolved Risks**
- SECURITY RISK: CodeAnt infra findings unresolved.
- REQUIRED INPUT: hosting/TLS/proxy/network/secret manager topology missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Deployment architecture must show environment separation, secrets injection, network policy, TLS/proxy path, container runtime restrictions, health checks, and rollback command.
- Blue/green or rolling deploy behavior must address in-flight sync batches, WebSocket disconnects, Redis locks, and migrations.
- Production deploy is approval-gated under repo rules.
## 52. DevOps Requirements

**DevOps**
- Use Makefile verification, approval log for high-impact actions, dry-run data changes, keep docs/OpenAPI synced, scan dependencies/secrets/infra.
- Observed Windows app.log rotation PermissionError during backend app import.
**Unresolved Risks**
- REQUIRED INPUT: environment bootstrap/secret injection/log rotation policy missing.
- SECURITY RISK: broad GitHub workflow permissions require review.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- DevOps requirements must include local environment parity, dependency pinning, reproducible builds, log rotation, secure secret management, database backup access, and emergency access controls.
- The observed `app.log` lock issue requires a logging runbook and test on Windows if Windows remains a supported operator environment.
- Operational scripts must default to dry-run when mutating data.
## 53. CI/CD Requirements

**CI/CD**
- Required gates: agent-ci/ci/lint/tests/security scans.
- Secret scanning, dependency scanning, IaC/container hardening, least-privilege workflows, production environment approvals.
**Unresolved Risks**
- REQUIRED INPUT: branch protection and required checks missing.
- SECURITY RISK: workflow permission/release risks from CodeAnt.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- CI/CD must block on tests for governed write services, sync, serial uniqueness, UOM rules, auth, and SQL read-only guard.
- Security gates must include SAST, SCA, secret scanning, IaC/container policy, and workflow permission audit.
- Release jobs need least-privilege permissions and environment approvals; broad write permissions require explicit risk acceptance.
## 54. Production Hardening

**Hardening**
- Strong secrets, explicit CORS, disable debug/hot reload/mock/default users, enable LAN where needed, non-root containers, no privilege escalation, seccomp, read-only FS, healthchecks, Redis production requirement, TLS/secure cookies, secret manager, rate limits, sanitized logs.
**Unresolved Risks**
- SECURITY RISK: CodeAnt findings need closure or risk acceptance.
- REQUIRED INPUT: go-live security signoff criteria missing.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Production hardening must have evidence, not only checklist items. Each control needs verification command, expected result, owner, and last-checked timestamp.
- Production must fail fast on weak secrets, wildcard CORS, debug endpoints, mock ERP, default users, missing Redis where required, and unsafe SQL config.
- Hardening exceptions require compensating controls and expiry date.
## 55. Known Technical Debt

**Debt**
- CodeAnt: 22,449 total issues; 40 SAST; 3 secrets; 40 infra; 40 SCA; 17,440 duplicate code; 142 complex functions; 1,609 missing docstrings.
- Drift: V2.1/V3 labels, session states, barcode validation, offline store, event transition, PIN routes, manager role.
**Unresolved Risks**
- SCALABILITY RISK: complex/duplicate code increases critical change risk.
- SECURITY RISK: known findings need owners/dates.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Technical debt must be triaged by impact on stock truth, security, availability, maintainability, and delivery risk.
- CodeAnt issue counts must be broken down into actionable tickets. Large duplicate/complex code around SQL, sync, auth, and frontend password flows should be prioritized because these areas affect security and data integrity.
- Debt acceptance must include owner and revisit date.
## 56. Known Architectural Risks

**Risks**
- ERP write-back wording, event transition, session states, barcode drift, offline store drift, legacy mirrors/direct writes, CodeAnt security debt, WebSocket scale.
**Unresolved Risks**
- REQUIRED INPUT: ADRs needed for each conflict.
- DATA INTEGRITY RISK: no silent conflict resolution or preference-based fixes.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Architectural risks require ADRs with decision, rejected alternatives, migration impact, test plan, rollback plan, and owner.
- Risks affecting stock truth or ERP boundaries are higher priority than cosmetic or convenience refactors.
- Silent resolution of contradictions is forbidden; every contradiction remains visible until an ADR updates this spec.
## 57. Open Questions

**Open Questions**
- REQUIRED INPUT: authoritative architecture analysis document confirmation.
- REQUIRED INPUT: KPIs, thresholds, role rules, canonical session state, event enforcement date, allowed offline actions, RTO/RPO/SLOs, retention, device security, production controls, mobile version matrix.
**Unresolved Risks**
- UNDEFINED BEHAVIOR: dependent development must be blocked or explicitly constrained.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Open questions must be tracked as blocking, non-blocking, or informational. Blocking questions prevent implementation of dependent flows.
- Each `REQUIRED INPUT` needs owner, due date, decision record, and affected sections.
- If a decision changes source-of-truth, role authority, ERP boundary, or offline semantics, the API, database, UI, and testing sections must all be updated.
## 58. Undefined Behaviors

**Undefined Register**
- API envelopes/rates/permissions for many endpoints, offline approvals/finalization/session creation, manager UI, queue encryption/photos/lost device, collection retention, observability stack, cache TTLs, projection rebuild acceptance, WebSocket replay/token expiry/backpressure, reports/exports.
**Unresolved Risks**
- DATA INTEGRITY RISK: undefined behavior must not be filled by developer preference.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Undefined behavior is not backlog polish; it is a guardrail. Developers must not implement undefined flows by intuition.
- Undefined flows must be converted to explicit allowed/blocked/queued/manual-review behavior before coding.
- Any undefined behavior discovered during implementation must be added to this section before the implementation is closed.
## 59. Recommended Refactors

**Refactors**
- Canonical session adapter, centralized barcode validation, explicit event-first enforcement, encrypted durable offline store if approved, PIN route/schema unification, collection ownership/retention, endpoint permission/rate/error OpenAPI, WebSocket scale-out, SQL interval precedence, complex/duplicate code reduction.
**Unresolved Risks**
- REQUIRED INPUT: priority/migration windows/risk acceptance missing.
- DATA INTEGRITY RISK: stock/session/sync refactors require tests and possible data approval gates.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Recommended refactors must be sequenced by dependency: tests first, contract alignment, migration/feature flags, implementation, verification, cleanup.
- Refactors touching governed write paths require narrow tests before and after; broad rewrites are not justified without failing evidence.
- Each refactor needs rollback plan and data-integrity verification if it affects persisted state.
## 60. Future Evolution Roadmap

**Roadmap**
- Enforced event sourcing, policy engine, encrypted offline DB, multi-worker realtime, schema registry, observability dashboards, CodeAnt closure, load testing, ADR governance.
**Unresolved Risks**
- REQUIRED INPUT: roadmap priority/budget/compliance/deployment timeline missing.
- SCALABILITY RISK: future features must not add direct writes, global serial checks, or overwrite sync.


### Audit Expansion Applied
**Audit Findings**
- Missing Sections: no numbered section is missing.
- Hidden Assumptions: this section must not rely on generated inventory alone. If source code, runtime configuration, or operational policy does not define behavior, the behavior remains marked.
- Undefined Flows: any flow not explicitly described in source or this section is not approved for implementation.
- Missing Failure States: every future change touching this section must document validation failure, permission failure, network failure, storage failure, stale data, and operator-cancelled states.

**Production-Grade Completion Rules**
- Purpose/Trigger/Actors: must be traceable to a route, service, screen, collection, or architecture document.
- Preconditions: must include auth state, session state, network state, data freshness, and required feature flags where relevant.
- Validation: must identify client validation, backend validation, service validation, and database/index constraints separately.
- Processing Logic: must identify the owning service and whether work is synchronous, asynchronous, queued, transactional, projection-backed, or read-only.
- Failure Path: must return explicit user-visible or operator-visible state; silent success, silent drop, and implicit fallback are not allowed.
- Retry Path: must state whether retry is safe, requires the same idempotency key, requires refreshed version state, or is blocked.
- Offline Path: must classify behavior as allowed offline, queued offline, read-only offline, blocked offline, or `UNDEFINED BEHAVIOR`.
- Rollback Path: must be versioned, forked, recounted, restored from backup, or approval-gated repair. Direct overwrite rollback is not allowed for stock truth.
- Concurrency Path: must define lock, unique index, OCC version, idempotency, semantic hash, or conflict-fork behavior.
- Security Path: must state server-side permission checks, secret handling, data redaction, LAN/TLS/rate controls, and auditability.
- Observability Path: must define metrics, logs, traces, audit events, alert thresholds or mark thresholds as `REQUIRED INPUT`.

**Section-Specific Expansion**
- Roadmap items must not bypass unresolved architecture conflicts. Event sourcing enforcement, offline database replacement, and realtime scale-out each require ADR, migration plan, tests, and operational runbooks.
- Future evolution must preserve read-only ERP, item-scoped serials, additive/merge sync, governed writes, and auditability unless an approved architecture change replaces them.
- Roadmap priority requires product, security, operations, and warehouse stakeholder input.
