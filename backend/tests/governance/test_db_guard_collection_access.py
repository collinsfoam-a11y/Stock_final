import pytest

from backend.services.governance_guard import (
    GovernanceViolation,
    install_db_write_guards,
    write_authority,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_db_guard_blocks_bracket_collection_writes_without_authority():
    db = InMemoryDatabase()
    install_db_write_guards(db)

    with pytest.raises(GovernanceViolation, match="Direct DB write forbidden"):
        await db["count_lines"].insert_one({"id": "line-1"})

    with pytest.raises(GovernanceViolation, match="Direct DB write forbidden"):
        await db["recount_requests"].insert_one({"id": "recount-1"})

    with pytest.raises(GovernanceViolation, match="Direct DB write forbidden"):
        await db["physical_batches"].insert_one({"id": "batch-1"})

    with pytest.raises(GovernanceViolation, match="Direct DB write forbidden"):
        await db["canonical_serials"].insert_one({"id": "serial-1"})


@pytest.mark.asyncio
async def test_db_guard_allows_bracket_collection_writes_with_authority():
    db = InMemoryDatabase()
    install_db_write_guards(db)

    with write_authority("CountLineWriteService"):
        await db["count_lines"].insert_one({"id": "line-2"})

    with write_authority("SessionLifecycleService"):
        await db["recount_requests"].insert_one({"id": "recount-2"})

    with write_authority("UnknownItemService"):
        await db["unknown_items"].insert_one({"id": "unknown-1"})

    with write_authority("PhysicalBatchService"):
        await db["physical_batches"].insert_one({"id": "batch-2"})

    with write_authority("CanonicalSerialService"):
        await db["canonical_serials"].insert_one({"id": "serial-2"})


@pytest.mark.asyncio
async def test_db_guard_rejects_cross_authority_collection_writes():
    db = InMemoryDatabase()
    install_db_write_guards(db)

    with pytest.raises(GovernanceViolation, match="cannot mutate count_lines"):
        with write_authority("SessionLifecycleService"):
            await db["count_lines"].insert_one({"id": "line-3"})

    with pytest.raises(GovernanceViolation, match="cannot mutate unknown_items"):
        with write_authority("CountLineWriteService"):
            await db["unknown_items"].insert_one({"id": "unknown-2"})
