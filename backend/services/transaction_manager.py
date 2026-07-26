"""Mongo transaction helper for governed write operations."""

from __future__ import annotations

import inspect
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

from pymongo.errors import OperationFailure

logger = logging.getLogger(__name__)


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
        yield None
        return
    if not await _client_supports_transactions(client):
        yield None
        return

    started = client.start_session()
    session = await started if inspect.isawaitable(started) else started

    try:
        if not hasattr(session, "start_transaction"):
            yield session
            return

        try:
            txn_cm = session.start_transaction()
            if inspect.isawaitable(txn_cm):
                txn_cm = await txn_cm
        except Exception as exc:
            if _transaction_not_supported(exc):
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
        yield session
    finally:
        if hasattr(session, "end_session"):
            end_result = session.end_session()
            if inspect.isawaitable(end_result):
                await end_result
