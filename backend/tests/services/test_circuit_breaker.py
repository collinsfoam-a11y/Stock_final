"""Unit tests for the circuit breaker resilience primitive.

Covers the full CLOSED -> OPEN -> HALF_OPEN -> CLOSED lifecycle, the M10
recovery-timer fix, the registry, and the protective decorator. Elapsed time
is simulated by rewinding ``_last_failure_time`` so the tests stay fast and
deterministic (no real sleeps).
"""

import time

import pytest

from backend.services.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerRegistry,
    CircuitOpenError,
    CircuitState,
    with_circuit_breaker,
)

pytestmark = pytest.mark.asyncio


def _make(**overrides) -> CircuitBreaker:
    params = {
        "failure_threshold": 3,
        "success_threshold": 2,
        "timeout_seconds": 30.0,
        "half_open_max_calls": 2,
    }
    params.update(overrides)
    return CircuitBreaker("test", CircuitBreakerConfig(**params))


async def test_starts_closed_and_available():
    cb = _make()
    assert cb.state is CircuitState.CLOSED
    assert cb.is_available is True
    assert await cb.acquire() is True


async def test_opens_after_failure_threshold():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()
    assert cb.state is CircuitState.OPEN
    assert cb.is_available is False
    assert await cb.acquire() is False


async def test_success_in_closed_resets_failure_count():
    cb = _make()
    await cb.record_failure()
    await cb.record_failure()
    await cb.record_success()  # resets
    assert cb._failure_count == 0
    # One more pair of failures should not yet open (count was reset)
    await cb.record_failure()
    await cb.record_failure()
    assert cb.state is CircuitState.CLOSED


async def test_open_transitions_to_half_open_after_timeout():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()
    assert cb.state is CircuitState.OPEN
    # Simulate the timeout window elapsing
    cb._last_failure_time = time.time() - 31.0
    assert cb.is_available is True  # timeout passed
    assert await cb.acquire() is True
    assert cb.state is CircuitState.HALF_OPEN


async def test_half_open_closes_after_success_threshold():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()
    cb._last_failure_time = time.time() - 31.0
    await cb.acquire()  # -> HALF_OPEN
    await cb.record_success()
    await cb.record_success()  # success_threshold=2
    assert cb.state is CircuitState.CLOSED


async def test_half_open_reopens_on_single_failure():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()
    cb._last_failure_time = time.time() - 31.0
    await cb.acquire()  # -> HALF_OPEN
    await cb.record_failure()
    assert cb.state is CircuitState.OPEN


async def test_half_open_limits_concurrent_calls():
    cb = _make(half_open_max_calls=2)
    for _ in range(3):
        await cb.record_failure()
    cb._last_failure_time = time.time() - 31.0
    assert await cb.acquire() is True  # 1st half-open call (transitions)
    assert await cb.acquire() is True  # 2nd
    assert await cb.acquire() is False  # exceeds half_open_max_calls


async def test_m10_open_does_not_push_recovery_timer_forward():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()
    assert cb.state is CircuitState.OPEN
    first = cb._last_failure_time
    # Further failures while OPEN must NOT reset the recovery timer.
    await cb.record_failure()
    await cb.record_failure()
    assert cb._last_failure_time == first


async def test_get_status_shape():
    cb = _make()
    status = cb.get_status()
    assert status["name"] == "test"
    assert status["state"] == "closed"
    assert status["last_failure"] is None
    assert status["config"]["failure_threshold"] == 3


async def test_registry_get_or_create_is_idempotent():
    reg = CircuitBreakerRegistry()
    a = await reg.get_or_create("svc")
    b = await reg.get_or_create("svc")
    assert a is b
    assert reg.get("svc") is a
    assert reg.get("missing") is None
    assert "svc" in reg.get_all_status()


async def test_decorator_calls_fallback_when_open():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()

    async def fallback(*a, **k):
        return "fallback"

    @with_circuit_breaker(cb, fallback=fallback)
    async def protected():
        return "primary"

    assert await protected() == "fallback"


async def test_decorator_raises_when_open_without_fallback():
    cb = _make()
    for _ in range(3):
        await cb.record_failure()

    @with_circuit_breaker(cb)
    async def protected():
        return "primary"

    with pytest.raises(CircuitOpenError):
        await protected()


async def test_decorator_records_failure_on_exception():
    cb = _make(failure_threshold=1)

    @with_circuit_breaker(cb)
    async def protected():
        raise ValueError("boom")

    with pytest.raises(ValueError):
        await protected()
    assert cb.state is CircuitState.OPEN
