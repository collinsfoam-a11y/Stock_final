from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.config import _enforce_production_guards


def test_production_guard_blocks_draft_debug_flag(monkeypatch):
    monkeypatch.setenv("COUNT_LINES_DRAFT_DEBUG_ERRORS", "true")
    settings_obj = SimpleNamespace(
        ENVIRONMENT="production",
        DEBUG=False,
        AUTO_SEED_DEFAULT_USERS=False,
        AUTO_SEED_MOCK_ERP_DATA=False,
        STRICT_VALIDATION=True,
    )

    with pytest.raises(RuntimeError, match="COUNT_LINES_DRAFT_DEBUG_ERRORS"):
        _enforce_production_guards(settings_obj)


def test_production_guard_requires_strict_validation(monkeypatch):
    monkeypatch.setenv("COUNT_LINES_DRAFT_DEBUG_ERRORS", "false")
    settings_obj = SimpleNamespace(
        ENVIRONMENT="production",
        DEBUG=False,
        AUTO_SEED_DEFAULT_USERS=False,
        AUTO_SEED_MOCK_ERP_DATA=False,
        STRICT_VALIDATION=False,
    )

    with pytest.raises(RuntimeError, match="STRICT_VALIDATION=true"):
        _enforce_production_guards(settings_obj)


def test_production_guard_allows_strict_safe_configuration(monkeypatch):
    monkeypatch.setenv("COUNT_LINES_DRAFT_DEBUG_ERRORS", "false")
    settings_obj = SimpleNamespace(
        ENVIRONMENT="production",
        DEBUG=False,
        AUTO_SEED_DEFAULT_USERS=False,
        AUTO_SEED_MOCK_ERP_DATA=False,
        STRICT_VALIDATION=True,
    )

    _enforce_production_guards(settings_obj)
