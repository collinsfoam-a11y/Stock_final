"""
Tests for the local HSN/SAC directory (BSR Step 10): a source-tracked
suggestion seed, never an authoritative GST compliance source. See
docs/BSR_REMEDIATION_STATUS.md Step 10 for the full source-trust policy.
"""

import pytest
from backend.services.hsn_directory_service import HsnDirectoryError, HsnDirectoryService
from backend.tests.utils.in_memory_db import InMemoryDatabase

ADMIN_USER = {"username": "admin1", "role": "admin"}


@pytest.mark.asyncio
async def test_import_official_gst_portal_directory_record():
    db = InMemoryDatabase()
    service = HsnDirectoryService(db)

    record = await service.import_record(
        hsn_sac="853950",
        description="Light-emitting diode lamps",
        gst_percentage=12.0,
        source="GST_PORTAL_DIRECTORY",
        source_url="https://gstcouncil.gov.in",
        current_user=ADMIN_USER,
    )

    assert record["is_official_source"] is True
    stored = await db.hsn_directory.find_one(
        {"hsn_sac": "853950", "source": "GST_PORTAL_DIRECTORY"}
    )
    assert stored is not None
    assert stored["is_official_source"] is True

    audit_entry = await db.audit_logs.find_one(
        {"details.hsn_sac": "853950", "details.source": "GST_PORTAL_DIRECTORY"}
    )
    assert audit_entry is not None
    assert audit_entry["event_type"] == "HSN_DIRECTORY_RECORD_IMPORTED"


@pytest.mark.asyncio
async def test_import_mcp_india_stack_seed_record_as_non_official():
    db = InMemoryDatabase()
    service = HsnDirectoryService(db)

    record = await service.import_record(
        hsn_sac="731815",
        description="OTHER SCREWS AND BOLTS, WHETHER OR NOT WITH THEIR NUTS OR WASHERS",
        source="MCP_INDIA_STACK_SEED",
        source_url="https://github.com/rehan1020/MCP-India-Stack",
        current_user=ADMIN_USER,
    )

    assert record["is_official_source"] is False
    assert record["source"] == "MCP_INDIA_STACK_SEED"


@pytest.mark.asyncio
async def test_rejects_unknown_source():
    db = InMemoryDatabase()
    service = HsnDirectoryService(db)

    with pytest.raises(HsnDirectoryError):
        await service.import_record(
            hsn_sac="123456", description="X", source="RANDOM_SOURCE", current_user=ADMIN_USER
        )


@pytest.mark.asyncio
async def test_reimporting_same_source_refreshes_without_touching_other_sources():
    db = InMemoryDatabase()
    service = HsnDirectoryService(db)

    await service.import_record(
        hsn_sac="853950",
        description="Old description",
        source="MCP_INDIA_STACK_SEED",
        current_user=ADMIN_USER,
    )
    await service.import_record(
        hsn_sac="853950",
        description="Light-emitting diode lamps",
        gst_percentage=12.0,
        source="GST_PORTAL_DIRECTORY",
        current_user=ADMIN_USER,
    )
    # Re-import the MCP seed source again -- must not touch the GST_PORTAL_DIRECTORY record.
    await service.import_record(
        hsn_sac="853950",
        description="Updated MCP description",
        source="MCP_INDIA_STACK_SEED",
        current_user=ADMIN_USER,
    )

    mcp_record = await db.hsn_directory.find_one(
        {"hsn_sac": "853950", "source": "MCP_INDIA_STACK_SEED"}
    )
    official_record = await db.hsn_directory.find_one(
        {"hsn_sac": "853950", "source": "GST_PORTAL_DIRECTORY"}
    )

    assert mcp_record["description"] == "Updated MCP description"
    assert official_record["description"] == "Light-emitting diode lamps"
    assert official_record["gst_percentage"] == 12.0


@pytest.mark.asyncio
async def test_search_matches_by_keyword():
    db = InMemoryDatabase()
    service = HsnDirectoryService(db)
    await service.import_record(
        hsn_sac="853950",
        description="Light-emitting diode lamps",
        source="GST_PORTAL_DIRECTORY",
        keywords=["led", "lamp", "lighting", "bulb"],
        current_user=ADMIN_USER,
    )
    await service.import_record(
        hsn_sac="731815",
        description="Other screws and bolts",
        source="MCP_INDIA_STACK_SEED",
        current_user=ADMIN_USER,
    )

    results = await service.search("led bulb")

    assert len(results) == 1
    assert results[0]["hsn_sac"] == "853950"
