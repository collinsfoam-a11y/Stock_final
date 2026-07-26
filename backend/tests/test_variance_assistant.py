"""Tests for the AI Variance Assistant (v2.2 Priority 4)."""

from unittest.mock import AsyncMock, Mock

import pytest

from backend.services.variance_assistant import VarianceAssistant


class FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    async def to_list(self, length=None):
        return self._docs


def make_db(*, erp_item=None, history=None, nearby=None, lookalikes=None):
    db = AsyncMock()
    db.erp_items.find_one = AsyncMock(return_value=erp_item)

    def erp_find(query, *_a, **_k):
        if "barcode" in query:
            return FakeCursor(lookalikes or [])
        return FakeCursor(nearby or [])

    db.erp_items.find = Mock(side_effect=erp_find)
    db.count_lines.find = Mock(return_value=FakeCursor(history or []))
    return db


@pytest.mark.asyncio
async def test_zero_variance_reports_no_variance():
    assistant = VarianceAssistant(make_db(erp_item={"item_code": "A", "mrp": 100}))
    result = await assistant.analyze(item_code="A", expected_qty=10, counted_qty=10)

    assert result["variance"] == 0
    assert result["probable_causes"][0]["cause"] == "no_variance"
    assert result["risk_level"] == "low"
    assert result["recommended_action"] == "Approve - no variance."


@pytest.mark.asyncio
async def test_recurring_variance_detected_from_history():
    history = [{"variance": -2}, {"variance": -3}, {"variance": 0}]
    assistant = VarianceAssistant(make_db(erp_item={"item_code": "A", "mrp": 10}, history=history))
    result = await assistant.analyze(item_code="A", expected_qty=10, counted_qty=8)

    causes = [c["cause"] for c in result["probable_causes"]]
    assert "recurring_variance" in causes
    assert "re-sync" in result["recommended_action"]


@pytest.mark.asyncio
async def test_pack_size_multiple_flags_pack_quantity():
    assistant = VarianceAssistant(make_db(erp_item={"item_code": "A", "pack_size": 12, "mrp": 10}))
    result = await assistant.analyze(item_code="A", expected_qty=48, counted_qty=36)

    causes = [c["cause"] for c in result["probable_causes"]]
    assert "pack_quantity" in causes


@pytest.mark.asyncio
async def test_lookalike_barcodes_surface_similar_items():
    assistant = VarianceAssistant(
        make_db(
            erp_item={"item_code": "A", "barcode": "512345", "mrp": 10},
            lookalikes=[{"item_code": "B"}, {"item_code": "C"}],
        )
    )
    result = await assistant.analyze(item_code="A", expected_qty=10, counted_qty=9)

    causes = [c["cause"] for c in result["probable_causes"]]
    assert "similar_barcode" in causes
    assert "B" in result["similar_items"]


@pytest.mark.asyncio
async def test_zero_count_with_expected_stock():
    assistant = VarianceAssistant(make_db(erp_item={"item_code": "A", "mrp": 10}))
    result = await assistant.analyze(item_code="A", expected_qty=5, counted_qty=0)

    causes = [c["cause"] for c in result["probable_causes"]]
    assert "item_not_found" in causes
    assert result["risk_level"] == "high"


@pytest.mark.asyncio
async def test_high_financial_impact_is_high_risk():
    assistant = VarianceAssistant(make_db(erp_item={"item_code": "A", "mrp": 5000}))
    result = await assistant.analyze(item_code="A", expected_qty=100, counted_qty=95)

    assert result["risk_level"] == "high"
    assert "recount" in result["recommended_action"].lower()


@pytest.mark.asyncio
async def test_output_contract_shape():
    assistant = VarianceAssistant(make_db(erp_item={"item_code": "A"}))
    result = await assistant.analyze(item_code="A", expected_qty=10, counted_qty=9)

    for key in (
        "probable_causes",
        "confidence",
        "recommended_action",
        "similar_items",
        "risk_level",
    ):
        assert key in result
    assert isinstance(result["probable_causes"], list)
    assert 0 <= result["confidence"] <= 1
