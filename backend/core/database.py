"""Compatibility database module.

This shim preserves historical imports from ``backend.core.database`` while
delegating runtime state to ``backend.db.runtime`` as the single source of truth.
"""

from __future__ import annotations

from typing import Any, Callable

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from backend.config import settings
from backend.db.runtime import get_client as runtime_get_client
from backend.db.runtime import get_db as runtime_get_db
from backend.db.runtime import set_client as runtime_set_client
from backend.db.runtime import set_db as runtime_set_db

# Keep legacy config constants available for compatibility.
mongo_url = settings.MONGO_URL.rstrip("/")
mongo_client_options: dict[str, Any] = {
    "maxPoolSize": 100,
    "minPoolSize": 10,
    "maxIdleTimeMS": 45000,
    "serverSelectionTimeoutMS": 5000,
    "connectTimeoutMS": 20000,
    "socketTimeoutMS": 20000,
    "retryWrites": True,
    "retryReads": True,
}


class _RuntimeProxy:
    """Lazy proxy that forwards access to runtime-managed objects."""

    def __init__(self, getter: Callable[[], Any]) -> None:
        self._getter = getter

    def _target(self) -> Any:
        return self._getter()

    def __getattr__(self, item: str) -> Any:
        return getattr(self._target(), item)

    def __getitem__(self, key: Any) -> Any:
        return self._target()[key]

    def __bool__(self) -> bool:
        try:
            return self._target() is not None
        except RuntimeError:
            return False

    def __repr__(self) -> str:
        try:
            return repr(self._target())
        except RuntimeError:
            return "<RuntimeProxy(uninitialized)>"


def get_db() -> AsyncIOMotorDatabase:
    return runtime_get_db()


def get_client() -> AsyncIOMotorClient:
    return runtime_get_client()


def set_db(db_instance: AsyncIOMotorDatabase) -> None:
    runtime_set_db(db_instance)


def set_client(client_instance: AsyncIOMotorClient) -> None:
    runtime_set_client(client_instance)


# Backwards-compatible module attributes used across legacy code.
db = _RuntimeProxy(get_db)
client = _RuntimeProxy(get_client)
