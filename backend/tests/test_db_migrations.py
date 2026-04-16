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
