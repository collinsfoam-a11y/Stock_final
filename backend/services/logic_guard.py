from __future__ import annotations
"""Centralized BL V2 phase-0 execution safety guard."""


import logging
from collections.abc import Mapping
from typing import Any, Literal, Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, model_validator

from backend.services.flag_resolver import (
    FlagResolution,
    FlagResolutionError,
    is_global_disable_active,
    resolve_phase0_flags,
)
from backend.services.session_lifecycle_service import SessionLifecycleService

logger = logging.getLogger(__name__)

LogicVersion = Literal["v1", "v2"]
ScopeSource = Literal["global", "warehouse", "user_id", "session_id"]


class RequestContext(BaseModel):
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    warehouse: Optional[str] = None
    endpoint_name: str
    operation_name: str

    model_config = ConfigDict(extra="forbid")


class LogicExecutionContext(BaseModel):
    logic_version: LogicVersion
    scope_source: ScopeSource
    is_kill_switch_active: bool
    should_persist_pin: bool = False
    pin_logic_version: Optional[LogicVersion] = None
    pin_scope_source: Optional[ScopeSource] = None
    resolved_flags: dict[str, Any]

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_pin_contract(self) -> "LogicExecutionContext":
        if self.should_persist_pin:
            if self.pin_logic_version is None or self.pin_scope_source is None:
                raise ValueError("pin persistence requires both pin fields")
        elif self.pin_logic_version is not None or self.pin_scope_source is not None:
            raise ValueError("pin fields must be omitted when persistence is disabled")
        if self.is_kill_switch_active and self.logic_version != "v1":
            raise ValueError("kill switch must force runtime v1")
        return self


class LogicGuardConflictError(RuntimeError):
    """Raised when a write cannot safely execute under phase-0 rules."""

    def __init__(
        self,
        reason: str,
        *,
        request_context: RequestContext,
        resolved_flags: Optional[dict[str, Any]] = None,
        stored_pin: Optional[dict[str, Any]] = None,
        attempted_logic: Optional[str] = None,
    ) -> None:
        super().__init__(reason)
        self.reason = reason
        self.request_context = request_context
        self.resolved_flags = resolved_flags or {}
        self.stored_pin = stored_pin
        self.attempted_logic = attempted_logic or "phase0_shared_write_path"

    def to_log_payload(self) -> dict[str, Any]:
        return {
            "session_id": self.request_context.session_id,
            "resolved_flags": self.resolved_flags,
            "stored_pin": self.stored_pin,
            "attempted_logic": self.attempted_logic,
            "rejection_reason": self.reason,
        }


def build_request_context(
    *,
    request: Request | None,
    current_user: Optional[dict[str, Any]],
    endpoint_name: str,
    operation_name: str,
    session_id: Optional[str] = None,
    warehouse: Optional[str] = None,
) -> RequestContext:
    request_id = None
    if request is not None:
        headers = getattr(request, "headers", None)
        if isinstance(headers, Mapping):
            request_id = headers.get("x-request-id") or headers.get("x-correlation-id")
        if not request_id:
            state = getattr(request, "state", None)
            state_request_id = getattr(state, "request_id", None) if state is not None else None
            if isinstance(state_request_id, str):
                request_id = state_request_id

    user_id = None
    username = None
    role = None
    if current_user:
        username = current_user.get("username")
        user_id = (
            current_user.get("id")
            or current_user.get("_id")
            or current_user.get("user_id")
            or username
        )
        role = current_user.get("role")

    return RequestContext(
        request_id=str(request_id).strip() if request_id else None,
        session_id=str(session_id).strip() if session_id else None,
        user_id=str(user_id).strip() if user_id else None,
        username=str(username).strip() if username else None,
        role=str(role).strip() if role else None,
        warehouse=str(warehouse).strip() if warehouse else None,
        endpoint_name=endpoint_name,
        operation_name=operation_name,
    )


async def resolve_and_enforce_logic(
    *,
    session,
    request_context: RequestContext,
    is_mutation: bool,
    db: Any = None,
) -> LogicExecutionContext:
    """Resolve runtime execution and pin persistence instructions."""

    resolved = await resolve_phase0_flags(
        request_context=request_context,
        is_mutation=is_mutation,
        db=db,
    )
    kill_switch_active = await is_global_disable_active(
        request_context=request_context,
        db=db,
    )
    resolved_flags = resolved.model_dump()

    stored_pin = _extract_stored_pin(
        session,
        request_context=request_context,
        resolved_flags=resolved_flags,
    )
    if stored_pin:
        return LogicExecutionContext(
            logic_version="v1" if kill_switch_active else stored_pin["logic_version"],
            scope_source=stored_pin["logic_scope_source"],
            is_kill_switch_active=kill_switch_active,
            resolved_flags=resolved_flags,
        )

    target_logic_version = _target_logic_version(resolved)
    target_scope_source = _scope_to_pin_source(resolved.scope)

    if not is_mutation:
        return LogicExecutionContext(
            logic_version="v1" if kill_switch_active else target_logic_version,
            scope_source=target_scope_source,
            is_kill_switch_active=kill_switch_active,
            resolved_flags=resolved_flags,
        )

    pin_logic_version = "v1" if kill_switch_active else target_logic_version
    return LogicExecutionContext(
        logic_version=pin_logic_version,
        scope_source=target_scope_source,
        is_kill_switch_active=kill_switch_active,
        should_persist_pin=True,
        pin_logic_version=pin_logic_version,
        pin_scope_source=target_scope_source,
        resolved_flags=resolved_flags,
    )


async def enforce_session_logic(
    *,
    db,
    session,
    request_context: RequestContext,
    is_mutation: bool = True,
) -> LogicExecutionContext:
    """Resolve, validate, log, and persist logic pinning for a session mutation."""

    try:
        context = await resolve_and_enforce_logic(
            session=session,
            request_context=request_context,
            is_mutation=is_mutation,
            db=db,
        )
        if is_mutation and session is not None:
            await persist_pin_if_needed(db=db, session=session, context=context)
        return context
    except LogicGuardConflictError as exc:
        logger.warning("BL V2 logic guard rejected request", extra=exc.to_log_payload())
        raise HTTPException(status_code=409, detail=exc.reason) from exc
    except FlagResolutionError as exc:
        payload = {
            "session_id": request_context.session_id,
            "resolved_flags": {},
            "stored_pin": _maybe_stored_pin(session),
            "attempted_logic": "phase0_shared_write_path",
            "rejection_reason": str(exc),
        }
        logger.warning("BL V2 flag resolution rejected request", extra=payload)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "BL V2 logic guard failed",
            extra={
                "session_id": request_context.session_id,
                "operation": request_context.operation_name,
            },
        )
        raise HTTPException(status_code=500, detail="BL V2 logic guard failure") from exc


async def persist_pin_if_needed(*, db, session, context: LogicExecutionContext) -> None:
    if not context.should_persist_pin:
        return

    session_id = _session_identifier(session)
    if not session_id:
        return

    lifecycle_service = SessionLifecycleService(db)
    await lifecycle_service.persist_logic_pin(
        session_id=session_id,
        logic_version=context.pin_logic_version,
        logic_scope_source=context.pin_scope_source,
    )

    if isinstance(session, dict):
        session["logic_version"] = context.pin_logic_version
        session["logic_scope_source"] = context.pin_scope_source
    else:
        setattr(session, "logic_version", context.pin_logic_version)
        setattr(session, "logic_scope_source", context.pin_scope_source)


def apply_pin_to_new_session(session, context: LogicExecutionContext) -> None:
    if not context.should_persist_pin:
        return
    setattr(session, "logic_version", context.pin_logic_version)
    setattr(session, "logic_scope_source", context.pin_scope_source)


def _extract_stored_pin(
    session: Any,
    *,
    request_context: RequestContext,
    resolved_flags: dict[str, Any],
) -> Optional[dict[str, ScopeSource | LogicVersion]]:
    if not session:
        return None

    logic_version = _read_field(session, "logic_version")
    logic_scope_source = _read_field(session, "logic_scope_source")

    if logic_version is None and logic_scope_source is None:
        return None
    if logic_version is None or logic_scope_source is None:
        raise LogicGuardConflictError(
            "missing pin on subsequent write",
            request_context=request_context,
            resolved_flags=resolved_flags,
            stored_pin={
                "logic_version": logic_version,
                "logic_scope_source": logic_scope_source,
            },
        )
    if logic_version not in {"v1", "v2"} or logic_scope_source not in {
        "global",
        "warehouse",
        "user_id",
        "session_id",
    }:
        raise LogicGuardConflictError(
            "invalid stored session pin",
            request_context=request_context,
            resolved_flags=resolved_flags,
            stored_pin={
                "logic_version": logic_version,
                "logic_scope_source": logic_scope_source,
            },
        )

    return {
        "logic_version": logic_version,
        "logic_scope_source": logic_scope_source,
    }


def _maybe_stored_pin(session: Any) -> Optional[dict[str, Any]]:
    if not session:
        return None
    return {
        "logic_version": _read_field(session, "logic_version"),
        "logic_scope_source": _read_field(session, "logic_scope_source"),
    }


def _read_field(session: Any, field: str) -> Any:
    if isinstance(session, dict):
        return session.get(field)
    return getattr(session, field, None)


def _target_logic_version(resolved_flags: FlagResolution) -> LogicVersion:
    if resolved_flags.compare or resolved_flags.shadow or resolved_flags.enforce_writes:
        return "v2"
    return "v1"


def _scope_to_pin_source(scope: str) -> ScopeSource:
    mapping: dict[str, ScopeSource] = {
        "global": "global",
        "warehouse": "warehouse",
        "user": "user_id",
        "session": "session_id",
    }
    return mapping[scope]


def _session_identifier(session: Any) -> Optional[str]:
    for key in ("id", "session_id"):
        value = _read_field(session, key)
        if value:
            normalized = str(value).strip()
            if normalized:
                return normalized
    return None
