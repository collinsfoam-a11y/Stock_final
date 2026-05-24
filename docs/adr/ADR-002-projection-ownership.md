# ADR-002: Projection Ownership

Status: Accepted

Decision: Projection collections are derived read models and are not business truth. Projection writes may occur only through projection services, and projection operational state is recorded separately from domain events.

Consequences: Direct projection edits are recovery actions, not normal writes. Production rebuilds must preserve live projections until rebuilt state is validated.
