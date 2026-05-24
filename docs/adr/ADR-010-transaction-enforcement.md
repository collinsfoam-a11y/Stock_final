# ADR-010: Transaction Enforcement

Status: Accepted

Decision: Governed multi-document writes require MongoDB transactions in staging and production unless an explicit emergency downgrade flag is set.

Consequences: Non-transactional local development remains supported for single-node MongoDB. Production deployments must use replica set or sharded MongoDB transaction support.
