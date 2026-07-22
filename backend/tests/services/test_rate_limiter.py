"""Unit tests for the token-bucket rate limiter and concurrent-request handler."""

import time

import pytest

from backend.services.rate_limiter import ConcurrentRequestHandler, RateLimiter


def test_allows_up_to_burst_then_denies():
    rl = RateLimiter(default_rate=60, default_burst=3, per_user=True)
    allowed = [rl.is_allowed(user_id="u1")[0] for _ in range(3)]
    assert allowed == [True, True, True]
    ok, info = rl.is_allowed(user_id="u1")
    assert ok is False
    assert info["allowed"] is False
    assert info["remaining"] == 0
    assert info["retry_after"] >= 1


def test_remaining_decreases_per_request():
    rl = RateLimiter(default_rate=60, default_burst=5, per_user=True)
    _, info1 = rl.is_allowed(user_id="u1")
    _, info2 = rl.is_allowed(user_id="u1")
    assert info1["remaining"] > info2["remaining"]


def test_per_user_buckets_are_independent():
    rl = RateLimiter(default_rate=60, default_burst=1, per_user=True)
    assert rl.is_allowed(user_id="alice")[0] is True
    assert rl.is_allowed(user_id="alice")[0] is False
    # A different user has its own bucket, still full.
    assert rl.is_allowed(user_id="bob")[0] is True


def test_tokens_refill_over_time():
    rl = RateLimiter(default_rate=60, default_burst=2, per_user=True)
    # Drain the bucket
    assert rl.is_allowed(user_id="u1")[0] is True
    assert rl.is_allowed(user_id="u1")[0] is True
    assert rl.is_allowed(user_id="u1")[0] is False
    # Rewind the bucket's last-refill by 60s: at 60 req/min that refills the burst.
    tokens, _ = rl._buckets["user:u1"]
    rl._buckets["user:u1"] = (tokens, time.time() - 60)
    assert rl.is_allowed(user_id="u1")[0] is True


def test_custom_rate_and_burst_override_defaults():
    rl = RateLimiter(default_rate=1, default_burst=1, per_user=True)
    # Override burst to 2 for this key
    assert rl.is_allowed(user_id="u1", rate=120, burst=2)[0] is True
    assert rl.is_allowed(user_id="u1", rate=120, burst=2)[0] is True


def test_get_stats_shape():
    rl = RateLimiter(default_rate=60, default_burst=2, per_user=True)
    rl.is_allowed(user_id="u1")
    stats = rl.get_stats()
    assert stats["active_buckets"] >= 1
    assert stats["total_requests"] >= 1
    assert "request_counts" in stats


@pytest.mark.asyncio
async def test_concurrent_handler_acquire_release_and_timeout():
    handler = ConcurrentRequestHandler(max_concurrent=1)
    assert await handler.acquire() is True
    # Second acquire cannot proceed while the single slot is held.
    assert await handler.acquire(timeout=0.05) is False
    await handler.release()
    assert await handler.acquire(timeout=0.5) is True


@pytest.mark.asyncio
async def test_concurrent_handler_stats():
    handler = ConcurrentRequestHandler(max_concurrent=4)
    await handler.acquire()
    await handler.acquire()
    stats = await handler.get_stats()
    assert stats["max_concurrent"] == 4
    assert stats["active"] == 2
    assert stats["available"] == 2
    assert stats["utilization"] == 50.0
