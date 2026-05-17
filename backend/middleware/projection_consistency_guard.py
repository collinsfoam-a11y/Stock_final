"""Projection consistency guard for dashboard read endpoints.

This middleware performs a lightweight version/count parity check before
serving critical read endpoints and retries transient projection-stale reads
instead of immediately returning 503.
"""

from __future__ import annotations

import asyncio
from collections import deque
import json
import logging
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from backend.db.runtime import get_db
from backend.services.lock_service import LockService, ResourceLockedError
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger("backend.projection_consistency_guard")

_TARGET_PATHS = {
    "/api/dashboard/stats",
    "/api/dashboard/filters/options",
    "/api/admin/dashboard/kpis",
}


@dataclass
class ProjectionState:
    session_count: int
    projection_count: int
    session_version: float | None
    projection_version: float | None
    session_version_field: str | None
    projection_version_field: str | None
    missing_session_ids: list[str]

    @property
    def version_gap(self) -> float | None:
        if self.session_version is None or self.projection_version is None:
            return None
        return self.session_version - self.projection_version

    @property
    def has_gap(self) -> bool:
        if self.projection_count < self.session_count:
            return True
        gap = self.version_gap
        return bool(gap is not None and gap > 0)


def _to_epoch(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.timestamp()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            pass
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    return None


def _extract_version(doc: dict[str, Any] | None) -> tuple[float | None, str | None]:
    if not doc:
        return None, None

    preferred = (
        "version",
        "session_version",
        "projection_version",
        "event_version",
        "source_version",
        "source_updated_at",
        "updated_at",
        "last_event_ts",
        "snapshot_ts",
        "completed_at",
        "started_at",
    )
    for field in preferred:
        if field in doc:
            parsed = _to_epoch(doc.get(field))
            if parsed is not None:
                return parsed, field
    return None, None


class ProjectionConsistencyGuardMiddleware(BaseHTTPMiddleware):
    """Enforce projection freshness and absorb transient stale-window failures."""

    _repair_lock = asyncio.Lock()
    _last_repair_ts = 0.0
    _guard_checks_count = 0
    _guard_trigger_count = 0
    _guard_repair_count = 0
    _repair_wait_count = 0
    _visibility_samples_ms: deque[int] = deque(maxlen=1000)
    _last_visibility_summary_ts = 0.0
    _outcome_window: deque[tuple[float, bool]] = deque(maxlen=5000)
    _circuit_open_until_ts = 0.0

    def __init__(self, app):
        super().__init__(app)
        self.enabled = os.getenv("PROJECTION_GUARD_ENABLED", "true").lower() == "true"
        # Guard is fallback-only by default. Write path should keep projections current.
        self.auto_repair = os.getenv("PROJECTION_GUARD_AUTO_REPAIR", "false").lower() == "true"
        self.max_retries = max(0, int(os.getenv("PROJECTION_GUARD_MAX_RETRIES", "30")))
        self.retry_delay_ms = max(50, int(os.getenv("PROJECTION_GUARD_RETRY_DELAY_MS", "250")))
        self.repair_cooldown_seconds = max(
            1.0,
            float(os.getenv("PROJECTION_GUARD_REPAIR_COOLDOWN_SECONDS", "10")),
        )
        self.trigger_alert_threshold_pct = max(
            0.0,
            float(os.getenv("PROJECTION_GUARD_ALERT_THRESHOLD_PCT", "0.5")),
        )
        self.visibility_p95_sla_ms = max(
            1,
            int(os.getenv("PROJECTION_GUARD_VISIBILITY_P95_SLA_MS", "100")),
        )
        self.visibility_p99_sla_ms = max(
            self.visibility_p95_sla_ms,
            int(os.getenv("PROJECTION_GUARD_VISIBILITY_P99_SLA_MS", "300")),
        )
        self.visibility_max_sla_ms = max(
            self.visibility_p99_sla_ms,
            int(os.getenv("PROJECTION_GUARD_VISIBILITY_MAX_SLA_MS", "500")),
        )
        self.visibility_summary_interval_seconds = max(
            1.0,
            float(os.getenv("PROJECTION_GUARD_VISIBILITY_SUMMARY_INTERVAL_SECONDS", "30")),
        )
        self.repair_wait_timeout_ms = max(
            100,
            int(os.getenv("PROJECTION_GUARD_REPAIR_WAIT_TIMEOUT_MS", "5000")),
        )
        self.repair_lock_ttl_seconds = max(
            30,
            int(os.getenv("PROJECTION_GUARD_REPAIR_LOCK_TTL_SECONDS", "90")),
        )
        self.circuit_enabled = (
            os.getenv("PROJECTION_GUARD_CIRCUIT_ENABLED", "true").lower() == "true"
        )
        self.circuit_window_seconds = max(
            5.0,
            float(os.getenv("PROJECTION_GUARD_CIRCUIT_WINDOW_SECONDS", "60")),
        )
        self.circuit_min_samples = max(
            1,
            int(os.getenv("PROJECTION_GUARD_CIRCUIT_MIN_SAMPLES", "20")),
        )
        self.circuit_open_seconds = max(
            1.0,
            float(os.getenv("PROJECTION_GUARD_CIRCUIT_OPEN_SECONDS", "45")),
        )
        self.circuit_failure_threshold_pct = max(
            0.0,
            float(os.getenv("PROJECTION_GUARD_CIRCUIT_FAILURE_THRESHOLD_PCT", "1.0")),
        )
        self.repair_lock_key = os.getenv(
            "PROJECTION_GUARD_REPAIR_LOCK_KEY",
            "projection_guard_repair_global",
        )
        self.repair_lock_owner = f"pid-{os.getpid()}"
        self.root = Path(__file__).resolve().parents[2]
        self.report_dir = self.root / ".agent" / "reports"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not self.enabled or request.method != "GET" or request.url.path not in _TARGET_PATHS:
            return await call_next(request)
        if self._is_circuit_open():
            logger.error(
                "projection_guard_circuit_open path=%s open_until_ts=%s",
                sanitize_for_logging(request.url.path),
                ProjectionConsistencyGuardMiddleware._circuit_open_until_ts,
            )
            return self._build_circuit_open_response(request.url.path)

        ProjectionConsistencyGuardMiddleware._guard_checks_count += 1
        state = await self._collect_state()
        self._log_visibility_lag(state, request.url.path)

        # Version/count guard before read availability.
        if state.has_gap:
            ProjectionConsistencyGuardMiddleware._guard_trigger_count += 1
            trigger_rate = (
                ProjectionConsistencyGuardMiddleware._guard_trigger_count
                / max(ProjectionConsistencyGuardMiddleware._guard_checks_count, 1)
            ) * 100.0
            logger.warning(
                "projection_guard_triggered path=%s session_count=%s projection_count=%s "
                "guard_trigger_count=%s guard_repair_count=%s guard_trigger_rate_pct=%.3f "
                "failing_session_ids=%s",
                sanitize_for_logging(request.url.path),
                state.session_count,
                state.projection_count,
                ProjectionConsistencyGuardMiddleware._guard_trigger_count,
                ProjectionConsistencyGuardMiddleware._guard_repair_count,
                trigger_rate,
                [sanitize_for_logging(sid) for sid in state.missing_session_ids[:20]],
            )
            if trigger_rate > self.trigger_alert_threshold_pct:
                logger.error(
                    "projection_guard_trigger_rate_high rate_pct=%.3f threshold_pct=%.3f",
                    trigger_rate,
                    self.trigger_alert_threshold_pct,
                )

            if self.auto_repair:
                did_repair = await self._repair_once(state.missing_session_ids)
                logger.warning(
                    "projection_guard_repair_invoked path=%s did_repair=%s guard_repair_count=%s",
                    sanitize_for_logging(request.url.path),
                    did_repair,
                    ProjectionConsistencyGuardMiddleware._guard_repair_count,
                )
                state = await self._collect_state()
                self._log_visibility_lag(state, request.url.path)

        response = await call_next(request)
        if response.status_code != 503:
            self._record_outcome(False)
            return response

        body_payload = self._decode_response_json(response)
        if not self._is_projection_stale_503(body_payload):
            self._record_outcome(False)
            return response

        # Retry stale-window reads until ready or timeout.
        for _ in range(self.max_retries):
            await asyncio.sleep(self.retry_delay_ms / 1000.0)
            retry_response = await call_next(request)
            if retry_response.status_code != 503:
                self._record_outcome(False)
                return retry_response
            retry_payload = self._decode_response_json(retry_response)
            if not self._is_projection_stale_503(retry_payload):
                self._record_outcome(False)
                return retry_response
            response = retry_response
            body_payload = retry_payload

        final_state = await self._collect_state()
        self._augment_failure_payload(body_payload, final_state, request.url.path)
        self._record_outcome(True)
        logger.error(
            "projection_canary_failure path=%s missing_session_ids=%s",
            sanitize_for_logging(request.url.path),
            [sanitize_for_logging(sid) for sid in final_state.missing_session_ids[:20]],
        )
        return JSONResponse(body_payload, status_code=503)

    async def _collect_state(self) -> ProjectionState:
        db = get_db()
        active_filter = {"archived": {"$ne": True}}
        session_count = await db.sessions.count_documents(active_filter)
        projection_count = await db.session_dashboard_projection.count_documents(active_filter)

        session_doc = await db.sessions.find_one(
            active_filter,
            {"_id": 0, "id": 1, "version": 1, "updated_at": 1, "completed_at": 1, "started_at": 1},
            sort=[("updated_at", -1), ("completed_at", -1), ("started_at", -1)],
        )
        projection_doc = await db.session_dashboard_projection.find_one(
            active_filter,
            {
                "_id": 0,
                "session_id": 1,
                "version": 1,
                "projection_version": 1,
                "source_updated_at": 1,
                "updated_at": 1,
                "last_event_ts": 1,
            },
            sort=[("source_updated_at", -1), ("updated_at", -1), ("last_event_ts", -1)],
        )

        session_version, session_field = _extract_version(session_doc)
        projection_version, projection_field = _extract_version(projection_doc)

        # For operator visibility, include specific missing sessions (first N).
        session_ids = await db.sessions.distinct("id", active_filter)
        projection_ids = set(
            await db.session_dashboard_projection.distinct("session_id", active_filter)
        )
        missing = []
        for sid in session_ids:
            if not sid:
                continue
            sid_text = str(sid)
            if sid_text not in projection_ids:
                missing.append(sid_text)
            if len(missing) >= 50:
                break

        return ProjectionState(
            session_count=session_count,
            projection_count=projection_count,
            session_version=session_version,
            projection_version=projection_version,
            session_version_field=session_field,
            projection_version_field=projection_field,
            missing_session_ids=missing,
        )

    def _log_visibility_lag(self, state: ProjectionState, path: str) -> None:
        gap = state.version_gap
        write_to_visibility_ms = int(max(0.0, gap or 0.0) * 1000) if gap is not None else None
        logger.info(
            "projection_visibility path=%s session_count=%s projection_count=%s "
            "session_version=%s(%s) projection_version=%s(%s) version_gap=%s "
            "write_to_projection_visibility_ms=%s missing_session_ids=%s",
            sanitize_for_logging(path),
            state.session_count,
            state.projection_count,
            state.session_version,
            sanitize_for_logging(str(state.session_version_field)),
            state.projection_version,
            sanitize_for_logging(str(state.projection_version_field)),
            gap,
            write_to_visibility_ms,
            [sanitize_for_logging(sid) for sid in state.missing_session_ids[:10]],
        )
        if write_to_visibility_ms is not None:
            ProjectionConsistencyGuardMiddleware._visibility_samples_ms.append(
                write_to_visibility_ms
            )
            self._emit_visibility_sla_summary()

    async def _repair_once(self, missing_session_ids: list[str]) -> bool:
        # Wait for in-flight repair instead of piling up duplicate repair runs.
        if self._repair_lock.locked():
            ProjectionConsistencyGuardMiddleware._repair_wait_count += 1
            wait_started = time.time()
            while self._repair_lock.locked():
                elapsed_ms = (time.time() - wait_started) * 1000.0
                if elapsed_ms >= self.repair_wait_timeout_ms:
                    logger.warning(
                        "projection_guard_repair_wait_timeout elapsed_ms=%s missing_session_ids=%s",
                        int(elapsed_ms),
                        [sanitize_for_logging(sid) for sid in missing_session_ids[:20]],
                    )
                    return False
                await asyncio.sleep(0.05)
            logger.info(
                "projection_guard_repair_wait_completed elapsed_ms=%s wait_count=%s",
                int((time.time() - wait_started) * 1000.0),
                ProjectionConsistencyGuardMiddleware._repair_wait_count,
            )

        async with self._repair_lock:
            now = time.time()
            if now - self._last_repair_ts < self.repair_cooldown_seconds:
                return False
            if not await self._acquire_distributed_repair_lock():
                logger.warning(
                    "projection_guard_repair_distributed_lock_held missing_session_ids=%s",
                    [sanitize_for_logging(sid) for sid in missing_session_ids[:20]],
                )
                return False
            self._last_repair_ts = now
            try:
                await asyncio.to_thread(self._run_projection_repair_cycle)
                ProjectionConsistencyGuardMiddleware._guard_repair_count += 1
                return True
            finally:
                await self._release_distributed_repair_lock()

    async def _acquire_distributed_repair_lock(self) -> bool:
        try:
            lock_service = LockService(get_db())
            await lock_service.acquire_lock(
                self.repair_lock_key,
                self.repair_lock_owner,
                ttl_seconds=self.repair_lock_ttl_seconds,
            )
            return True
        except ResourceLockedError:
            return False
        except Exception as exc:
            logger.warning(
                "projection_guard_repair_lock_error action=acquire error=%s",
                sanitize_for_logging(str(exc)),
            )
            # Fail open to preserve availability in case lock infrastructure is unavailable.
            return True

    async def _release_distributed_repair_lock(self) -> None:
        try:
            lock_service = LockService(get_db())
            await lock_service.release_lock(self.repair_lock_key, self.repair_lock_owner)
        except Exception as exc:
            logger.warning(
                "projection_guard_repair_lock_error action=release error=%s",
                sanitize_for_logging(str(exc)),
            )

    def _emit_visibility_sla_summary(self) -> None:
        now = time.time()
        if (
            now - ProjectionConsistencyGuardMiddleware._last_visibility_summary_ts
            < self.visibility_summary_interval_seconds
        ):
            return
        ProjectionConsistencyGuardMiddleware._last_visibility_summary_ts = now
        samples = list(ProjectionConsistencyGuardMiddleware._visibility_samples_ms)
        if not samples:
            return
        sorted_samples = sorted(samples)
        p95 = self._percentile(sorted_samples, 95.0)
        p99 = self._percentile(sorted_samples, 99.0)
        max_value = sorted_samples[-1]
        logger.info(
            "projection_visibility_sla sample_count=%s p95_ms=%s p99_ms=%s max_ms=%s "
            "target_p95_ms=%s target_p99_ms=%s target_max_ms=%s",
            len(sorted_samples),
            p95,
            p99,
            max_value,
            self.visibility_p95_sla_ms,
            self.visibility_p99_sla_ms,
            self.visibility_max_sla_ms,
        )
        if (
            p95 > self.visibility_p95_sla_ms
            or p99 > self.visibility_p99_sla_ms
            or max_value > self.visibility_max_sla_ms
        ):
            logger.error(
                "projection_visibility_sla_breached sample_count=%s p95_ms=%s p99_ms=%s max_ms=%s "
                "target_p95_ms=%s target_p99_ms=%s target_max_ms=%s",
                len(sorted_samples),
                p95,
                p99,
                max_value,
                self.visibility_p95_sla_ms,
                self.visibility_p99_sla_ms,
                self.visibility_max_sla_ms,
            )

    @staticmethod
    def _percentile(sorted_values: list[int], pct: float) -> int:
        if not sorted_values:
            return 0
        rank = int(round((pct / 100.0) * (len(sorted_values) - 1)))
        rank = max(0, min(rank, len(sorted_values) - 1))
        return int(sorted_values[rank])

    def _record_outcome(self, stale_failure: bool) -> None:
        now = time.time()
        outcomes = ProjectionConsistencyGuardMiddleware._outcome_window
        outcomes.append((now, stale_failure))
        window_start = now - self.circuit_window_seconds
        while outcomes and outcomes[0][0] < window_start:
            outcomes.popleft()

        sample_count = len(outcomes)
        failure_count = sum(1 for _, failure in outcomes if failure)
        failure_pct = (failure_count / sample_count) * 100.0 if sample_count else 0.0
        if stale_failure and self.circuit_enabled and sample_count >= self.circuit_min_samples:
            if failure_pct >= self.circuit_failure_threshold_pct:
                open_until = now + self.circuit_open_seconds
                ProjectionConsistencyGuardMiddleware._circuit_open_until_ts = max(
                    ProjectionConsistencyGuardMiddleware._circuit_open_until_ts,
                    open_until,
                )
                logger.error(
                    "projection_guard_circuit_trip sample_count=%s failure_count=%s "
                    "failure_pct=%.3f threshold_pct=%.3f open_seconds=%.1f",
                    sample_count,
                    failure_count,
                    failure_pct,
                    self.circuit_failure_threshold_pct,
                    self.circuit_open_seconds,
                )

    def _is_circuit_open(self) -> bool:
        if not self.circuit_enabled:
            return False
        return time.time() < ProjectionConsistencyGuardMiddleware._circuit_open_until_ts

    def _build_circuit_open_response(self, path: str) -> JSONResponse:
        return JSONResponse(
            {
                "detail": {
                    "code": "PROJECTION_INCONSISTENT",
                    "reason": "CIRCUIT_OPEN",
                    "message": (
                        "Projection read path is temporarily blocked due to repeated "
                        "consistency failures."
                    ),
                    "guard_path": path,
                    "circuit_open_until_ts": ProjectionConsistencyGuardMiddleware._circuit_open_until_ts,
                    "guard_trigger_count": ProjectionConsistencyGuardMiddleware._guard_trigger_count,
                    "guard_repair_count": ProjectionConsistencyGuardMiddleware._guard_repair_count,
                    "guard_repair_wait_count": ProjectionConsistencyGuardMiddleware._repair_wait_count,
                }
            },
            status_code=503,
        )

    def _run_projection_repair_cycle(self) -> None:
        self.report_dir.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.root)

        command_sets = [
            (
                "backfill_session_dashboard_projection",
                [
                    sys.executable,
                    *self._resolve_script_command("backfill_session_dashboard_projection"),
                    "--execute",
                    "--output",
                    str(self.report_dir / "projection-guard-session-repair.json"),
                ],
            ),
            (
                "backfill_item_projection_collections",
                [
                    sys.executable,
                    *self._resolve_script_command("backfill_item_projection_collections"),
                    "--execute",
                    "--output",
                    str(self.report_dir / "projection-guard-item-repair.json"),
                ],
            ),
            (
                "validate_projection_parity",
                [
                    sys.executable,
                    *self._resolve_script_command("validate_projection_parity"),
                    "--output",
                    str(self.report_dir / "projection-guard-parity.json"),
                ],
            ),
        ]

        for label, cmd in command_sets:
            started = time.time()
            try:
                # Security validation before execution
                if not cmd or cmd[0] != sys.executable:
                    raise ValueError("Command must start with sys.executable")
                script_path = Path(cmd[1]).resolve()
                scripts_dir = (self.root / "backend" / "scripts").resolve()
                if not str(script_path).startswith(str(scripts_dir)):
                    raise ValueError("Script path must be within backend/scripts directory")

                result = subprocess.run(
                    cmd,
                    cwd=str(self.root),
                    env=env,
                    check=True,
                    shell=False,
                    capture_output=True,
                    text=True,
                    timeout=90,
                )
            except Exception as exc:
                logger.error(
                    "projection_guard_repair_error step=%s error=%s",
                    sanitize_for_logging(label),
                    sanitize_for_logging(str(exc)),
                )
                continue
            duration_ms = int((time.time() - started) * 1000)
            logger.info(
                "projection_guard_repair_step step=%s rc=%s duration_ms=%s stdout=%s stderr=%s",
                sanitize_for_logging(label),
                result.returncode,
                duration_ms,
                sanitize_for_logging((result.stdout or "").strip()[:600]),
                sanitize_for_logging((result.stderr or "").strip()[:600]),
            )

    def _resolve_script_command(self, base_name: str) -> list[str]:
        if not re.match(r"^[a-zA-Z0-9_]+$", base_name):
            raise ValueError(f"Invalid script name: {base_name}")
        py_path = self.root / "backend" / "scripts" / f"{base_name}.py"
        if py_path.exists():
            return [str(py_path)]

        cache_dir = self.root / "backend" / "scripts" / "__pycache__"
        preferred = f"{base_name}.cpython-{sys.version_info.major}{sys.version_info.minor}.pyc"
        preferred_path = cache_dir / preferred
        if preferred_path.exists():
            return [str(preferred_path)]

        fallback = sorted(cache_dir.glob(f"{base_name}.cpython-*.pyc"))
        if fallback:
            return [str(fallback[-1])]

        # Let subprocess fail with a clear command.
        return [str(py_path)]

    def _decode_response_json(self, response: Response) -> dict[str, Any]:
        body_bytes = getattr(response, "body", b"") or b""
        if not body_bytes:
            return {}
        try:
            return json.loads(body_bytes.decode("utf-8"))
        except Exception:
            return {}

    def _is_projection_stale_503(self, payload: dict[str, Any]) -> bool:
        detail = payload.get("detail") if isinstance(payload, dict) else None
        if not isinstance(detail, dict):
            return False
        return detail.get("code") == "PROJECTION_INCONSISTENT" and detail.get("reason") in {
            "STALE_DATA",
            "LAGGING_DATA",
            "VERSION_LAG",
        }

    def _augment_failure_payload(
        self,
        payload: dict[str, Any],
        state: ProjectionState,
        path: str,
    ) -> None:
        detail = payload.setdefault("detail", {})
        if not isinstance(detail, dict):
            payload["detail"] = {"message": str(detail)}
            detail = payload["detail"]

        detail.setdefault("code", "PROJECTION_INCONSISTENT")
        detail["reason"] = "VERSION_LAG"
        detail["message"] = (
            "Projection is not yet at the required version for this dashboard read path."
        )
        detail["guard_path"] = path
        detail["session_count"] = state.session_count
        detail["projection_count"] = state.projection_count
        detail["session_version"] = state.session_version
        detail["projection_version"] = state.projection_version
        detail["version_gap"] = state.version_gap
        detail["failing_session_ids"] = state.missing_session_ids[:20]
        detail["guard_trigger_count"] = ProjectionConsistencyGuardMiddleware._guard_trigger_count
        detail["guard_repair_count"] = ProjectionConsistencyGuardMiddleware._guard_repair_count
        detail["guard_repair_wait_count"] = ProjectionConsistencyGuardMiddleware._repair_wait_count
