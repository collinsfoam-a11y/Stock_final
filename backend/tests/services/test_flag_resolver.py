from types import SimpleNamespace
from typing import Any

import pytest

from backend.services.flag_resolver import (
    BL_V2_GLOBAL_DISABLE,
    is_global_disable_active,
    resolve_phase0_flags,
)


class BoolRaisingCollection:
    def __init__(self, documents: dict[str, dict[str, Any]] | None = None) -> None:
        self.documents = documents or {}

    def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return self.documents.get(query["key"])


class BoolRaisingDatabase:
    def __init__(self, documents: dict[str, dict[str, Any]] | None = None) -> None:
        self.feature_flags = BoolRaisingCollection(documents)

    def __bool__(self) -> bool:
        raise NotImplementedError("Database objects do not implement truth value testing")

    def __getitem__(self, name: str) -> BoolRaisingCollection:
        if name != "feature_flags":
            raise KeyError(name)
        return self.feature_flags


@pytest.mark.asyncio
async def test_resolve_phase0_flags_accepts_pymongo_database_without_truth_testing() -> None:
    database = BoolRaisingDatabase()
    request_context = SimpleNamespace(
        request_id="request-1",
        session_id="session-1",
        user_id="user-1",
        username="worker",
        role="staff",
        warehouse="WH1",
    )

    result = await resolve_phase0_flags(
        request_context=request_context,
        is_mutation=True,
        db=database,
    )

    assert result.compare is False
    assert result.shadow is False
    assert result.enforce_writes is False
    assert result.scope == "global"


@pytest.mark.asyncio
async def test_is_global_disable_active_accepts_pymongo_database_without_truth_testing() -> None:
    database = BoolRaisingDatabase(
        {
            BL_V2_GLOBAL_DISABLE: {
                "key": BL_V2_GLOBAL_DISABLE,
                "name": "BL V2 global disable",
                "state": "enabled",
                "enabled": True,
            }
        }
    )

    result = await is_global_disable_active(
        request_context=SimpleNamespace(user_id="user-1"),
        db=database,
    )

    assert result is True
