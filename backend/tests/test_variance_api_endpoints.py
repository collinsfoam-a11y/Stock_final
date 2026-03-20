"""
Tests for the variance API functions.
Uses direct function calls rather than HTTP client to avoid auth complexity.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# GET /variance-reasons endpoint function
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_variance_reasons_structure():
    """get_variance_reasons returns expected structure."""
    from backend.api.variance_api import get_variance_reasons

    mock_user = {"username": "sup1", "role": "supervisor"}
    result = await get_variance_reasons(current_user=mock_user)

    assert "reasons" in result
    assert isinstance(result["reasons"], list)
    assert len(result["reasons"]) > 0


@pytest.mark.asyncio
async def test_get_variance_reasons_has_required_ids():
    """Variance reasons include common categories."""
    from backend.api.variance_api import get_variance_reasons

    mock_user = {"username": "sup1", "role": "supervisor"}
    result = await get_variance_reasons(current_user=mock_user)
    ids = [r["id"] for r in result["reasons"]]

    assert "damaged" in ids
    assert "theft" in ids
    assert "other" in ids


@pytest.mark.asyncio
async def test_get_variance_reasons_each_has_id_and_label():
    """Each reason has both id and label fields."""
    from backend.api.variance_api import get_variance_reasons

    mock_user = {"username": "sup1", "role": "supervisor"}
    result = await get_variance_reasons(current_user=mock_user)

    for reason in result["reasons"]:
        assert "id" in reason, f"Reason missing 'id': {reason}"
        assert "label" in reason, f"Reason missing 'label': {reason}"
        assert isinstance(reason["id"], str)
        assert isinstance(reason["label"], str)


@pytest.mark.asyncio
async def test_get_variance_reasons_includes_expired():
    from backend.api.variance_api import get_variance_reasons

    mock_user = {"username": "sup1", "role": "supervisor"}
    result = await get_variance_reasons(current_user=mock_user)
    ids = [r["id"] for r in result["reasons"]]

    assert "expired" in ids


@pytest.mark.asyncio
async def test_get_variance_reasons_includes_misplaced():
    from backend.api.variance_api import get_variance_reasons

    mock_user = {"username": "sup1", "role": "supervisor"}
    result = await get_variance_reasons(current_user=mock_user)
    ids = [r["id"] for r in result["reasons"]]

    assert "misplaced" in ids


# ---------------------------------------------------------------------------
# GET /variance/trend endpoint function
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_variance_trend_default_days():
    """get_variance_trend returns 7 data points with defaults."""
    from backend.api.variance_api import get_variance_trend
    from backend.db.runtime import set_db

    mock_db = MagicMock()
    mock_collection = MagicMock()
    mock_collection.aggregate.return_value.to_list = AsyncMock(return_value=[])
    mock_db.variances = mock_collection
    mock_user = {"username": "sup1", "role": "supervisor"}

    set_db(mock_db)
    try:
        result = await get_variance_trend(days=7, current_user=mock_user)
    finally:
        set_db(None)

    assert "data" in result
    assert len(result["data"]) == 7


@pytest.mark.asyncio
async def test_get_variance_trend_30_days():
    """Requesting 30 days gives 30 data points."""
    from backend.api.variance_api import get_variance_trend
    from backend.db.runtime import set_db

    mock_db = MagicMock()
    mock_collection = MagicMock()
    mock_collection.aggregate.return_value.to_list = AsyncMock(return_value=[])
    mock_db.variances = mock_collection
    mock_user = {"username": "sup1", "role": "supervisor"}

    set_db(mock_db)
    try:
        result = await get_variance_trend(days=30, current_user=mock_user)
    finally:
        set_db(None)

    assert len(result["data"]) == 30


@pytest.mark.asyncio
async def test_get_variance_trend_fills_missing_dates():
    """Dates not in the DB result should appear with count=0."""
    from backend.api.variance_api import get_variance_trend
    from backend.db.runtime import set_db

    mock_db = MagicMock()
    mock_collection = MagicMock()
    # Only one data point returned from DB
    mock_collection.aggregate.return_value.to_list = AsyncMock(
        return_value=[{"_id": "2024-01-01", "count": 3}]
    )
    mock_db.variances = mock_collection
    mock_user = {"username": "sup1", "role": "supervisor"}

    set_db(mock_db)
    try:
        result = await get_variance_trend(days=7, current_user=mock_user)
    finally:
        set_db(None)

    # All 7 entries should be present
    assert len(result["data"]) == 7
    counts = [d["count"] for d in result["data"]]
    # At least one 0-filled entry
    assert 0 in counts


@pytest.mark.asyncio
async def test_get_variance_trend_data_point_structure():
    """Each data point has date and count."""
    from backend.api.variance_api import get_variance_trend
    from backend.db.runtime import set_db

    mock_db = MagicMock()
    mock_collection = MagicMock()
    mock_collection.aggregate.return_value.to_list = AsyncMock(return_value=[])
    mock_db.variances = mock_collection
    mock_user = {"username": "sup1", "role": "supervisor"}

    set_db(mock_db)
    try:
        result = await get_variance_trend(days=3, current_user=mock_user)
    finally:
        set_db(None)

    for point in result["data"]:
        assert "date" in point
        assert "count" in point
