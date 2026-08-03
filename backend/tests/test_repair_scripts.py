from types import SimpleNamespace

import pytest

from backend.scripts.repair_count_line_item_names import repair_item_names
from backend.scripts.repair_legacy_zero_variance_approvals import (
    _is_legacy_zero_variance_candidate,
)


class _AsyncCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *_args, **_kwargs):
        return self

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self._rows):
            raise StopAsyncIteration
        row = self._rows[self._index]
        self._index += 1
        return row


class _Collection:
    def __init__(self, docs=None, *, find_one_map=None):
        self.docs = list(docs or [])
        self.find_one_map = dict(find_one_map or {})
        self.updated = []

    def find(self, _query):
        return _AsyncCursor(self.docs)

    async def find_one(self, query, _projection=None):
        if "item_code" in query:
            return self.find_one_map.get(("item_code", query["item_code"]))
        if "barcode" in query:
            return self.find_one_map.get(("barcode", query["barcode"]))
        return None

    async def update_one(self, query, update):
        self.updated.append((query, update))
        return SimpleNamespace(modified_count=1)


class _FakeDb:
    def __init__(self, collections):
        self._collections = collections
        self.erp_items = collections["erp_items"]
        self.count_lines = "not-a-collection"

    def __getitem__(self, name):
        return self._collections[name]


@pytest.mark.asyncio
async def test_repair_item_names_uses_collection_getitem_for_user_selected_collections():
    db = _FakeDb(
        {
            "erp_items": _Collection(
                find_one_map={
                    ("item_code", "ITEM-1"): {"item_name": "Resolved Name"},
                }
            ),
            "count_lines": _Collection(
                docs=[
                    {
                        "_id": "doc-1",
                        "session_id": "session-1",
                        "item_code": "ITEM-1",
                        "item_name": "",
                    }
                ]
            ),
        }
    )

    stats = await repair_item_names(db, dry_run=True, collections=("count_lines",))

    assert stats["scanned"] == 1
    assert stats["repairable"] == 1


@pytest.mark.asyncio
async def test_repair_item_names_limit_counts_scanned_candidates_not_repairs():
    db = _FakeDb(
        {
            "erp_items": _Collection(
                find_one_map={
                    ("item_code", "ITEM-2"): {"item_name": "Resolved Name"},
                }
            ),
            "count_lines": _Collection(
                docs=[
                    {
                        "_id": "doc-1",
                        "session_id": "session-1",
                        "item_code": "ITEM-1",
                        "item_name": "",
                    },
                    {
                        "_id": "doc-2",
                        "session_id": "session-1",
                        "item_code": "ITEM-2",
                        "item_name": "",
                    },
                ]
            ),
        }
    )

    stats = await repair_item_names(db, dry_run=True, collections=("count_lines",), limit=1)

    assert stats["scanned"] == 1
    assert stats["repairable"] == 0


def test_zero_variance_repair_skips_finalized_lines():
    assert (
        _is_legacy_zero_variance_candidate(
            {
                "status": "pending",
                "approval_status": "PENDING",
                "variance": 0,
                "finalized_at": "2026-03-22T00:00:00",
            }
        )
        is False
    )
