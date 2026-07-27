from unittest.mock import MagicMock

import pytest

from backend.services import canonical_inventory


@pytest.mark.asyncio
async def test_find_duplicate_count_line_scopes_by_session_and_location():
    """DATA-02: duplicate count-line detection must be scoped to the current
    session and location so cross-session/cross-location scans do not collide."""
    db = MagicMock()
    db.count_lines.find = MagicMock()

    class FakeCursor:
        def __init__(self, items):
            self.items = items
            self.index = 0

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self.index >= len(self.items):
                raise StopAsyncIteration
            item = self.items[self.index]
            self.index += 1
            return item

    def fake_find(filter_query):
        assert filter_query["session_id"] == "session-a"
        assert filter_query["item_code"] == "ITEM-1"
        assert filter_query["floor_no"] == "1"
        assert filter_query["rack_no"] == "A1"
        return FakeCursor([])

    db.count_lines.find.side_effect = fake_find

    result = await canonical_inventory.find_duplicate_count_line(
        db,
        {
            "session_id": "session-a",
            "item_code": "ITEM-1",
            "floor_no": "1",
            "rack_no": "A1",
        },
    )

    assert result is None
