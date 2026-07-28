# Stock Verify Glossary

## A

- **Acknowledgement**: Server response confirming a command was received and processed idempotently.
- **Append-only**: Data model where records are never modified or deleted; corrections create new records with version numbers.
- **Audit delta**: `total_physical_qty - frozen_baseline`. Represents the net difference between all accepted physical counts and the ERP baseline.
- **Auto-approval**: Conditional approval that occurs automatically when all validation conditions are satisfied.

## B

- **Baseline**: The frozen ERP quantity snapshot taken when a master session starts. Stored as `baseline_qty`, `baseline_at`, `snapshot_version`.

## C

- **Command ID**: Stable identifier for an offline command. Never reused with different content.
- **Condition allocation**: Assignment of a physical condition (SALEABLE, DAMAGED, EXPIRED, etc.) to a quantity within a batch or serial item.
- **Content hash**: Cryptographic hash of command payload content. Used to detect conflicts when a command ID is reused.
- **Conflict quarantine**: State where a duplicate or conflicting command is isolated for supervisor review rather than silently resolved.

## D

- **Damage case**: A record capturing physical condition damage, including damage type, returnability, repairability, and workflow state.
- **Deterministic command**: An offline command that produces the same result regardless of retry count or timing.
- **Device sequence number**: Monotonically increasing counter per device used to order commands and detect stale replays.

## E

- **Enterprise variance**: The final aggregated variance across all location sessions at the master session level.
- **ERP**: External Reference Point (or Enterprise Resource Planning system). Read-only SQL data source for stock baselines.
- **Evidence record**: Separate storage for photos, files, and supporting documentation linked to an observation, batch, serial, or damage case.

## F

- **Finalisation**: The process of marking a master session as complete after all preflight validations pass.
- **FINALIZED**: Terminal state indicating the session is immutable, reconciled, and trustworthy.

## G

- **Guidance mode**: Staff counting workflow that presents one decision per screen with fixed context header and primary action.

## H

- **Heartbeat**: Periodic signal from a staff device indicating an active session is still in use. Used for 60-minute inactivity detection.

## I

- **Idempotency**: Property where a command can be applied multiple times with the same effect as applying it once.
- **Inventory domain**: The formal model of master sessions, location sessions, items, batches, serials, and their relationships.

## L

- **Location session**: A staff-created session for counting items at a specific physical location within a master session.
- **Location hierarchy**: Tree structure of Company → Building → Floor → Rack/Area.

## M

- **Master session**: A supervisor-created session that controls the count programme scope, ERP baseline, locations, policy version, and final approval.
- **Movement-adjusted expected quantity**: ERP baseline plus external inbound movements minus external outbound movements plus approved ERP adjustments.
- **Mutation**: Any write operation that changes data in MongoDB or SQL Server.

## O

- **Operational delta**: `total_physical_qty - movement_adjusted_expected_qty`. Represents the net physical count variance after accounting for external movements.
- **Ownership event**: Append-only record of any session ownership change (claim, pause, resume, release, takeover).

## P

- **Physical batch**: A count-level batch identity combining item_code + physical batch number + MRP + manufacturing date + expiry date.
- **Physical observation**: The actual quantity counted at a location by staff. Immutable once submitted.
- **Policy snapshot**: The item tracking policy (mode, precision, conditions, evidence rules) stored with every count.
- **Preflight**: Validation checks run before finalisation to ensure all requirements are met.

## Q

- **Quantity delta**: `physical_qty - expected_qty`. Negative = shortage, positive = excess, zero = matched.

## R

- **Recount**: A blind re-count of an item by a different employee, creating a new observation version.
- **Reconciliation decision**: Supervisor decision on a recount result, deciding the final accepted observation.
- **Rack lock**: A mechanism preventing further modifications to a rack's count data after it has been finalised.

## S

- **Serial unit**: Individual item with unique serial number, tracked with condition, damage type, and custody history.
- **Serial uniqueness**: Scoped per item within a master session (not global).
- **Split count**: Structured count format with carton/loose lines and explicit total.
- **STALE**: Session state entered after 60 minutes of inactivity without heartbeat.
- **Strict auto-approval**: Auto-approval requiring every single condition to be satisfied (no partial approval).

## T

- **Terminal state**: A loop engineering state where the agent loop stops (PASS, READY_FOR_REVIEW, BLOCKED_*, FAILED_TESTS, SUPERSEDED).
- **Tracking mode**: The item complexity mode: QUANTITY, BATCH, SERIAL, or BUNDLE. Controlled by the system, not staff.

## V

- **Variance**: Difference between physical count and expected quantity. Can be at observation level or enterprise level.

## W

- **Worktree**: A Git worktree allowing parallel branches to be checked out in separate directories without conflicting.