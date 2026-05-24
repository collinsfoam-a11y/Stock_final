# ADR-006: Governance Ledger

Status: Accepted

Decision: Governance evidence requires an append-only `governance_ledger` separate from mutable or best-effort audit views.

Consequences: Governed write services append ledger evidence before writing legacy governance views. If ledger append fails and `GOVERNANCE_LEDGER_REQUIRED=true`, the governed operation fails closed.
