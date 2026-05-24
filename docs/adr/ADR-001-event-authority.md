# ADR-001: Event Authority

Status: Accepted

Decision: `event_log` is reserved for authoritative domain events only. Operational projection markers, rebuild checkpoints, validation metadata, and replay maintenance records belong in `projection_operations_log`.

Consequences: Replay consumers must reject projection marker records if they appear in `event_log`. Any existing marker records in production require an approval-gated migration before strict replay enforcement can be enabled.
