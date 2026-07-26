from __future__ import annotations

import pytest
from pymongo.errors import OperationFailure

from backend.services.transaction_manager import mongo_transaction


class _StandaloneSession:
    def __init__(self) -> None:
        self.ended = False

    def start_transaction(self):
        raise OperationFailure(
            "Transaction numbers are only allowed on a replica set member or mongos",
            20,
        )

    def end_session(self):
        self.ended = True


class _StandaloneClient:
    def __init__(self) -> None:
        self.session = _StandaloneSession()

    def start_session(self):
        return self.session


class _HelloStandaloneAdmin:
    async def command(self, name: str):
        assert name == "hello"
        return {"ok": 1}


class _HelloStandaloneClient:
    def __init__(self) -> None:
        self.admin = _HelloStandaloneAdmin()
        self.started = False

    def start_session(self):
        self.started = True
        raise AssertionError("start_session should not be called on standalone topology")


@pytest.mark.asyncio
async def test_mongo_transaction_falls_back_to_none_when_transactions_unsupported():
    client = _StandaloneClient()

    async with mongo_transaction(client) as tx:
        assert tx is None

    assert client.session.ended is True


@pytest.mark.asyncio
async def test_mongo_transaction_skips_session_when_hello_indicates_standalone():
    client = _HelloStandaloneClient()

    async with mongo_transaction(client) as tx:
        assert tx is None

    assert client.started is False
