"""Mongo transaction helper for governed write operations."""

from __future__ import annotations

import inspect
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from pymongo.errors import OperationFailure

logger = logging.getLogger(__name__)


def _transactions_required() -> bool:
    try:
        from backend.config import settings

        environment = str(getattr(settings, "ENVIRONMENT", "") or "").strip().lower()
    except Exception:
        environment = ""
    environment = environment or os.getenv("ENVIRONMENT", "").strip().lower()
    allow_downgrade = os.getenv("ALLOW_NON_TRANSACTIONAL_GOVERNED_WRITES", "").lower() == "true"
    return environment in {"production", "prod", "staging"} and not allow_downgrade


def _raise_transaction_required(reason: str) -> None:
    raise RuntimeError(
        "CRITICAL: Mongo transactions are required for governed writes in this environment "
        f"({reason}). Configure MongoDB as a replica set or sharded cluster."
    )


def _transaction_not_supported(exc: Exception) -> bool:
    if isinstance(exc, OperationFailure) and getattr(exc, "code", None) == 20:
        return True
    message = str(exc)
    return "Transaction numbers are only allowed on a replica set member or mongos" in message


async def _client_supports_transactions(client: Any) -> bool:
    admin_db = getattr(client, "admin", None)
    command = getattr(admin_db, "command", None)
    if command is None:
        return True

    try:
        hello_result = command("hello")
        hello = await hello_result if inspect.isawaitable(hello_result) else hello_result
    except Exception:
        return True

    if not isinstance(hello, dict):
        return True

    if hello.get("msg") == "isdbgrid":
        return True
    if hello.get("setName"):
        return True
    return False


@asynccontextmanager
async def mongo_transaction(client: Any) -> AsyncIterator[Optional[Any]]:
    """
    Open a Mongo transaction when supported, otherwise yield a no-op session.

    This keeps local tests and in-memory execution compatible while preserving
    strict transactional behavior on real Mongo deployments.
    """
    if client is None or not hasattr(client, "start_session"):
        if _transactions_required():
            _raise_transaction_required("client has no session support")
        yield None
        return
    if not await _client_supports_transactions(client):
        if _transactions_required():
            _raise_transaction_required("deployment does not report transaction support")
        yield None
        return

    started = client.start_session()
    session = await started if inspect.isawaitable(started) else started

    try:
        if not hasattr(session, "start_transaction"):
            if _transactions_required():
                _raise_transaction_required("session has no transaction support")
            yield session
            return

        try:
            txn_cm = session.start_transaction()
            if inspect.isawaitable(txn_cm):
                txn_cm = await txn_cm
        except Exception as exc:
            if _transaction_not_supported(exc):
                if _transactions_required():
                    _raise_transaction_required("start_transaction is unsupported")
                logger.debug(
                    "Mongo transactions unsupported on current deployment; using non-transaction path"
                )
                yield None
                return
            raise

        if hasattr(txn_cm, "__aenter__") and hasattr(txn_cm, "__aexit__"):
            async with txn_cm:
                yield session
            return

        if hasattr(txn_cm, "__enter__") and hasattr(txn_cm, "__exit__"):
            with txn_cm:
                yield session
            return

        # Test doubles may expose start_transaction without context manager behavior.
        if _transactions_required():
            _raise_transaction_required("transaction context manager is unavailable")
        yield session
    finally:
        if hasattr(session, "end_session"):
            end_result = session.end_session()
            if inspect.isawaitable(end_result):
                await end_result
