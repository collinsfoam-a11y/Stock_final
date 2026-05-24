# ADR-004: Offline Journal

Status: Accepted

Decision: Offline mutation durability must be append-only and replayable. Mutable whole-array queue replacement is not acceptable as the long-term architecture.

Consequences: Existing AsyncStorage queue behavior remains a migration risk until replaced by a SQLite journal with sequence IDs, leases, checksums, and crash recovery tests.
