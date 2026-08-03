"""Unit tests for the AutoRecovery retry/fallback/default strategies.

Backoff sleeps are patched to no-ops so retries run instantly.
"""

import pytest
from backend.services.auto_recovery import AutoRecovery, RecoveryStrategy
from backend.services.resilience import auto_recovery as ar_module


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(ar_module.time, "sleep", lambda *_a, **_k: None)

    async def _async_noop(*_a, **_k):
        return None

    monkeypatch.setattr(ar_module.asyncio, "sleep", _async_noop)


def test_recover_success_first_try():
    ar = AutoRecovery()
    result, ok, err = ar.recover(lambda: "value")
    assert (result, ok, err) == ("value", True, None)


def test_recover_succeeds_after_transient_failures():
    ar = AutoRecovery()
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("transient")
        return "ok"

    result, ok, _err = ar.recover(flaky, max_retries=3, retry_delay=0)
    assert (result, ok) == ("ok", True)
    assert ar.recovery_stats["successful_recoveries"] == 1


def test_recover_exhausts_retries_and_fails():
    ar = AutoRecovery()

    def always_fail():
        raise ValueError("nope")

    result, ok, err = ar.recover(always_fail, max_retries=2, retry_delay=0)
    assert result is None
    assert ok is False
    assert "All recovery attempts failed" in err
    assert ar.recovery_stats["failed_recoveries"] == 1


def test_recover_fallback_strategy():
    ar = AutoRecovery()
    result, ok, err = ar.recover(
        lambda: (_ for _ in ()).throw(RuntimeError("boom")),
        strategy=RecoveryStrategy.FALLBACK,
        fallback=lambda: "fallback-value",
        max_retries=1,
        retry_delay=0,
    )
    assert (result, ok, err) == ("fallback-value", True, None)
    assert ar.recovery_stats["fallback_used"] == 1


def test_recover_default_strategy():
    ar = AutoRecovery()
    result, ok, _err = ar.recover(
        lambda: (_ for _ in ()).throw(RuntimeError("boom")),
        strategy=RecoveryStrategy.DEFAULT,
        default_value="fallback-default",
        max_retries=1,
        retry_delay=0,
    )
    assert result == "fallback-default"
    assert ok is True


@pytest.mark.asyncio
async def test_recover_async_success_and_fallback():
    ar = AutoRecovery()

    async def good():
        return "async-ok"

    result, ok, _ = await ar.recover_async(good, max_retries=2, retry_delay=0)
    assert (result, ok) == ("async-ok", True)

    async def bad():
        raise RuntimeError("boom")

    async def fb():
        return "async-fallback"

    result, ok, _ = await ar.recover_async(
        bad, strategy=RecoveryStrategy.FALLBACK, fallback=fb, max_retries=1, retry_delay=0
    )
    assert (result, ok) == ("async-fallback", True)


def test_get_stats_and_clear_history():
    ar = AutoRecovery()
    ar.recover(lambda: (_ for _ in ()).throw(ValueError("x")), max_retries=1, retry_delay=0)
    stats = ar.get_stats()
    assert stats["total_recoveries"] >= 1
    assert 0 <= stats["success_rate"] <= 100
    assert isinstance(stats["recent_errors"], list) and stats["recent_errors"]
    ar.clear_history()
    assert ar.error_history == []


def test_error_history_is_capped():
    ar = AutoRecovery()
    ar.max_history = 5
    for _ in range(8):
        ar.recover(lambda: (_ for _ in ()).throw(ValueError("x")), max_retries=1, retry_delay=0)
    assert len(ar.error_history) == 5
