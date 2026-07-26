# Updated test file for AsyncUtils refactor
import pytest
import asyncio
from unittest.mock import AsyncMock
from backend.utils.async_utils import (
    AsyncExecutor,
    AsyncCache,
    with_async_executor,
    safe_async_execute,
    safe_batch_execute,
    async_connection_pool,
    cached_async,
    _async_cache,
)

# ---------------------------------------------------------------------------
# AsyncExecutor Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_async_executor_execute_with_retry_success():
    """Test successful execution without retries"""
    executor = AsyncExecutor()
    mock_coro_func = AsyncMock(return_value="success")

    result = await executor.execute_with_retry(mock_coro_func, "test_op")

    assert result.is_success
    assert result.unwrap() == "success"
    mock_coro_func.assert_called_once()


@pytest.mark.asyncio
async def test_async_executor_execute_with_retry_failure_then_success():
    """Test retry logic: fail once then succeed"""
    executor = AsyncExecutor(retry_attempts=3, backoff_factor=0.01)  # fast backoff

    # First call raises Exception, second returns "success"
    mock_coro_func = AsyncMock(side_effect=[Exception("Fail 1"), "success"])

    result = await executor.execute_with_retry(mock_coro_func, "test_op")

    assert result.is_success
    assert result.unwrap() == "success"
    assert mock_coro_func.call_count == 2


@pytest.mark.asyncio
async def test_async_executor_all_retries_failed():
    """Test failure after all retries"""
    executor = AsyncExecutor(retry_attempts=2, backoff_factor=0.01)
    mock_coro_func = AsyncMock(side_effect=Exception("Always fail"))

    result = await executor.execute_with_retry(mock_coro_func, "test_op")

    assert result.is_error
    assert "Always fail" in str(result._error)
    assert mock_coro_func.call_count == 2


@pytest.mark.asyncio
async def test_async_executor_circuit_breaker():
    """Test circuit breaker functionality"""
    executor = AsyncExecutor()
    executor._circuit_breaker_threshold = 2
    executor._circuit_breaker_timeout = 1

    # Simulate failures
    executor._record_failure("test_op")
    executor._record_failure("test_op")

    assert executor._is_circuit_open("test_op")

    # Attempt execution should fail immediately without calling function
    mock_coro_func = AsyncMock(return_value="success")
    result = await executor.execute_with_retry(mock_coro_func, "test_op")

    assert result.is_error
    assert "Circuit breaker open" in str(result._error)
    mock_coro_func.assert_not_called()

    # Wait for timeout
    await asyncio.sleep(1.1)

    # Should be half-open (allow attempt)
    assert not executor._is_circuit_open(
        "test_op"
    )  # implementation returns False if timeout passed

    # Attempt success
    result = await executor.execute_with_retry(mock_coro_func, "test_op")
    assert result.is_success
    mock_coro_func.assert_called_once()

    # Circuit breaker should be reset
    assert executor._circuit_breaker_state["test_op"]["failures"] == 0


@pytest.mark.asyncio
async def test_async_executor_batch():
    """Test batch execution"""
    executor = AsyncExecutor(max_concurrent=2)

    async def task(i):
        await asyncio.sleep(0.01)
        return i

    # Create factories
    funcs = [lambda i=i: task(i) for i in range(5)]

    results = await executor.execute_batch(funcs, "batch_test")

    assert len(results) == 5
    for i, res in enumerate(results):
        assert res.is_success
        assert res.unwrap() == i


# ---------------------------------------------------------------------------
# Decorator and Safe Helper Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_with_async_executor_decorator():
    call_count = 0

    @with_async_executor(timeout=1.0)
    async def flaky_func():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("Fail 1")
        return "success"

    result = await flaky_func()
    assert result.is_success
    assert result.unwrap() == "success"
    assert call_count == 2


@pytest.mark.asyncio
async def test_safe_async_execute():
    mock_func = AsyncMock(return_value="success")
    result = await safe_async_execute(mock_func)
    assert result.is_success
    assert result.unwrap() == "success"


@pytest.mark.asyncio
async def test_safe_batch_execute():
    async def task(i):
        return i * 2

    funcs = [lambda i=i: task(i) for i in range(3)]
    results = await safe_batch_execute(funcs)

    assert len(results) == 3
    assert [r.unwrap() for r in results] == [0, 2, 4]


# ---------------------------------------------------------------------------
# Connection Pool Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_async_connection_pool():
    async with async_connection_pool(pool_size=5) as pool:
        assert len(pool) == 5
        assert all(c is None for c in pool)  # implementation appends None


# ---------------------------------------------------------------------------
# AsyncCache Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_async_cache_operations():
    cache = AsyncCache(max_size=10, default_ttl=60)

    # Test Set/Get
    await cache.set("key1", "value1")
    val = await cache.get("key1")
    assert val == "value1"

    # Test Missing
    val = await cache.get("missing")
    assert val is None

    # Test Delete
    await cache.delete("key1")
    val = await cache.get("key1")
    assert val is None

    # Test Clear
    await cache.set("key1", "value1")
    await cache.set("key2", "value2")
    await cache.clear()
    assert await cache.get("key1") is None
    assert await cache.get("key2") is None


@pytest.mark.asyncio
async def test_async_cache_expiry():
    cache = AsyncCache(max_size=10, default_ttl=1)  # 1 sec TTL

    await cache.set("key1", "value1", ttl=0.1)  # 0.1s TTL
    assert await cache.get("key1") == "value1"

    await asyncio.sleep(0.2)
    assert await cache.get("key1") is None


@pytest.mark.asyncio
async def test_async_cache_lru_eviction():
    cache = AsyncCache(max_size=2)

    await cache.set("k1", "v1")
    await cache.set("k2", "v2")

    # Access k1 to make it recent
    await cache.get("k1")

    # Add k3, should evict k2 (LRU)
    await cache.set("k3", "v3")

    assert await cache.get("k1") == "v1"
    assert await cache.get("k3") == "v3"
    assert await cache.get("k2") is None


@pytest.mark.asyncio
async def test_cached_async_decorator():
    # Clear global cache first
    await _async_cache.clear()

    call_count = 0

    @cached_async(ttl=60)
    async def expensive_func(x):
        nonlocal call_count
        call_count += 1
        return x * 2

    # First call
    res1 = await expensive_func(10)
    assert res1 == 20
    assert call_count == 1

    # Second call (should hit cache)
    res2 = await expensive_func(10)
    assert res2 == 20
    assert call_count == 1  # No increment

    # Different arg
    res3 = await expensive_func(20)
    assert res3 == 40
    assert call_count == 2
