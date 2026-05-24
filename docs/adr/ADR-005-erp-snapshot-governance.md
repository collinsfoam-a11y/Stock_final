# ADR-005: ERP Snapshot Governance

Status: Accepted

Decision: ERP is read-only source data. MongoDB ERP records are cache/snapshot records and must carry lineage fields: `snapshot_version`, `snapshot_timestamp`, and `source_sync_id` when available.

Consequences: Missing lineage is flagged as stale snapshot risk. ERP cache values must not masquerade as live SQL values when SQL is unavailable.
