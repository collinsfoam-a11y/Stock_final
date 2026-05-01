"""Append-only audit store for shadow deployment decisions."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from backend.config import settings


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_ts(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed


@dataclass(frozen=True)
class DecisionAuditRecord:
    ts: str
    kind: str
    decision: str
    reason: str
    metrics: dict[str, Any]
    payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ts": self.ts,
            "kind": self.kind,
            "decision": self.decision,
            "reason": self.reason,
            "metrics": self.metrics,
            "payload": self.payload,
        }


class DeploymentDecisionStore:
    """Persist last N decision records as JSONL for operator auditability."""

    def __init__(
        self,
        path: str | Path | None = None,
        *,
        history_limit: int | None = None,
        max_bytes: int | None = None,
        retention_days: int | None = None,
    ) -> None:
        self.path = Path(path or settings.DEPLOYMENT_DECISION_STORE_PATH)
        if not self.path.is_absolute():
            self.path = Path.cwd() / self.path
        self.history_limit = int(history_limit or settings.DEPLOYMENT_DECISION_HISTORY_LIMIT)
        self.max_bytes = int(max_bytes or settings.DEPLOYMENT_DECISION_MAX_BYTES)
        self.retention_days = int(retention_days or settings.DEPLOYMENT_DECISION_RETENTION_DAYS)

    def record(
        self,
        *,
        kind: str,
        decision: str,
        reason: str,
        metrics: dict[str, Any],
        payload: dict[str, Any],
    ) -> DecisionAuditRecord:
        record = DecisionAuditRecord(
            ts=_now_iso(),
            kind=kind,
            decision=decision,
            reason=reason,
            metrics=metrics,
            payload=payload,
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._rotate_if_needed()
        self._prune_old_rotations()
        records = [*self.load_recent(), record.to_dict()][-self.history_limit :]
        with self.path.open("w", encoding="utf-8") as handle:
            for item in records:
                handle.write(json.dumps(item, sort_keys=True, separators=(",", ":")))
                handle.write("\n")
        return record

    def _rotate_if_needed(self) -> None:
        if not self.path.exists():
            return
        stat = self.path.stat()
        modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).date()
        today = datetime.now(timezone.utc).date()
        if stat.st_size < self.max_bytes and modified == today:
            return
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        rotated = self.path.with_name(f"{self.path.stem}.{stamp}{self.path.suffix}")
        self.path.rename(rotated)

    def _prune_old_rotations(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        pattern = f"{self.path.stem}.*{self.path.suffix}"
        for candidate in self.path.parent.glob(pattern):
            if candidate == self.path:
                continue
            try:
                modified = datetime.fromtimestamp(candidate.stat().st_mtime, tz=timezone.utc)
            except OSError:
                continue
            if modified < cutoff:
                try:
                    candidate.unlink()
                except OSError:
                    continue

    def load_recent(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        records: list[dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    records.append(parsed)
        return records[-self.history_limit :]

    def last_stage_change_ts(self) -> Optional[float]:
        for record in reversed(self.load_recent()):
            kind = record.get("kind")
            payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
            rollout = payload.get("rollout") if isinstance(payload.get("rollout"), dict) else {}
            rollback = payload.get("rollback") if isinstance(payload.get("rollback"), dict) else {}
            rollout_ready = kind == "rollout_plan" and rollout.get("status") in {
                "READY",
                "COMPLETE",
            }
            rollback_ready = kind == "rollback_plan" and rollback.get("triggered") is True
            if rollout_ready or rollback_ready:
                parsed_ts = _parse_ts(record.get("ts"))
                if parsed_ts is not None:
                    return parsed_ts.timestamp()
        return None
