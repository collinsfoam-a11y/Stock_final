from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.admin_dashboard_api import (
    calculate_completion_percentage,
    count_pending_variances,
)


class _AggregateCursor:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self, _length):
        return list(self._rows)


@pytest.mark.asyncio
async def test_calculate_completion_percentage_counts_unique_locked_items():
    db = MagicMock()
    db.erp_items.count_documents = AsyncMock(return_value=2)
    db.count_lines.count_documents = AsyncMock(return_value=3)
    db.count_lines.aggregate.return_value = _AggregateCursor([{"count": 1}])

    result = await calculate_completion_percentage(db)

    assert result == 50.0


@pytest.mark.asyncio
async def test_count_pending_variances_matches_status_and_approval_status():
    db = MagicMock()

    async def _count_documents(query):
        assert query == {
            "variance": {"$ne": 0},
            "$or": [
                {"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}},
                {"approval_status": "NEEDS_REVIEW"},
            ],
        }
        return 4

    db.count_lines.count_documents = AsyncMock(side_effect=_count_documents)

    result = await count_pending_variances(db)

    assert result == 4
