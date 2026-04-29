from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.db.migrations import MigrationManager


def _mock_index_cursor(indexes):
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=indexes)
    return cursor


@pytest.mark.asyncio
async def test_create_index_safe_skips_matching_existing_sparse_unique_index():
    collection = MagicMock()
    collection.list_indexes = MagicMock(
        return_value=_mock_index_cursor(
            [
                {
                    "name": "token_hash_1",
                    "key": {"token_hash": 1},
                    "unique": True,
                    "sparse": True,
                }
            ]
        )
    )
    collection.create_index = AsyncMock()

    manager = MigrationManager(MagicMock())

    await manager._create_index_safe(
        collection,
        "token_hash",
        unique=True,
        sparse=True,
        name="refresh_tokens.token_hash",
    )

    collection.create_index.assert_not_called()


@pytest.mark.asyncio
async def test_create_index_safe_creates_sparse_unique_index_when_missing():
    collection = MagicMock()
    collection.list_indexes = MagicMock(return_value=_mock_index_cursor([]))
    collection.create_index = AsyncMock()

    manager = MigrationManager(MagicMock())

    await manager._create_index_safe(
        collection,
        "token_hash",
        unique=True,
        sparse=True,
        name="refresh_tokens.token_hash",
    )

    collection.create_index.assert_awaited_once_with(
        "token_hash",
        unique=True,
        sparse=True,
        name="refresh_tokens.token_hash",
    )


@pytest.mark.asyncio
async def test_ensure_sessions_indexes_ignores_blank_location_keys_in_partial_unique_index():
    db = MagicMock()
    db.sessions = MagicMock()
    manager = MigrationManager(db)
    manager._create_index_safe = AsyncMock()

    await manager._ensure_sessions_indexes()

    manager._create_index_safe.assert_any_await(
        db.sessions,
        [("location_key", 1)],
        unique=True,
        name="sessions.active_location_key",
        partialFilterExpression={
            "status": {"$in": ["OPEN", "ACTIVE", "PAUSED", "RECONCILE"]},
            "location_key": {"$exists": True, "$gt": ""},
        },
    )
