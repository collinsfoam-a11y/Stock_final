"""
Tests for the simplified HSN suggestion workflow (BSR Step 10): item name/
category/subcategory/brand/barcode/photo-caption based suggestions only --
never a direct image classification, never auto-applied, never GST-
authoritative. See docs/BSR_REMEDIATION_STATUS.md Step 10.
"""

from typing import Any

import pytest
from backend.services.hsn_directory_service import HsnDirectoryService
from backend.services.hsn_suggestion_service import (
    MCP_INDIA_STACK_SOURCE,
    HsnSuggestionService,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase

ADMIN_USER = {"username": "admin1", "role": "admin"}


class _FakeMcpSourceWithGstRate:
    """Test double proving the pluggable MCP source interface carries a GST
    rate through end to end when the underlying data actually has one --
    the real shipped static seed intentionally has none (see module
    docstring in hsn_suggestion_service.py), so this is exercised here."""

    def search(self, tokens: set[str], *, limit: int = 10) -> list[dict[str, Any]]:
        if "led" in tokens or "lamp" in tokens:
            return [
                {
                    "hsn_sac": "853950",
                    "description": "Light-emitting diode lamps",
                    "gst_percentage": 12.0,
                    "keywords": ["led", "lamp", "lighting", "bulb"],
                }
            ]
        return []


async def _seed_directory_record(db, **overrides):
    service = HsnDirectoryService(db)
    defaults = dict(
        hsn_sac="853950",
        description="Light-emitting diode lamps",
        gst_percentage=12.0,
        source="GST_PORTAL_DIRECTORY",
        keywords=["led", "lamp", "lighting", "bulb"],
        current_user=ADMIN_USER,
    )
    defaults.update(overrides)
    await service.import_record(**defaults)


@pytest.mark.asyncio
async def test_suggest_by_exact_item_name_keyword():
    db = InMemoryDatabase()
    await _seed_directory_record(db)
    service = HsnSuggestionService(db)

    result = await service.suggest(
        item_code="ITM-1", item_name="LED Bulb 9W", category="Electrical"
    )

    assert result["item_code"] == "ITM-1"
    assert any(s["hsn_sac"] == "853950" for s in result["suggestions"])


@pytest.mark.asyncio
async def test_suggest_by_fuzzy_description_match():
    db = InMemoryDatabase()
    await _seed_directory_record(
        db,
        hsn_sac="732393",
        description="Stainless steel kitchenware and household utensils",
        gst_percentage=None,
        source="OPEN_SOURCE_SEED",
        keywords=["kitchen", "steel", "utensil", "cookware"],
    )
    service = HsnSuggestionService(db)

    result = await service.suggest(
        item_code="ITM-2", item_name="Steel Cooking Pot", category="Kitchenware"
    )

    assert any(s["hsn_sac"] == "732393" for s in result["suggestions"])


@pytest.mark.asyncio
async def test_official_source_ranks_above_mcp_seed():
    db = InMemoryDatabase()
    await _seed_directory_record(db, source="GST_PORTAL_DIRECTORY")
    await _seed_directory_record(
        db,
        hsn_sac="853951",
        description="LED lamp variant",
        source="OPEN_SOURCE_SEED",
        gst_percentage=None,
        keywords=["lamp"],  # sparser signal, typical of an unverified open-source seed
    )
    service = HsnSuggestionService(db)

    result = await service.suggest(
        item_code="ITM-3", item_name="LED Bulb", category="Lighting Lamp"
    )

    official = next(s for s in result["suggestions"] if s["hsn_sac"] == "853950")
    non_official = next(s for s in result["suggestions"] if s["hsn_sac"] == "853951")
    assert official["confidence"] >= non_official["confidence"]
    assert result["suggestions"][0]["source"] == "GST_PORTAL_DIRECTORY"


@pytest.mark.asyncio
async def test_mcp_india_stack_suggestion_includes_description():
    db = InMemoryDatabase()
    service = HsnSuggestionService(db, enabled_sources=frozenset({"mcp_india_stack"}))

    result = await service.suggest(
        item_code="ITM-4", item_name="LED Bulb 9W screw base", category="Lighting"
    )

    mcp_suggestions = [s for s in result["suggestions"] if s["source"] == MCP_INDIA_STACK_SOURCE]
    assert mcp_suggestions
    assert mcp_suggestions[0]["description"]


@pytest.mark.asyncio
async def test_mcp_india_stack_suggestion_includes_gst_rate_when_available():
    db = InMemoryDatabase()
    service = HsnSuggestionService(
        db, mcp_source=_FakeMcpSourceWithGstRate(), enabled_sources=frozenset({"mcp_india_stack"})
    )

    result = await service.suggest(item_code="ITM-5", item_name="LED Lamp", category="Lighting")

    assert result["suggestions"][0]["gst_percentage"] == 12.0


@pytest.mark.asyncio
async def test_mcp_india_stack_suggestion_never_marked_official_api_verified():
    db = InMemoryDatabase()
    service = HsnSuggestionService(db, enabled_sources=frozenset({"mcp_india_stack"}))

    result = await service.suggest(item_code="ITM-6", item_name="LED Bulb", category="Lighting")

    for suggestion in result["suggestions"]:
        assert suggestion["verification_status"] != "OFFICIAL_API_VERIFIED"
        assert suggestion["verification_status"] == "SUGGESTED_NOT_VERIFIED"
        assert suggestion["is_official_source"] is False
        assert suggestion["requires_manual_verification"] is True


@pytest.mark.asyncio
async def test_photo_caption_match_boosts_confidence_without_auto_approving():
    db = InMemoryDatabase()
    await _seed_directory_record(db)
    service = HsnSuggestionService(db)

    name_only = await service.suggest(item_code="ITM-7", item_name="Bulb", category="Lighting")
    name_and_photo = await service.suggest(
        item_code="ITM-7",
        item_name="Bulb",
        category="Lighting",
        photo_caption="small LED light bulb",
    )

    conf_name_only = next(
        s["confidence"] for s in name_only["suggestions"] if s["hsn_sac"] == "853950"
    )
    conf_with_photo = next(
        s["confidence"] for s in name_and_photo["suggestions"] if s["hsn_sac"] == "853950"
    )
    assert conf_with_photo >= conf_name_only
    for s in name_and_photo["suggestions"]:
        assert s["verification_status"] == "SUGGESTED_NOT_VERIFIED"


@pytest.mark.asyncio
async def test_photo_only_match_has_capped_confidence():
    db = InMemoryDatabase()
    await _seed_directory_record(db)
    service = HsnSuggestionService(db)

    # No item_name/category overlap at all -- only the photo caption matches.
    result = await service.suggest(
        item_code="ITM-8",
        item_name="Widget",
        category="Uncategorized",
        photo_caption="LED lamp bulb lighting",
    )

    matches = [s for s in result["suggestions"] if s["hsn_sac"] == "853950"]
    assert matches
    assert matches[0]["confidence"] <= 0.5


@pytest.mark.asyncio
async def test_missing_hsn_returns_suggestions_not_auto_fix():
    db = InMemoryDatabase()
    await db.erp_items.insert_one({"item_code": "ITM-9", "hsn_code": None})
    await _seed_directory_record(db)
    service = HsnSuggestionService(db)

    result = await service.suggest(item_code="ITM-9", item_name="LED Bulb", category="Lighting")

    assert result["suggestions"]  # returned suggestions, not a silent fix
    stored = await db.erp_items.find_one({"item_code": "ITM-9"})
    assert stored["hsn_code"] is None  # never mutated
