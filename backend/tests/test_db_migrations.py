from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.db.migrations import MigrationManager


def _mock_index_cursor(indexes):
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=indexes)
    return cursor


@pytest.mark.asyncio
async def test_authoritative_index_names_reads_from_catalog():
    """Catalog-defined index names (plus _id_) are reported as authoritative."""
    manager = MigrationManager(MagicMock())

    names = await manager._authoritative_index_names("count_lines")

    assert "_id_" in names
    assert "idx_count_line_idempotency" in names
    assert "idx_session_counts" in names
    # A legacy/auto-named index must NOT be considered authoritative.
    assert "session_id_1_item_code_1" not in names


@pytest.mark.asyncio
async def test_drop_legacy_duplicate_indexes_removes_only_non_catalog_indexes():
    """Legacy duplicates are dropped; catalog indexes, _id_ and text indexes are kept."""
    collection = MagicMock()
    collection.list_indexes = MagicMock(
        return_value=_mock_index_cursor(
            [
                {"name": "_id_", "key": {"_id": 1}},
                {"name": "idx_session_counts", "key": {"session_id": 1, "counted_at": -1}},
                {"name": "count_lines.session_id", "key": {"session_id": 1}},  # legacy dup
                {"name": "session_id_1_item_code_1", "key": {"session_id": 1, "item_code": 1}},
                {"name": "idx_text_search", "key": {"_fts": "text", "_ftsx": 1}},  # text index
            ]
        )
    )
    collection.drop_index = AsyncMock()

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)

    manager = MigrationManager(db)
    # Restrict the sweep to a single collection for a deterministic assertion.
    manager._CATALOG_OWNED_COLLECTIONS = ("count_lines",)

    await manager._drop_legacy_duplicate_indexes()

    dropped = {call.args[0] for call in collection.drop_index.await_args_list}
    assert dropped == {"count_lines.session_id", "session_id_1_item_code_1"}
    # _id_, catalog index, and text index must be preserved.
    assert "_id_" not in dropped
    assert "idx_session_counts" not in dropped
    assert "idx_text_search" not in dropped


@pytest.mark.asyncio
async def test_drop_obsolete_serial_indexes_targets_pre_item_id_uniqueness():
    """Obsolete global serial-uniqueness indexes are dropped on each serial collection."""
    manager = MigrationManager(MagicMock())
    manager._drop_index_if_matching = AsyncMock()

    await manager._drop_obsolete_serial_indexes()

    dropped_keys = [call.kwargs["key"] for call in manager._drop_index_if_matching.await_args_list]
    assert [("serial_number", 1)] in dropped_keys
    assert [("item_code", 1), ("serial_number", 1)] in dropped_keys
    assert [("serial_no", 1)] in dropped_keys
    assert [("item_code", 1), ("serial_no", 1)] in dropped_keys
