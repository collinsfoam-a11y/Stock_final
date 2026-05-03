"""
Central governance guard for write-path invariants.
"""

from __future__ import annotations

import inspect
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from typing import Any, Callable, Optional

from backend.contracts.states import (
    SESSION_STATES,
    normalize_session_state,
)


class GovernanceViolation(RuntimeError):
    """Raised when a write violates mandatory business invariants."""


_WRITE_AUTHORITY: ContextVar[Optional[str]] = ContextVar(
    "governance_write_authority",
    default=None,
)
AUTHORIZED_WRITE_AUTHORITIES: dict[str, frozenset[str]] = {
    "CountLineWriteService": frozenset({"count_lines"}),
    "SessionLifecycleService": frozenset(
        {
            "sessions",
            "verification_sessions",
            "recount_requests",
            "session_snapshots",
        }
    ),
    "UnknownItemService": frozenset({"unknown_items", "erp_items"}),
    "SQLSyncService": frozenset({"erp_items"}),
    "SyncBatchAPI": frozenset({"item_serials", "count_lines"}),
    "ERPWriteService": frozenset({"erp_items"}),
    "EnrichmentService": frozenset({"erp_items"}),
    "SyncConflictsService": frozenset({"erp_items"}),
    "SQLVerificationService": frozenset({"erp_items"}),
    "ItemVerificationAPI": frozenset({"erp_items"}),
    "TestSupportAPI": frozenset({"erp_items", "item_serials"}),
    "DBInitialization": frozenset({"erp_items"}),
    "DynamicFieldsService": frozenset(
        {"dynamic_field_definitions", "dynamic_field_values", "erp_items"}
    ),
}
_GUARD_TARGET_COLLECTIONS: tuple[str, ...] = (
    "count_lines",
    "sessions",
    "verification_sessions",
    "recount_requests",
    "session_snapshots",
    "unknown_items",
    "erp_items",
    "item_serials",
    "dynamic_field_definitions",
    "dynamic_field_values",
)
_GUARD_WRITE_METHODS: tuple[str, ...] = (
    "insert_one",
    "insert_many",
    "update_one",
    "update_many",
    "replace_one",
    "delete_one",
    "delete_many",
    "find_one_and_update",
    "find_one_and_replace",
    "find_one_and_delete",
    "bulk_write",
)
_DB_GUARD_INSTALLED_ATTR = "__governance_write_guard_installed__"
_DB_GUARD_PROXIES_ATTR = "__governance_collection_proxies__"
_DB_GUARD_GETITEM_PATCHED_ATTR = "__governance_getitem_patched__"
_DB_GUARD_GETCOLLECTION_PATCHED_ATTR = "__governance_get_collection_patched__"


SESSION_TRANSITIONS: dict[str, set[str]] = {
    "CREATED": {"ACTIVE"},
    "ACTIVE": {"REVIEW"},
    "REVIEW": {"FINALIZED"},
    "FINALIZED": set(),
}


def normalize_session_status(value: Any) -> str:
    return normalize_session_state(value)


def _extract_session_id(context: dict[str, Any]) -> str:
    explicit_id = context.get("session_id")
    if explicit_id:
        return str(explicit_id)

    document = context.get("document")
    if isinstance(document, dict) and document.get("session_id"):
        return str(document["session_id"])

    count_line = context.get("count_line")
    if isinstance(count_line, dict) and count_line.get("session_id"):
        return str(count_line["session_id"])

    return ""


def _extract_context_fields(
    context: dict[str, Any],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    source = context.get("document")
    if not isinstance(source, dict):
        source = context.get("count_line")
    if not isinstance(source, dict):
        source = {}

    location_id = source.get("location_id") or context.get("location_id")
    floor_id = source.get("floor_id") or context.get("floor_id")
    rack_id = source.get("rack_id") or context.get("rack_id")
    return (
        str(location_id).strip() if location_id else None,
        str(floor_id).strip() if floor_id else None,
        str(rack_id).strip() if rack_id else None,
    )


def assert_valid_transition(from_state: str, to_state: str) -> None:
    if from_state not in SESSION_STATES or to_state not in SESSION_STATES:
        raise GovernanceViolation(
            f"CRITICAL: Unsupported canonical transition {from_state} -> {to_state}"
        )
    if to_state not in SESSION_TRANSITIONS.get(from_state, set()):
        raise GovernanceViolation(
            f"CRITICAL: Invalid session transition {from_state} -> {to_state}"
        )


async def assert_valid_write(context: dict[str, Any]) -> dict[str, Any]:
    """
    Validate write invariants for session-scoped operations.

    Required context keys:
    - db: database client
    - session_id or document.session_id

    Optional context keys:
    - session: preloaded session document
    - require_active_session: default True
    - require_full_context: default True
    """

    db = context.get("db")
    if db is None:
        raise GovernanceViolation("CRITICAL: Governance guard requires db in context")

    db_session = context.get("db_session") or context.get("mongo_session")
    kwargs = {"session": db_session} if db_session is not None else {}
    session = context.get("session")
    if session is None:
        session_id = _extract_session_id(context)
        if not session_id:
            raise GovernanceViolation("CRITICAL: Missing session_id for write")
        session = await db.sessions.find_one(
            {"$or": [{"id": session_id}, {"session_id": session_id}]},
            **kwargs,
        )
    if not isinstance(session, dict):
        raise GovernanceViolation("CRITICAL: Session not found")

    canonical_status = normalize_session_status(session.get("status"))
    if session.get("finalized_at") or canonical_status == "FINALIZED":
        raise GovernanceViolation("Session is finalized. Mutation blocked.")

    if context.get("require_active_session", True) and canonical_status != "ACTIVE":
        raise GovernanceViolation(
            f"CRITICAL: Session must be ACTIVE for count-line writes (found {canonical_status})"
        )

    if context.get("require_full_context", True):
        location_id, floor_id, rack_id = _extract_context_fields(context)
        missing = [
            name
            for name, value in (
                ("location_id", location_id),
                ("floor_id", floor_id),
                ("rack_id", rack_id),
            )
            if not value
        ]
        if missing:
            raise GovernanceViolation(
                f"CRITICAL: Missing required context fields: {', '.join(missing)}"
            )

    from_state = context.get("from_state")
    to_state = context.get("to_state")
    if from_state and to_state:
        assert_valid_transition(str(from_state), str(to_state))

    return session


@contextmanager
def write_authority(authority: str):
    token = _WRITE_AUTHORITY.set(str(authority or "").strip() or None)
    try:
        yield
    finally:
        _WRITE_AUTHORITY.reset(token)


def _require_write_authority(operation: str) -> None:
    authority = _WRITE_AUTHORITY.get()
    if authority not in AUTHORIZED_WRITE_AUTHORITIES:
        raise GovernanceViolation(
            f"CRITICAL: Direct DB write forbidden ({operation}). Use domain service."
        )
    collection_name = str(operation or "").split(".", 1)[0].strip()
    if collection_name and collection_name not in AUTHORIZED_WRITE_AUTHORITIES[authority]:
        raise GovernanceViolation(
            "CRITICAL: "
            f"{authority} cannot mutate {collection_name}. Use the collection's canonical domain service."
        )


def _wrap_collection_method(
    collection_name: str,
    method_name: str,
    method: Callable[..., Any],
) -> Callable[..., Any]:
    if getattr(method, "__governance_wrapped__", False):
        return method

    @wraps(method)
    async def _guarded(*args: Any, **kwargs: Any):
        operation = f"{collection_name}.{method_name}"
        _require_write_authority(operation)
        result = method(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    setattr(_guarded, "__governance_wrapped__", True)
    return _guarded


class GovernedCollection:
    """
    Proxy wrapper that blocks direct writes unless an approved write authority
    context is active.
    """

    def __init__(self, collection_name: str, collection: Any) -> None:
        self._collection_name = collection_name
        self._collection = collection

    def __getattr__(self, item: str) -> Any:
        return getattr(self._collection, item)

    def _guard(self, method_name: str) -> None:
        _require_write_authority(f"{self._collection_name}.{method_name}")

    async def insert_one(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("insert_one")
        result = self._collection.insert_one(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def insert_many(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("insert_many")
        result = self._collection.insert_many(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def update_one(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("update_one")
        result = self._collection.update_one(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def update_many(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("update_many")
        result = self._collection.update_many(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def replace_one(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("replace_one")
        result = self._collection.replace_one(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def delete_one(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("delete_one")
        result = self._collection.delete_one(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def delete_many(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("delete_many")
        result = self._collection.delete_many(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def find_one_and_update(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("find_one_and_update")
        result = self._collection.find_one_and_update(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def find_one_and_replace(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("find_one_and_replace")
        result = self._collection.find_one_and_replace(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def find_one_and_delete(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("find_one_and_delete")
        result = self._collection.find_one_and_delete(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result

    async def bulk_write(self, *args: Any, **kwargs: Any) -> Any:
        self._guard("bulk_write")
        result = self._collection.bulk_write(*args, **kwargs)
        if inspect.isawaitable(result):
            return await result
        return result


def _install_collection_proxy(db: Any, collection_name: str, collection: Any) -> Any:
    if isinstance(collection, GovernedCollection):
        return collection

    proxy = GovernedCollection(collection_name, collection)
    try:
        setattr(db, collection_name, proxy)
        return proxy
    except (RuntimeError, TypeError, ValueError, OSError):
        return collection


def _patch_collection_resolvers(db: Any) -> None:
    db_class = db.__class__

    if not getattr(db_class, _DB_GUARD_GETITEM_PATCHED_ATTR, False):
        original_getitem = getattr(db_class, "__getitem__", None)
        if callable(original_getitem):

            def _guarded_getitem(self: Any, name: Any) -> Any:
                proxies = getattr(self, _DB_GUARD_PROXIES_ATTR, {})
                if isinstance(name, str) and name in proxies:
                    return proxies[name]
                return original_getitem(self, name)

            setattr(db_class, "__getitem__", _guarded_getitem)
            setattr(db_class, _DB_GUARD_GETITEM_PATCHED_ATTR, True)

    if not getattr(db_class, _DB_GUARD_GETCOLLECTION_PATCHED_ATTR, False):
        original_get_collection = getattr(db_class, "get_collection", None)
        if callable(original_get_collection):

            def _guarded_get_collection(self: Any, name: Any, *args: Any, **kwargs: Any) -> Any:
                proxies = getattr(self, _DB_GUARD_PROXIES_ATTR, {})
                if isinstance(name, str) and name in proxies and not args and not kwargs:
                    return proxies[name]
                return original_get_collection(self, name, *args, **kwargs)

            setattr(db_class, "get_collection", _guarded_get_collection)
            setattr(db_class, _DB_GUARD_GETCOLLECTION_PATCHED_ATTR, True)


def install_db_write_guards(db: Any) -> Any:
    """
    Install hard guards on direct writes for governance-owned collections.
    """
    if db is None or getattr(db, _DB_GUARD_INSTALLED_ATTR, False):
        return db

    proxies: dict[str, Any] = {}
    for collection_name in _GUARD_TARGET_COLLECTIONS:
        collection = getattr(db, collection_name, None)
        if collection is None:
            continue
        guarded_collection = _install_collection_proxy(db, collection_name, collection)
        proxies[collection_name] = guarded_collection
        for method_name in _GUARD_WRITE_METHODS:
            method = getattr(guarded_collection, method_name, None)
            if not callable(method):
                continue
            guarded = _wrap_collection_method(collection_name, method_name, method)
            setattr(guarded_collection, method_name, guarded)

    setattr(db, _DB_GUARD_PROXIES_ATTR, proxies)
    setattr(db, _DB_GUARD_INSTALLED_ATTR, True)
    _patch_collection_resolvers(db)
    return db


def raise_forbidden_direct_write(operation: str) -> None:
    raise GovernanceViolation(
        f"CRITICAL: Direct DB write forbidden ({operation}). Use domain service."
    )
