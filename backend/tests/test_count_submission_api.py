"""
Tests for count_submission_api.submit_count_line function.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from backend.api.count_submission_api import submit_count_line
from backend.api.schemas_variance import CountLineSubmission


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db(
    count_line=None,
    erp_item=None,
    variance_threshold_config=None,
):
    db = AsyncMock()
    db.count_lines.find_one = AsyncMock(return_value=count_line)
    db.erp_items.find_one = AsyncMock(return_value=erp_item)
    db.variance_threshold_configs.find_one = AsyncMock(
        return_value=variance_threshold_config
    )
    db.variance_threshold_configs.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id="config_id")
    )
    db.count_lines.update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )
    db.variances.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id="variance_id")
    )
    db.activity_logs.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id="activity_id")
    )
    return db


def _count_line(status="draft", item_code="ITEM001", counted_qty=100):
    return {
        "id": "cl-001",
        "item_code": item_code,
        "counted_qty": counted_qty,
        "status": status,
        "barcode": None,
    }


def _erp_item(stock_qty=100, last_cost=50, item_code="ITEM001"):
    return {
        "item_code": item_code,
        "stock_qty": stock_qty,
        "last_cost": last_cost,
        "barcode": "510001",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_count_line_not_found():
    """Returns 404 when count line does not exist."""
    db = _make_db(count_line=None)
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_id="nonexistent",
                submission_data=CountLineSubmission(),
                current_user=user,
            )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_submit_count_line_already_submitted():
    """Returns 400 when count line is already submitted."""
    db = _make_db(count_line=_count_line(status="submitted"))
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_id="cl-001",
                submission_data=CountLineSubmission(),
                current_user=user,
            )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_submit_count_line_already_approved():
    """Returns 400 when count line is already approved."""
    db = _make_db(count_line=_count_line(status="approved"))
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_id="cl-001",
                submission_data=CountLineSubmission(),
                current_user=user,
            )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_submit_count_line_item_not_found():
    """Returns 404 when ERP item is not found."""
    db = _make_db(count_line=_count_line(), erp_item=None)
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_id="cl-001",
                submission_data=CountLineSubmission(),
                current_user=user,
            )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_submit_count_line_no_variance_success():
    """Successful submission when counted qty matches expected."""
    db = _make_db(
        count_line=_count_line(counted_qty=100),
        erp_item=_erp_item(stock_qty=100, last_cost=50),
    )
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        result = await submit_count_line(
            count_id="cl-001",
            submission_data=CountLineSubmission(),
            current_user=user,
        )

    assert result["success"] is True
    assert result["requires_approval"] is False
    assert result["variance_data"]["quantity_variance"] == 0.0


@pytest.mark.asyncio
async def test_submit_count_line_with_variance():
    """Submission with variance returns variance data."""
    db = _make_db(
        count_line=_count_line(counted_qty=110),
        erp_item=_erp_item(stock_qty=100, last_cost=50),
    )
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        result = await submit_count_line(
            count_id="cl-001",
            submission_data=CountLineSubmission(variance_reason="Restock"),
            current_user=user,
        )

    assert result["success"] is True
    assert result["variance_data"]["quantity_variance"] == 10.0


@pytest.mark.asyncio
async def test_submit_updates_count_line_status():
    """After successful submission, the count line status is updated."""
    db = _make_db(
        count_line=_count_line(counted_qty=100),
        erp_item=_erp_item(stock_qty=100),
    )
    user = {"username": "staff1", "role": "staff"}

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr("backend.api.count_submission_api.get_db", lambda: db)
        await submit_count_line(
            count_id="cl-001",
            submission_data=CountLineSubmission(),
            current_user=user,
        )

    # update_one should have been called
    db.count_lines.update_one.assert_called()


# ---------------------------------------------------------------------------
# CountLineSubmission schema tests
# ---------------------------------------------------------------------------

def test_count_line_submission_default():
    submission = CountLineSubmission()
    assert submission.variance_reason is None


def test_count_line_submission_with_reason():
    submission = CountLineSubmission(variance_reason="Damaged goods")
    assert submission.variance_reason == "Damaged goods"
