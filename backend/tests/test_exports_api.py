import base64
from datetime import datetime, timezone

import pytest
from bson import ObjectId

from fastapi.encoders import jsonable_encoder

from backend.api.exports_api import download_export_result, list_export_results


class _FakeExportResultsCollection:
    def __init__(self, document=None, documents=None):
        self.document = document
        self.documents = documents or ([] if document is None else [document])

    async def find_one(self, query):
        if query.get("_id") == self.document["_id"]:
            return self.document
        return None

    def find(self, query):
        class _FakeCursor:
            def __init__(self, docs):
                self._docs = docs

            def sort(self, *_args, **_kwargs):
                return self

            def limit(self, _limit):
                return self

            async def to_list(self, length=100):
                return list(self._docs)[:length]

        return _FakeCursor(self.documents)


class _FakeDb:
    def __init__(self, document=None, documents=None):
        self.export_results = _FakeExportResultsCollection(document=document, documents=documents)


class _FakeExportService:
    def __init__(self, document=None, documents=None):
        self.db = _FakeDb(document=document, documents=documents)


@pytest.mark.asyncio
async def test_download_export_result_decodes_xlsx_payload():
    export_id = ObjectId()
    binary_payload = b"xlsx-binary-content"
    document = {
        "_id": export_id,
        "file_content": base64.b64encode(binary_payload).decode("utf-8"),
        "file_extension": "xlsx",
        "schedule_name": "weekly_export",
        "created_at": datetime(2026, 3, 15, 8, 30, tzinfo=timezone.utc),
    }

    response = await download_export_result(
        str(export_id),
        export_service=_FakeExportService(document),
        current_user={"username": "admin"},
    )

    assert (
        response.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert response.body == binary_payload
    assert 'filename="weekly_export_' in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith('.xlsx"')


@pytest.mark.asyncio
async def test_download_export_result_returns_csv_content_as_text():
    export_id = ObjectId()
    csv_payload = "name,count\nwidget,2\n"
    document = {
        "_id": export_id,
        "file_content": csv_payload,
        "file_extension": "csv",
        "schedule_name": "daily_counts",
        "created_at": datetime(2026, 3, 15, 8, 30, tzinfo=timezone.utc),
    }

    response = await download_export_result(
        str(export_id),
        export_service=_FakeExportService(document),
        current_user={"username": "admin"},
    )

    assert response.media_type == "text/csv"
    assert response.body == csv_payload.encode("utf-8")
    assert response.headers["content-disposition"].endswith('.csv"')


@pytest.mark.asyncio
async def test_list_export_results_stringifies_schedule_id_for_json_encoding():
    schedule_id = ObjectId()
    export_id = ObjectId()
    documents = [
        {
            "_id": export_id,
            "schedule_id": schedule_id,
            "schedule_name": "Daily Sessions",
            "export_type": "sessions",
            "format": "csv",
            "file_extension": "csv",
            "file_content": "a,b\n1,2\n",
            "row_count": 1,
            "created_at": datetime(2026, 3, 15, 8, 30, tzinfo=timezone.utc),
            "size_bytes": 10,
        }
    ]

    response = await list_export_results(
        schedule_id=str(schedule_id),
        limit=10,
        export_service=_FakeExportService(documents=documents),
        current_user={"username": "admin"},
    )

    encoded = jsonable_encoder(response)
    results = encoded["data"]["results"]
    assert results[0]["id"] == str(export_id)
    assert results[0]["schedule_id"] == str(schedule_id)
    assert results[0]["has_content"] is True
