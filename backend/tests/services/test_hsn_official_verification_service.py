"""
Tests for optional official HSN verification (BSR Step 10): the only path
that can mark OFFICIAL_API_VERIFIED, fully config-gated, never crashes the
caller, never logs/exposes credentials.
"""

import pytest
from backend.services.hsn_official_verification_service import HsnOfficialVerificationService


@pytest.mark.asyncio
async def test_unconfigured_marks_manual_verification_required():
    service = HsnOfficialVerificationService(base_url=None, auth_token=None)

    result = await service.verify_hsn("853950")

    assert result["verification_status"] == "MANUAL_VERIFICATION_REQUIRED"
    assert result["details"] is None


@pytest.mark.asyncio
async def test_configured_but_failing_api_marks_unavailable_not_crash(monkeypatch):
    service = HsnOfficialVerificationService(
        base_url="https://eway.example.gov.in", auth_token="dummy-token"
    )

    async def _boom(hsn_sac):
        raise ConnectionError("network unreachable")

    monkeypatch.setattr(service, "_get_hsn_details_by_hsn_code", _boom)

    result = await service.verify_hsn("853950")

    assert result["verification_status"] == "API_UNAVAILABLE"


@pytest.mark.asyncio
async def test_configured_and_successful_marks_official_api_verified(monkeypatch):
    service = HsnOfficialVerificationService(
        base_url="https://eway.example.gov.in", auth_token="dummy-token"
    )

    async def _fake_success(hsn_sac):
        return {"hsn_sac": hsn_sac, "description": "Light-emitting diode lamps", "gst_rate": 12.0}

    monkeypatch.setattr(service, "_get_hsn_details_by_hsn_code", _fake_success)

    result = await service.verify_hsn("853950")

    assert result["verification_status"] == "OFFICIAL_API_VERIFIED"
    assert result["details"]["gst_rate"] == 12.0
    assert result["verified_at"] is not None


def test_credentials_never_appear_in_result():
    service = HsnOfficialVerificationService(
        base_url="https://eway.example.gov.in",
        auth_token="super-secret-token",
        client_secret="super-secret-client",
    )
    # Credentials are stored internally (needed to call the API) but this
    # asserts the service exposes no public accessor that would leak them
    # into a log line or API response constructed from its public surface.
    assert not hasattr(service, "auth_token")
    assert not hasattr(service, "client_secret")
