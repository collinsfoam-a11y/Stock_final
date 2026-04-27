# BL V2 Phase 0 Spec

Status: Locked

Owner: Backend platform / stock verification business-logic rollout

Scope: PR-1 only

## Objective

Define the Phase 0 safety contract required before any BL V2 business-logic rollout work begins.

This PR is limited to:

- global safety override
- server-side flag resolution
- session logic pinning
- enforcement on write boundaries
- tests for the above

This PR must not introduce canonical business logic, shadow writes, replay persistence, metrics, or sync migration behavior.

## In-Scope Files

- Existing: [backend/services/feature_flags.py](/Users/noufi1/stk_final/Stock_final/backend/services/feature_flags.py)
- New: `backend/services/flag_resolver.py`
- Existing: [backend/api/schemas.py](/Users/noufi1/stk_final/Stock_final/backend/api/schemas.py)
- Existing: [backend/api/session_management_api.py](/Users/noufi1/stk_final/Stock_final/backend/api/session_management_api.py)
- Existing: [backend/api/count_lines_routes.py](/Users/noufi1/stk_final/Stock_final/backend/api/count_lines_routes.py)
- Existing: [backend/api/recount_api.py](/Users/noufi1/stk_final/Stock_final/backend/api/recount_api.py)
- Existing: [backend/api/sync_batch_api.py](/Users/noufi1/stk_final/Stock_final/backend/api/sync_batch_api.py)
- New tests: `backend/tests/test_phase0_flags.py`
- Existing/new tests: `backend/tests/test_session_pinning.py`

## Non-Goals

This PR must not implement:

- canonical variance or snapshot logic
- replay logging or replay storage
- metrics collection or threshold enforcement
- sync routing changes between v1 and v2
- deferred queues, backpressure, or repair tooling
- frontend changes

## Feature Flag Contract

Source of truth: [backend/services/feature_flags.py](/Users/noufi1/stk_final/Stock_final/backend/services/feature_flags.py)

Flags introduced or reserved by this PR:

```yaml
flags:
  BL_V2_GLOBAL_DISABLE:
    type: boolean
    default: false
    priority: highest
    behavior:
      - force legacy reads
      - force legacy writes
      - disable compare
      - disable shadow
      - disable canonical write enforcement
      - block repair jobs unless an explicit admin override exists outside this PR

  BL_V2_COMPARE:
    type: boolean
    default: false
    behavior:
      - reserved only
      - no compare execution in PR-1

  BL_V2_SHADOW:
    type: boolean
    default: false
    behavior:
      - reserved only
      - no shadow writes in PR-1

  BL_V2_ENFORCE_WRITES:
    type: boolean
    default: false
    behavior:
      - reserved only
      - no canonical writes in PR-1
```

### Flag Safety Rules

- Feature flags are server-side only. No client payload, query param, or header may directly set BL V2 flags.
- If `BL_V2_GLOBAL_DISABLE` is `true`, all BL V2 flags are treated as disabled at runtime regardless of stored state.
- `BL_V2_GLOBAL_DISABLE` changes runtime behavior only. It must not rewrite existing `logic_version` values in stored session documents.

## Flag Resolution Contract

New service: `backend/services/flag_resolver.py`

### Resolution Priority

```txt
request_id > session_id > user_id > warehouse > global
```

### Returned Shape

Mutating endpoints must receive a normalized object shaped as:

```json
{
  "compare": false,
  "shadow": false,
  "enforce_writes": false,
  "scope": "session|user|warehouse|global"
}
```

### Resolver Semantics

- `scope` must represent the stable scope used for execution and session pinning.
- `request_id` is supported as an input to precedence evaluation, but it is not a valid persisted pin source.
- For mutating endpoints, request-scoped overrides are not allowed to determine session logic version.
- If a request-scoped override would change the selected version for a write, the resolver must ignore the request scope and continue with the next stable scope.
- If stable resolution cannot be derived after ignoring request scope, the resolver must fail closed.

### Valid Flag States in PR-1

PR-1 is safety-only. The resolver must normalize or reject any inconsistent BL V2 state.

Allowed runtime combinations:

```txt
compare=false, shadow=false, enforce_writes=false
```

Reserved but not executable in PR-1:

```txt
compare=true, shadow=false, enforce_writes=false
compare=true, shadow=true, enforce_writes=false
compare=true, shadow=true, enforce_writes=true
```

Invalid combinations:

```txt
shadow=true and compare=false
enforce_writes=true and shadow=false
enforce_writes=true and compare=false
```

If the resolver encounters an invalid combination, it must fail closed and the request must be rejected on mutating endpoints.

## Session Pinning Contract

Schema owner: [backend/api/schemas.py](/Users/noufi1/stk_final/Stock_final/backend/api/schemas.py)

Add the following fields to `Session`:

```json
{
  "logic_version": "v1 | v2",
  "logic_scope_source": "global | warehouse | user_id | session_id"
}
```

### Field Semantics

- `logic_version`
  - `v1` means legacy execution path
  - `v2` is reserved for future canonical execution
- `logic_scope_source`
  - stable scope that selected the pinned version
  - must never be `request_id`

### Pinning Rules

Pinning is required on the first mutating write that creates or updates a session-owned workflow.

#### First write

On first write for a session:

1. resolve flags through `flag_resolver`
2. derive target version
3. persist:

```txt
logic_version = v1 or v2
logic_scope_source = global | warehouse | user_id | session_id
```

For PR-1, the only executable path is `v1`, but the schema and control path must support future `v2` pinning.

If no BL V2 flags are enabled, which is the default PR-1 case:

```txt
logic_version MUST be pinned to v1
logic_scope_source MUST still be persisted from the stable resolver result
```

#### Session creation

- `create_session` must resolve flags before inserting the session document.
- New sessions created while `BL_V2_GLOBAL_DISABLE=true` must always be pinned to `v1`.

#### Legacy sessions without a pin

- Existing sessions missing `logic_version` and `logic_scope_source` may be pinned on their first post-PR-1 mutating write.
- This first post-PR-1 write is treated as the pinning write.

#### Idempotency

Pinning must be idempotent.

- If a session already has both `logic_version` and `logic_scope_source`:
  - do not overwrite either field
  - do not recompute the pin
  - treat the session as already pinned
- Retries, duplicate requests, and sync replays must reuse the stored pin rather than attempting a new first-write decision.

#### Subsequent writes

- All future writes to a pinned session must execute using the pinned `logic_version`.
- If current stable flag resolution disagrees with the stored pin, execution must still follow the stored pin.
- A resolver change is not itself a mixed-logic failure.

#### Kill switch behavior

- If `BL_V2_GLOBAL_DISABLE=true`, runtime execution must force `v1` regardless of the stored pin.
- Stored pin fields remain unchanged.

## Mixed Logic Rules

The system must never execute both `v1` and `v2` write logic for the same session after pinning.

### Allowed behavior

- Session pinned to `v1`, resolver later prefers `v2`: execute `v1`
- Session pinned to `v2`, resolver later prefers `v1`: execute `v2`
- Any pinned session under global disable: execute `v1`

### Rejected behavior

Reject the request if:

- the session is already pinned but the code path attempts to execute a different logic version
- the session has invalid pin values
- the session is on its second or later PR-1-managed write and still has no pin

Recommended response:

- `409 Conflict` for mixed-logic or missing-pin safety violations
- `500` only for internal resolver or persistence failures

## Enforcement Points

PR-1 enforcement must be added to these write boundaries:

- [backend/api/session_management_api.py](/Users/noufi1/stk_final/Stock_final/backend/api/session_management_api.py)
  - session creation
  - any mutating session state transition implemented there
- [backend/api/count_lines_routes.py](/Users/noufi1/stk_final/Stock_final/backend/api/count_lines_routes.py)
  - count create
  - add quantity
  - approve
  - reject
  - any count-line mutation endpoint
- [backend/api/recount_api.py](/Users/noufi1/stk_final/Stock_final/backend/api/recount_api.py)
  - request create
  - assign
  - complete
  - cancel
- [backend/api/sync_batch_api.py](/Users/noufi1/stk_final/Stock_final/backend/api/sync_batch_api.py)
  - incoming session mutation ops
  - incoming count-line mutation ops
  - incoming recount-related mutations if present

## Failure Conditions

Reject the request if any of the following is true:

- mixed logic detected for a pinned session
- resolver returns an invalid or inconsistent flag state
- a session expected to be pinned on a subsequent write has no pin
- pin fields contain unsupported values
- a mutating endpoint attempts to use request scope as the persisted pin source

Fail closed to legacy execution only when:

- `BL_V2_GLOBAL_DISABLE=true`

Do not silently downgrade to legacy for any other safety violation.

All rejected requests must log:

- `session_id`
- resolved flags
- stored pin, if present
- attempted logic path
- rejection reason

## API Behavior Rules

- PR-1 must not alter successful response payload shapes beyond additive session fields if those fields are already serialized by the existing schema.
- Mutating endpoints may add internal guard rails, but they must not introduce canonical result fields.
- Any rejection introduced by this PR must be deterministic and logged by the existing backend logging path.

## Implementation Note

Non-blocking recommendation for PR-1 implementation:

- Centralize flag resolution, kill-switch enforcement, session pin enforcement, and mixed-logic validation in `backend/services/logic_guard.py`
- Endpoints may call that shared guard rather than duplicating safety logic across session, count-line, recount, and sync paths

## Test Requirements

Create or update:

- `backend/tests/test_phase0_flags.py`
- `backend/tests/test_session_pinning.py`

Required coverage:

### Flag behavior

- global disable overrides all BL V2 flags
- server-side resolver returns correct stable scope
- request-scoped override is ignored for mutating pin decisions
- invalid flag combinations are rejected

### Session pinning

- new session is pinned on create
- legacy session without pin is pinned on first mutating write
- subsequent writes honor the stored pin even if resolver output changes
- mixed logic execution attempt is rejected
- missing pin on second write is rejected
- global disable forces runtime `v1` behavior for a pinned session

### Endpoint coverage

- session create path respects kill switch
- count-line mutation path respects pinning
- recount mutation path respects pinning
- sync mutation path respects pinning

## Acceptance Criteria

PR-1 is complete only if all of the following are true:

- `BL_V2_GLOBAL_DISABLE` exists and is enforced in all listed mutating endpoints
- stable flag resolution exists in `flag_resolver.py`
- session pin fields exist in the shared session schema
- session pinning happens deterministically on first write
- mixed-logic writes are prevented
- required tests pass
- no canonical, replay, metrics, or sync-migration behavior is introduced

## Explicit Deferred Work

The following is intentionally deferred to later PRs:

- canonical logic computation
- replay persistence
- metrics collection and rollout thresholds
- shadow writes
- canonical sync routing
- repair jobs and repair locks
- cohort rollout configuration
