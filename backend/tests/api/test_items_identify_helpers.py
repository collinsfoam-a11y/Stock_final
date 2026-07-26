import re
import pytest

from backend.api.v2.items import _lookup_identified_items


class _FakeCursor:
    def __init__(self, data):
        self._data = data
        self._limit = None

    def limit(self, value: int):
        self._limit = value
        return self

    async def to_list(self, length=None):
        size = self._limit if self._limit is not None else length
        return self._data[:size]


class _FakeItemsCollection:
    def __init__(self, rows):
        self._rows = rows

    def find(self, query):
        rows = self._rows
        clauses = query.get("$or", [])
        if clauses:
            matched = []
            for row in rows:
                for clause in clauses:
                    field, condition = next(iter(clause.items()))
                    value = str(row.get(field, ""))
                    if "$in" in condition and row.get(field) in condition["$in"]:
                        matched.append(row)
                        break
                    if "$regex" in condition and re.search(
                        condition["$regex"],
                        value,
                        re.IGNORECASE,
                    ):
                        matched.append(row)
                        break
            rows = matched
        return _FakeCursor(rows)


class _FakeDB:
    def __init__(self, rows):
        self.erp_items = _FakeItemsCollection(rows)


@pytest.mark.asyncio
async def test_lookup_identified_items_prefers_exact_barcode_match():
    db = _FakeDB(
        [
            {"_id": "1", "item_code": "ITEM-1", "barcode": "123456", "item_name": "Soap"},
            {"_id": "2", "item_code": "ITEM-2", "barcode": "654321", "item_name": "Oil"},
        ]
    )

    rows, matched_terms = await _lookup_identified_items(db, ["123456"], limit=5)

    assert len(rows) == 1
    assert rows[0]["_id"] == "1"
    assert "123456" in matched_terms


@pytest.mark.asyncio
async def test_lookup_identified_items_handles_empty_identifiers():
    db = _FakeDB([])

    rows, matched_terms = await _lookup_identified_items(db, [], limit=5)

    assert rows == []
    assert matched_terms == []
