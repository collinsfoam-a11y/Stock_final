import pytest

from backend.services.data_governance import DataGovernanceService
from backend.tests.utils.in_memory_db import InMemoryCollection, InMemoryDatabase


@pytest.mark.asyncio
async def test_erasure_anonymizes_count_lines_without_deleting_stock_records():
    db = InMemoryDatabase()
    db.data_retention_policies = InMemoryCollection()
    db.data_subject_requests = InMemoryCollection()

    await db.data_subject_requests.insert_one(
        {"_id": "erase-1", "subject_id": "staff1", "status": "pending"}
    )
    await db.users.insert_one({"_id": "staff1", "username": "staff1", "email": "s@example.com"})
    await db.sessions.insert_one({"id": "session-1", "status": "OPEN", "version": 1})
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "session-1",
            "item_code": "ITEM001",
            "counted_qty": 2,
            "counted_by": "staff1",
            "created_by": "staff1",
            "status": "pending",
        }
    )

    service = DataGovernanceService(db)
    result = await service.process_erasure_request("erase-1", processed_by="admin")

    assert result["count_lines_anonymized"] == 1
    assert await db.count_lines.count_documents({}) == 1
    line = await db.count_lines.find_one({"id": "line-1"})
    assert line["counted_by"] == "deleted_user_staff1"
    assert line["created_by"] == "deleted_user_staff1"
    assert line["privacy_erasure_request_id"] == "erase-1"
