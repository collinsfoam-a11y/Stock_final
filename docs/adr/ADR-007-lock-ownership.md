# ADR-007: Lock Ownership

Status: Accepted

Decision: Distributed locks require owner identity, expiry, `fencing_token`, and `lease_version`. Expired lock recovery must be atomic and must not use delete-then-insert reacquisition.

Consequences: Long-running workflows must validate lock owner and optional fencing metadata before committing protected mutations.
