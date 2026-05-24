# ADR-003: Replay Determinism

Status: Accepted

Decision: New domain events receive `global_sequence` and `aggregate_sequence`. Replay must prefer `global_sequence` over timestamps. Timestamp fallback is compatibility-only for legacy data.

Consequences: Strict replay requires migration/backfill of sequence fields for legacy events before `EVENT_REPLAY_REQUIRE_GLOBAL_SEQUENCE=true` is enabled.
