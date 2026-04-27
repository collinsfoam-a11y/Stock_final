"""Mongo transaction helper for governed write operations."""

from __future__ import annotations

import inspect
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional


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

    started = client.start_session()
    session = await started if inspect.isawaitable(started) else started

    try:
        if not hasattr(session, "start_transaction"):
            yield session
            return

        txn_cm = session.start_transaction()
        if inspect.isawaitable(txn_cm):
            txn_cm = await txn_cm

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
