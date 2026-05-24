from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.projection_service import ProjectionService
from backend.services.replay_invariant_engine import ReplayInvariantEngine


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, set):
        return sorted(_canonicalize(item) for item in value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _stable_hash(value: Any) -> str:
    serialized = json.dumps(
        _canonicalize(value),
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _as_positive_int(value: Any) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        parsed = int(value)
        return parsed if parsed > 0 else None
    except (TypeError, ValueError):
        return None


def _event_id(event: dict[str, Any]) -> str:
    return str(event.get("_id") or event.get("event_id") or event.get("id") or "")


def _event_sort_key(event: dict[str, Any]) -> tuple[int, Any, str]:
    sequence = _as_positive_int(event.get("global_sequence"))
    if sequence is not None:
        return (0, sequence, _event_id(event))
    return (
        1,
        event.get("recorded_at")
        or event.get("timestamp")
        or event.get("created_at")
        or datetime.min,
        _event_id(event),
    )


class ReplayCertificationService:
    """Creates durable replay-lineage certification evidence."""

    def __init__(self, db: Any) -> None:
        self.db = db
        self.projection_service = ProjectionService(db)
        self.invariant_engine = ReplayInvariantEngine()

    async def certify(
        self,
        *,
        session_id: Optional[str] = None,
        certification_id: Optional[str] = None,
    ) -> dict[str, Any]:
        now_dt = _utc_now()
        events = await self._load_events(session_id=session_id)
        projection_docs = await self._load_projection_docs(session_id=session_id)
        semantic_validation = self.invariant_engine.validate(events, projection_docs)
        continuity = self.audit_replay_continuity(events)
        expected_state = self.invariant_engine.expected_semantic_state(events)
        expected_state_hash = _stable_hash(expected_state)
        deterministic_repeat_hash = _stable_hash(
            self.invariant_engine.expected_semantic_state(events)
        )
        projection_hash = await self.projection_service._projection_state_hash(
            session_id=session_id,
            db_session=None,
        )
        evidence = {
            "_id": certification_id or f"replay-cert-{uuid.uuid4()}",
            "session_id": session_id,
            "status": (
                "certified"
                if semantic_validation["passed"]
                and continuity["passed"]
                and expected_state_hash == deterministic_repeat_hash
                else "failed"
            ),
            "event_count": len(events),
            "first_global_sequence": continuity["first_global_sequence"],
            "last_global_sequence": continuity["last_global_sequence"],
            "event_window_hash": _stable_hash(
                [
                    {
                        "event_id": _event_id(event),
                        "global_sequence": event.get("global_sequence"),
                        "aggregate_id": event.get("aggregate_id"),
                        "aggregate_sequence": event.get("aggregate_sequence"),
                        "event_type": event.get("event_type"),
                    }
                    for event in events
                ]
            ),
            "projection_hash": projection_hash,
            "semantic_state_hash": expected_state_hash,
            "deterministic_repeat_hash": deterministic_repeat_hash,
            "semantic_validation": semantic_validation,
            "continuity": continuity,
            "created_at": now_dt,
        }
        await self._collection("replay_certification_reports").insert_one(evidence)
        return evidence

    async def latest_reports(self, *, limit: int = 20) -> list[dict[str, Any]]:
        cursor = (
            self._collection("replay_certification_reports")
            .find({})
            .sort("created_at", -1)
            .limit(max(min(int(limit or 20), 100), 1))
        )
        return [report async for report in cursor]

    async def dashboard_summary(self) -> dict[str, Any]:
        latest_reports = await self.latest_reports(limit=10)
        replay_log_count = await self._collection("websocket_replay_log").count_documents({})
        cursor_docs = await self._collection("websocket_replay_cursors").find({}).to_list(
            length=10_000
        )
        ownership_docs = await self._collection("websocket_socket_ownership").find({}).to_list(
            length=10_000
        )
        worker_leases = await self._collection("websocket_replay_worker_leases").find({}).to_list(
            length=10_000
        )
        max_replay_sequence = await self._max_sequence(
            collection_name="websocket_replay_log",
            field_name="ws_sequence",
        )
        min_cursor_sequence = self._min_cursor_sequence(cursor_docs)
        stale_ownership = self._expired_docs(ownership_docs)
        stale_worker_leases = self._expired_docs(worker_leases)
        failed_reports = [report for report in latest_reports if report.get("status") != "certified"]
        replay_lag = (
            max_replay_sequence - min_cursor_sequence
            if max_replay_sequence is not None and min_cursor_sequence is not None
            else None
        )
        alerts = []
        if failed_reports:
            alerts.append(
                {
                    "severity": "critical",
                    "code": "REPLAY_CERTIFICATION_FAILED",
                    "count": len(failed_reports),
                }
            )
        if stale_ownership:
            alerts.append(
                {
                    "severity": "warning",
                    "code": "STALE_SOCKET_OWNERSHIP",
                    "count": len(stale_ownership),
                }
            )
        if stale_worker_leases:
            alerts.append(
                {
                    "severity": "warning",
                    "code": "STALE_REPLAY_WORKER_LEASE",
                    "count": len(stale_worker_leases),
                }
            )

        return {
            "status": "healthy" if not alerts else "degraded",
            "generated_at": _utc_now(),
            "replay_log_count": replay_log_count,
            "replay_cursor_count": len(cursor_docs),
            "active_socket_ownership_count": len(ownership_docs) - len(stale_ownership),
            "stale_socket_ownership_count": len(stale_ownership),
            "active_replay_worker_lease_count": len(worker_leases) - len(stale_worker_leases),
            "stale_replay_worker_lease_count": len(stale_worker_leases),
            "max_replay_sequence": max_replay_sequence,
            "minimum_cursor_sequence": min_cursor_sequence,
            "replay_lag": replay_lag,
            "latest_certification_status": (
                latest_reports[0].get("status") if latest_reports else "missing"
            ),
            "latest_reports": latest_reports,
            "alerts": alerts,
        }

    async def recovery_plan(self) -> dict[str, Any]:
        ownership_docs = await self._collection("websocket_socket_ownership").find({}).to_list(
            length=10_000
        )
        worker_leases = await self._collection("websocket_replay_worker_leases").find({}).to_list(
            length=10_000
        )
        checkpoints = await self._collection("projection_replay_checkpoints").find({}).to_list(
            length=10_000
        )
        stale_ownership = self._expired_docs(ownership_docs)
        stale_worker_leases = self._expired_docs(worker_leases)
        interrupted_rebuilds = [
            checkpoint
            for checkpoint in checkpoints
            if checkpoint.get("status") in {"running", "interrupted", "failed"}
        ]
        actions = []
        if stale_ownership:
            actions.append(
                {
                    "action": "cleanup_stale_socket_ownership",
                    "document_count": len(stale_ownership),
                    "requires_mutation": True,
                    "default_mode": "dry_run",
                }
            )
        if stale_worker_leases:
            actions.append(
                {
                    "action": "cleanup_stale_replay_worker_leases",
                    "document_count": len(stale_worker_leases),
                    "requires_mutation": True,
                    "default_mode": "dry_run",
                }
            )
        if interrupted_rebuilds:
            actions.append(
                {
                    "action": "resume_or_restart_projection_rebuild",
                    "document_count": len(interrupted_rebuilds),
                    "requires_mutation": True,
                    "default_mode": "operator_review",
                }
            )
        return {
            "generated_at": _utc_now(),
            "action_count": len(actions),
            "actions": actions,
            "stale_socket_ownership_ids": [doc.get("_id") for doc in stale_ownership],
            "stale_replay_worker_lease_ids": [doc.get("_id") for doc in stale_worker_leases],
            "interrupted_rebuild_ids": [
                checkpoint.get("rebuild_id") for checkpoint in interrupted_rebuilds
            ],
        }

    async def cleanup_stale_ownership(self, *, dry_run: bool = True) -> dict[str, Any]:
        ownership_docs = await self._collection("websocket_socket_ownership").find({}).to_list(
            length=10_000
        )
        worker_leases = await self._collection("websocket_replay_worker_leases").find({}).to_list(
            length=10_000
        )
        stale_ownership = self._expired_docs(ownership_docs)
        stale_worker_leases = self._expired_docs(worker_leases)
        if not dry_run:
            for document in stale_ownership:
                await self._collection("websocket_socket_ownership").delete_one(
                    {"_id": document.get("_id")}
                )
            for document in stale_worker_leases:
                await self._collection("websocket_replay_worker_leases").delete_one(
                    {"_id": document.get("_id")}
                )
        return {
            "dry_run": dry_run,
            "stale_socket_ownership_count": len(stale_ownership),
            "stale_replay_worker_lease_count": len(stale_worker_leases),
            "deleted_socket_ownership_count": 0 if dry_run else len(stale_ownership),
            "deleted_replay_worker_lease_count": 0 if dry_run else len(stale_worker_leases),
        }

    async def _load_events(self, *, session_id: Optional[str]) -> list[dict[str, Any]]:
        query: dict[str, Any] = {}
        if session_id:
            query["$or"] = [{"payload.session_id": session_id}, {"session_id": session_id}]
        events = [event async for event in self._collection("event_log").find(query)]
        events.sort(key=_event_sort_key)
        return events

    async def _load_projection_docs(
        self,
        *,
        session_id: Optional[str],
    ) -> dict[str, list[dict[str, Any]]]:
        query = {"session_id": session_id} if session_id else {}
        docs: dict[str, list[dict[str, Any]]] = {}
        for collection_name in self.invariant_engine.required_projection_collections():
            docs[collection_name] = [
                document async for document in self._collection(collection_name).find(query)
            ]
        return docs

    def audit_replay_continuity(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        global_sequences: list[int] = []
        global_seen: set[int] = set()
        duplicate_global_sequences: list[int] = []
        missing_global_sequences: list[int] = []
        aggregate_versions: dict[str, list[int]] = {}
        aggregate_gaps: list[dict[str, Any]] = []
        duplicate_aggregate_versions: list[dict[str, Any]] = []
        orphan_events: list[str] = []

        for event in events:
            event_identifier = _event_id(event)
            sequence = _as_positive_int(event.get("global_sequence"))
            aggregate_id = str(event.get("aggregate_id") or "")
            aggregate_sequence = _as_positive_int(
                event.get("aggregate_sequence") or event.get("aggregate_version")
            )

            if not event_identifier or sequence is None or not aggregate_id:
                orphan_events.append(event_identifier or "<missing-event-id>")
            if sequence is not None:
                if sequence in global_seen:
                    duplicate_global_sequences.append(sequence)
                global_seen.add(sequence)
                global_sequences.append(sequence)
            if aggregate_id and aggregate_sequence is not None:
                aggregate_versions.setdefault(aggregate_id, []).append(aggregate_sequence)

        if global_sequences:
            expected = set(range(min(global_sequences), max(global_sequences) + 1))
            missing_global_sequences = sorted(expected - set(global_sequences))

        for aggregate_id, versions in aggregate_versions.items():
            seen_versions: set[int] = set()
            duplicates: list[int] = []
            for version in versions:
                if version in seen_versions:
                    duplicates.append(version)
                seen_versions.add(version)
            if duplicates:
                duplicate_aggregate_versions.append(
                    {"aggregate_id": aggregate_id, "versions": sorted(set(duplicates))}
                )
            expected_versions = set(range(1, max(versions) + 1)) if versions else set()
            missing_versions = sorted(expected_versions - set(versions))
            if missing_versions:
                aggregate_gaps.append(
                    {"aggregate_id": aggregate_id, "missing_versions": missing_versions}
                )

        violations = []
        if duplicate_global_sequences:
            violations.append("duplicate_global_sequence")
        if missing_global_sequences:
            violations.append("global_sequence_gap")
        if duplicate_aggregate_versions:
            violations.append("duplicate_aggregate_version")
        if aggregate_gaps:
            violations.append("aggregate_version_gap")
        if orphan_events:
            violations.append("orphan_authoritative_event")

        return {
            "passed": not violations,
            "violations": violations,
            "first_global_sequence": min(global_sequences) if global_sequences else None,
            "last_global_sequence": max(global_sequences) if global_sequences else None,
            "global_sequence_count": len(global_sequences),
            "missing_global_sequences": missing_global_sequences,
            "duplicate_global_sequences": sorted(set(duplicate_global_sequences)),
            "aggregate_gaps": aggregate_gaps,
            "duplicate_aggregate_versions": duplicate_aggregate_versions,
            "orphan_events": orphan_events,
            "aggregate_count": len(aggregate_versions),
        }

    async def _max_sequence(self, *, collection_name: str, field_name: str) -> Optional[int]:
        cursor = self._collection(collection_name).find({}).sort(field_name, -1).limit(1)
        async for document in cursor:
            return _as_positive_int(document.get(field_name))
        return None

    @staticmethod
    def _min_cursor_sequence(cursor_docs: list[dict[str, Any]]) -> Optional[int]:
        sequences = [
            int(doc["last_ack_sequence"])
            for doc in cursor_docs
            if isinstance(doc.get("last_ack_sequence"), int)
        ]
        return min(sequences) if sequences else None

    @staticmethod
    def _expired_docs(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        now_dt = _utc_now()
        return [
            document
            for document in documents
            if isinstance(document.get("expires_at"), datetime)
            and document["expires_at"] <= now_dt
        ]

    def _collection(self, name: str) -> Any:
        collection = getattr(self.db, name, None)
        if collection is not None:
            return collection
        return self.db[name]
