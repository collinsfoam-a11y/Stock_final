"""BL V2 phase-0 server-side flag resolution."""

from __future__ import annotations

import inspect
import hashlib
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, ValidationError, model_validator

from backend.db.runtime import get_db
from backend.services import feature_flags as _feature_flags

FeatureFlag = _feature_flags.FeatureFlag
FeatureState = _feature_flags.FeatureState
BL_V2_COMPARE = getattr(_feature_flags, "BL_V2_COMPARE", "BL_V2_COMPARE")
BL_V2_SHADOW = getattr(_feature_flags, "BL_V2_SHADOW", "BL_V2_SHADOW")
BL_V2_ENFORCE_WRITES = getattr(_feature_flags, "BL_V2_ENFORCE_WRITES", "BL_V2_ENFORCE_WRITES")
BL_V2_GLOBAL_DISABLE = getattr(_feature_flags, "BL_V2_GLOBAL_DISABLE", "BL_V2_GLOBAL_DISABLE")

StableScope = Literal["session", "user", "warehouse", "global"]

_SCOPED_FLAG_KEYS = (
    BL_V2_COMPARE,
    BL_V2_SHADOW,
    BL_V2_ENFORCE_WRITES,
)
_OVERRIDE_SCOPE_PRIORITY: tuple[Literal["session", "user", "warehouse"], ...] = (
    "session",
    "user",
    "warehouse",
)
_SCOPE_PRIORITY: tuple[StableScope, ...] = (*_OVERRIDE_SCOPE_PRIORITY, "global")
_SCOPE_ALIASES: dict[str, tuple[str, ...]] = {
    "request": ("request", "request_id"),
    "session": ("session", "session_id"),
    "user": ("user", "user_id"),
    "warehouse": ("warehouse",),
}


class FlagResolutionError(ValueError):
    """Raised when a mutating write cannot derive a safe flag state."""


class FlagResolution(BaseModel):
    """Normalized, stable BL V2 flag state."""

    compare: bool = False
    shadow: bool = False
    enforce_writes: bool = False
    scope: StableScope

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def validate_combination(self) -> "FlagResolution":
        if self.shadow and not self.compare:
            raise FlagResolutionError("invalid flag combination: shadow requires compare")
        if self.enforce_writes and not self.compare:
            raise FlagResolutionError("invalid flag combination: enforce_writes requires compare")
        if self.enforce_writes and not self.shadow:
            raise FlagResolutionError("invalid flag combination: enforce_writes requires shadow")
        return self


def normalize_flag_resolution(flags: dict[str, Any]) -> FlagResolution:
    """Normalize raw flag output into the locked PR-1 shape."""
    try:
        return FlagResolution(**flags)
    except ValidationError as exc:
        message = "; ".join(error["msg"] for error in exc.errors())
        raise FlagResolutionError(message) from exc


async def resolve_phase0_flags(
    *,
    request_context: Any,
    is_mutation: bool,
    db: Any = None,
) -> FlagResolution:
    """Resolve BL V2 flags for the current request.

    Request-scoped overrides are ignored for mutating calls by contract.
    """

    database = _resolve_database(db)
    flags = await _load_phase0_flags(database)

    resolved_values: dict[str, bool] = {}
    contributing_scopes: list[StableScope] = []
    request_overrides: dict[str, bool] = {}

    for flag_key in _SCOPED_FLAG_KEYS:
        value, stable_scope, request_override = _resolve_flag_value(
            flags.get(flag_key),
            request_context=request_context,
            include_request_scope=not is_mutation,
        )
        resolved_values[flag_key] = value
        if stable_scope is not None:
            contributing_scopes.append(stable_scope)
        if request_override is not None:
            request_overrides[flag_key] = request_override

    scope = _select_scope(contributing_scopes)

    if is_mutation and request_overrides:
        _ = request_overrides  # Explicitly ignored by contract for mutating writes.

    return normalize_flag_resolution(
        {
            "compare": resolved_values[BL_V2_COMPARE],
            "shadow": resolved_values[BL_V2_SHADOW],
            "enforce_writes": resolved_values[BL_V2_ENFORCE_WRITES],
            "scope": scope,
        }
    )


async def is_global_disable_active(*, request_context: Any, db: Any = None) -> bool:
    """Return whether the global kill switch is active."""
    database = _resolve_database(db)
    flag = await _load_flag(database, BL_V2_GLOBAL_DISABLE)
    if not flag:
        return False

    if flag.state == FeatureState.DISABLED:
        return False
    if flag.state == FeatureState.ENABLED:
        return True

    raise FlagResolutionError("BL_V2_GLOBAL_DISABLE must be globally enabled or disabled")


def _resolve_database(db: Any = None) -> Any:
    return get_db() if db is None else db


async def _load_phase0_flags(db: Any) -> dict[str, Optional[FeatureFlag]]:
    return {key: await _load_flag(db, key) for key in (BL_V2_GLOBAL_DISABLE, *_SCOPED_FLAG_KEYS)}


async def _load_flag(db: Any, key: str) -> Optional[FeatureFlag]:
    collection = getattr(db, "feature_flags", None)
    if collection is None:
        collection = db["feature_flags"]

    result = collection.find_one({"key": key})
    doc = await result if inspect.isawaitable(result) else result
    if not isinstance(doc, dict):
        return None
    if not doc:
        return None

    doc.pop("_id", None)
    try:
        return FeatureFlag(**doc)
    except ValidationError as exc:
        raise FlagResolutionError(f"invalid feature flag document for {key}") from exc


def _resolve_flag_value(
    flag: Optional[FeatureFlag],
    *,
    request_context: Any,
    include_request_scope: bool,
) -> tuple[bool, Optional[StableScope], Optional[bool]]:
    request_override: Optional[bool] = None
    if include_request_scope:
        request_identifier = _context_value(request_context, "request")
        request_override, found = _override_value(flag, "request", request_identifier)
        if found:
            request_override = bool(request_override)

    for scope in _OVERRIDE_SCOPE_PRIORITY:
        identifier = _context_value(request_context, scope)
        override_value, found = _override_value(flag, scope, identifier)
        if found:
            return bool(override_value), scope, request_override

    if request_override is not None:
        return request_override, None, request_override

    return _global_flag_value(flag, request_context), None, request_override


def _override_value(
    flag: Optional[FeatureFlag],
    scope: str,
    identifier: Optional[str],
) -> tuple[Optional[bool], bool]:
    if not flag or not identifier:
        return None, False

    overrides = getattr(flag, "scope_overrides", None) or {}
    for scope_key in _SCOPE_ALIASES[scope]:
        scoped_values = overrides.get(scope_key)
        if isinstance(scoped_values, dict) and identifier in scoped_values:
            return bool(scoped_values[identifier]), True
    return None, False


def _global_flag_value(flag: Optional[FeatureFlag], request_context: Any) -> bool:
    if not flag:
        return False
    if flag.state == FeatureState.DISABLED:
        return False
    if flag.state == FeatureState.ENABLED:
        return True
    if flag.state == FeatureState.USERS:
        username = _context_value(request_context, "user")
        return username in set(flag.allowed_users) if username else False
    if flag.state == FeatureState.ROLES:
        role = getattr(request_context, "role", None)
        return role in set(flag.allowed_roles) if role else False
    if flag.state == FeatureState.PERCENTAGE:
        user_key = _context_value(request_context, "user")
        if not user_key:
            return False
        digest = hashlib.sha256(f"{flag.key}:{user_key}".encode("utf-8")).hexdigest()
        return int(digest[:8], 16) % 100 < flag.percentage
    return False


def _context_value(request_context: Any, scope: str) -> Optional[str]:
    if scope == "request":
        return _normalize_identifier(getattr(request_context, "request_id", None))
    if scope == "session":
        return _normalize_identifier(getattr(request_context, "session_id", None))
    if scope == "warehouse":
        return _normalize_identifier(getattr(request_context, "warehouse", None))
    if scope == "user":
        return _normalize_identifier(
            getattr(request_context, "user_id", None) or getattr(request_context, "username", None)
        )
    raise FlagResolutionError(f"unsupported scope requested: {scope}")


def _normalize_identifier(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _select_scope(contributing_scopes: list[StableScope]) -> StableScope:
    for scope in _SCOPE_PRIORITY:
        if scope in contributing_scopes:
            return scope
    return "global"
