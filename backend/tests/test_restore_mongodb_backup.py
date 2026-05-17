import json
from pathlib import Path

import pytest

from backend.scripts.restore_mongodb_backup import restore_collection


class _Result:
    inserted_ids = ["doc-1"]


class _FakeCollection:
    def __init__(self) -> None:
        self.deleted = False
        self.inserted_many = False
        self.inserted_one = False

    async def count_documents(self, _query):
        return 3

    async def delete_many(self, _query):
        self.deleted = True

    async def insert_many(self, _docs):
        self.inserted_many = True
        return _Result()

    async def insert_one(self, _doc):
        self.inserted_one = True
        return _Result()


class _FakeDb:
    def __init__(self) -> None:
        self.collection = _FakeCollection()

    def __getitem__(self, _name: str):
        return self.collection


class _FakeClient:
    def __init__(self) -> None:
        self.db = _FakeDb()

    def __getitem__(self, _name: str):
        return self.db


@pytest.mark.asyncio
async def test_restore_collection_dry_run_does_not_mutate(tmp_path: Path):
    json_file = tmp_path / "safe_collection.json"
    json_file.write_text(json.dumps([{"id": "doc-1"}]), encoding="utf-8")
    client = _FakeClient()

    restored = await restore_collection(
        client, "stock_verification", "safe_collection", json_file, execute=False
    )

    assert restored == 0
    assert client.db.collection.deleted is False
    assert client.db.collection.inserted_many is False
    assert client.db.collection.inserted_one is False


@pytest.mark.asyncio
async def test_restore_collection_blocks_governed_manual_items(tmp_path: Path):
    json_file = tmp_path / "manual_items.json"
    json_file.write_text(json.dumps([{"item_code": "M-1"}]), encoding="utf-8")
    client = _FakeClient()

    restored = await restore_collection(
        client, "stock_verification", "manual_items", json_file, execute=True
    )

    assert restored == 0
    assert client.db.collection.deleted is False
    assert client.db.collection.inserted_many is False
