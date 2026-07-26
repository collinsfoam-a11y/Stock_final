"""
Direct unit tests for HsnGstValidationService (BSR Step 8/10): HSN format
validation and internal GST-rate consistency checks against already-synced
SQL data. No live official CBIC/GST source is integrated -- see
PLACEHOLDER_SOURCE and docs/BSR_REMEDIATION_STATUS.md for the honesty
policy this carries. Covered indirectly via
test_erpnext_import_data_validation_service.py as well; this file exercises
the service directly, without needing a full preview-generation pipeline.
"""

import pytest

from backend.services.hsn_gst_validation_service import PLACEHOLDER_SOURCE, HsnGstValidationService
from backend.tests.utils.in_memory_db import InMemoryDatabase

ADMIN_USER = {"username": "admin1", "role": "admin"}


@pytest.mark.asyncio
async def test_valid_hsn_format_and_matching_gst_rate():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    result = await service.validate_hsn(
        hsn_sac="731815", gst_percentage=18.0, sgst_percent=9.0, cgst_percent=9.0,
        igst_percent=18.0, is_non_gst=False, current_user=ADMIN_USER,
    )

    assert result["hsn_validation_status"] == "VALID"
    assert result["gst_rate_mismatch"] is False
    assert result["hsn_validation_source"] == PLACEHOLDER_SOURCE


@pytest.mark.asyncio
async def test_missing_hsn_reports_missing_status():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    result = await service.validate_hsn(
        hsn_sac=None, gst_percentage=None, sgst_percent=None, cgst_percent=None,
        igst_percent=None, is_non_gst=False, current_user=ADMIN_USER,
    )

    assert result["hsn_validation_status"] == "MISSING"


@pytest.mark.asyncio
async def test_invalid_hsn_format():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    result = await service.validate_hsn(
        hsn_sac="ABC12", gst_percentage=18.0, sgst_percent=9.0, cgst_percent=9.0,
        igst_percent=18.0, is_non_gst=False, current_user=ADMIN_USER,
    )

    assert result["hsn_validation_status"] == "INVALID"


@pytest.mark.asyncio
async def test_gst_rate_mismatch_detected():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    result = await service.validate_hsn(
        hsn_sac="731815", gst_percentage=18.0, sgst_percent=5.0, cgst_percent=5.0,
        igst_percent=12.0, is_non_gst=False, current_user=ADMIN_USER,
    )

    assert result["gst_rate_mismatch"] is True


@pytest.mark.asyncio
async def test_non_gst_item_is_not_applicable():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    result = await service.validate_hsn(
        hsn_sac=None, gst_percentage=None, sgst_percent=None, cgst_percent=None,
        igst_percent=None, is_non_gst=True, current_user=ADMIN_USER,
    )

    assert result["hsn_validation_status"] == "NOT_APPLICABLE"


@pytest.mark.asyncio
async def test_validation_is_cached_and_audited_once():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    await service.validate_hsn(
        hsn_sac="731815", gst_percentage=18.0, sgst_percent=9.0, cgst_percent=9.0,
        igst_percent=18.0, is_non_gst=False, current_user=ADMIN_USER,
    )
    await service.validate_hsn(
        hsn_sac="731815", gst_percentage=18.0, sgst_percent=9.0, cgst_percent=9.0,
        igst_percent=18.0, is_non_gst=False, current_user=ADMIN_USER,
    )

    cached = await db.hsn_validation_cache.find_one({"hsn_sac": "731815"})
    assert cached is not None
    audit_entries = await db.audit_logs.find({"details.hsn_sac": "731815"}).to_list(length=10)
    assert len(audit_entries) == 1


def test_suggest_hsn_candidates_never_marks_official():
    db = InMemoryDatabase()
    service = HsnGstValidationService(db)

    suggestions = service.suggest_hsn_candidates(
        item_name="Steel Screw Pack", category="Hardware", subcategory="Fasteners", brand="Acme"
    )

    for s in suggestions:
        assert s["source"] == PLACEHOLDER_SOURCE
        assert len(s["hsn_6_digit"]) == 6
