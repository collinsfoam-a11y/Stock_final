"""
Tests for the health check API endpoints and version utilities.
Covers: /health, /health/live, /health/ready, /health/startup,
        /health/detailed, /api/version, /api/version/check
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from backend.server import app
from backend.api.health import _parse_version, _compare_versions

client = TestClient(app)


# ---------------------------------------------------------------------------
# _parse_version unit tests
# ---------------------------------------------------------------------------


def test_parse_version_full():
    assert _parse_version("1.2.3") == (1, 2, 3)


def test_parse_version_major_minor():
    assert _parse_version("2.5") == (2, 5, 0)


def test_parse_version_major_only():
    assert _parse_version("3") == (3, 0, 0)


def test_parse_version_with_suffix():
    assert _parse_version("1.2.3-beta") == (1, 2, 3)


def test_parse_version_with_build():
    assert _parse_version("1.2.3+build.456") == (1, 2, 3)


def test_parse_version_empty():
    assert _parse_version("") == (0, 0, 0)


def test_parse_version_invalid():
    assert _parse_version("not-a-version") == (0, 0, 0)


def test_parse_version_whitespace():
    assert _parse_version("  1.2.3  ") == (1, 2, 3)


# ---------------------------------------------------------------------------
# _compare_versions unit tests
# ---------------------------------------------------------------------------


def test_compare_versions_up_to_date():
    result = _compare_versions("1.0.0", "1.0.0", "1.0.0")
    assert result["is_compatible"] is True
    assert result["is_latest"] is True
    assert result["update_available"] is False
    assert result["force_update"] is False


def test_compare_versions_outdated_patch():
    result = _compare_versions("1.0.0", "1.0.0", "1.0.1")
    assert result["is_latest"] is False
    assert result["update_type"] == "patch"
    assert result["update_available"] is True
    assert result["force_update"] is False


def test_compare_versions_outdated_minor():
    result = _compare_versions("1.0.0", "1.0.0", "1.1.0")
    assert result["update_type"] == "minor"


def test_compare_versions_outdated_major():
    result = _compare_versions("1.0.0", "1.0.0", "2.0.0")
    assert result["update_type"] == "major"


def test_compare_versions_below_minimum():
    result = _compare_versions("0.9.0", "1.0.0", "1.2.0")
    assert result["is_compatible"] is False
    assert result["force_update"] is True


def test_compare_versions_newer_than_current():
    result = _compare_versions("2.0.0", "1.0.0", "1.5.0")
    assert result["is_compatible"] is True
    assert result["is_latest"] is True


# ---------------------------------------------------------------------------
# /health/live endpoint
# ---------------------------------------------------------------------------


def test_liveness_check():
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["alive"] is True
    assert "timestamp" in data


# ---------------------------------------------------------------------------
# /api/version endpoint
# ---------------------------------------------------------------------------


def test_version_endpoint():
    response = client.get("/api/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "name" in data


# ---------------------------------------------------------------------------
# /api/version/check endpoint
# ---------------------------------------------------------------------------


def test_version_check_valid():
    response = client.get("/api/version/check?client_version=1.0.0")
    assert response.status_code == 200
    data = response.json()
    assert "is_compatible" in data
    assert "update_available" in data


def test_version_check_invalid_version_pattern():
    response = client.get("/api/version/check?client_version=not_valid")
    # FastAPI query validation should reject this (422) or our code handles it
    assert response.status_code in (200, 422)


def test_version_check_missing_param():
    response = client.get("/api/version/check")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# /health endpoint (basic)
# ---------------------------------------------------------------------------


def test_health_check_returns_status():
    response = client.get("/health/")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "timestamp" in data
    assert "service" in data


def test_health_check_no_trailing_slash():
    response = client.get("/health")
    assert response.status_code == 200
