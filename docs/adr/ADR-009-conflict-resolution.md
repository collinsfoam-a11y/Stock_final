# ADR-009: Conflict Resolution

Status: Accepted

Decision: Conflict resolution must be append-only and idempotent. Offline replay conflicts must not overwrite server state without governed resolution evidence.

Consequences: Conflict outcomes require idempotency keys, actor identity, and governance ledger evidence. Stale-device replays must be rejected or quarantined with machine-readable conflict status.
