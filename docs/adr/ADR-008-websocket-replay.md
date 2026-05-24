# ADR-008: WebSocket Replay

Status: Accepted

Decision: WebSocket delivery is not authoritative. Durable missed-event recovery requires replay offsets backed by persisted delivery records or replayable domain events.

Consequences: Current Redis fan-out improves cross-worker delivery but does not complete durable replay. Clients must not treat WebSocket receipt as persistence confirmation.
