"""
Simplified Performance Tests for Stock Verification System
Tests performance of actual workflows: auth, sessions, search
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import Optional

import pytest
import pytest_asyncio
from fastapi import status
from httpx import AsyncClient

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetric:
    """Performance metric data"""

    name: str
    value: float
    unit: str
    baseline: Optional[float] = None
    threshold: Optional[float] = None
    passed: bool = True


class PerformanceBenchmark:
    """Performance benchmarking utility"""

    def __init__(self):
        self.metrics = []

    def record_metric(self, name: str, value: float, unit: str, threshold: Optional[float] = None):
        """Record a performance metric"""
        passed = True
        if threshold and value > threshold:
            passed = False

        metric = PerformanceMetric(
            name=name, value=value, unit=unit, threshold=threshold, passed=passed
        )
        self.metrics.append(metric)

        status_icon = "✓" if passed else "✗"
        threshold_msg = f" (threshold: {threshold}{unit})" if threshold else ""
        logger.info(f"{status_icon} {name}: {value:.2f}{unit}{threshold_msg}")


@pytest.fixture
def benchmark():
    """Provide performance benchmark utility"""
    return PerformanceBenchmark()


class TestAPIPerformance:
    """API Performance Tests"""

    @pytest_asyncio.fixture
    async def auth_headers(self, async_client: AsyncClient, test_db) -> dict[str, str]:
        """Create authenticated user and return auth headers"""
        user_data = {
            "username": f"perf_test_{random.randint(1000, 9999)}",
            "password": "TestPassword123!",
            "full_name": f"Perf User {random.randint(1000, 9999)}",
            "role": "admin",
        }

        await async_client.post("/api/auth/register", json=user_data)
        login_response = await async_client.post(
            "/api/auth/login",
            json={"username": user_data["username"], "password": user_data["password"]},
        )

        if login_response.status_code != status.HTTP_200_OK:
            # Try to login with existing user if registration failed
            login_response = await async_client.post(
                "/api/auth/login",
                json={"username": user_data["username"], "password": user_data["password"]},
            )

        assert login_response.status_code == status.HTTP_200_OK, (
            f"Login failed: {login_response.text}"
        )
        login_payload = login_response.json()
        token = login_payload.get("access_token") or login_payload.get("data", {}).get(
            "access_token"
        )
        assert token
        return {"Authorization": f"Bearer {token}"}

    @pytest.mark.skip(reason="Performance tests require full database setup - skipping for CI")
    @pytest.mark.asyncio
    async def test_authentication_performance(
        self, async_client: AsyncClient, test_db, benchmark: PerformanceBenchmark
    ):
        """Benchmark authentication performance"""
        logger.info("Benchmarking authentication performance...")

        # 1. Registration Performance
        start_time = time.time()
        user_data = {
            "username": f"bench_user_{random.randint(10000, 99999)}",
            "password": "TestPassword123!",
            "full_name": "Benchmark User",
            "role": "staff",
        }

        response = await async_client.post("/api/auth/register", json=user_data)
        reg_time = (time.time() - start_time) * 1000  # ms

        assert response.status_code == status.HTTP_201_CREATED
        benchmark.record_metric("registration_latency", reg_time, "ms", 200.0)

        # 2. Login Performance
        start_time = time.time()
        response = await async_client.post(
            "/api/auth/login",
            json={"username": user_data["username"], "password": user_data["password"]},
        )
        login_time = (time.time() - start_time) * 1000  # ms

        assert response.status_code == status.HTTP_200_OK
        benchmark.record_metric("login_latency", login_time, "ms", 150.0)

    @pytest.mark.skip(reason="Performance tests require full database setup - skipping for CI")
    @pytest.mark.asyncio
    async def test_search_operations_performance(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        benchmark: PerformanceBenchmark,
    ):
        """Benchmark search operations"""
        logger.info("Benchmarking search operations...")

        # Test search endpoint performance
        start_time = time.time()
        response = await async_client.get("/api/items/search?q=test", headers=auth_headers)
        search_time = (time.time() - start_time) * 1000

        # Search might return 200, 400, or 404
        assert response.status_code in [200, 400, 404]
        benchmark.record_metric("search_latency", search_time, "ms", 100.0)

    @pytest.mark.skip(reason="Performance tests require full database setup - skipping for CI")
    @pytest.mark.asyncio
    async def test_concurrent_request_performance(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        benchmark: PerformanceBenchmark,
    ):
        """Benchmark concurrent request handling"""
        logger.info("Benchmarking concurrent requests...")

        # Define concurrent task
        async def make_request():
            start = time.time()
            resp = await async_client.get("/health", headers=auth_headers)
            return time.time() - start, resp.status_code

        # Execute 50 concurrent requests
        concurrency = 50
        tasks = [make_request() for _ in range(concurrency)]
        await asyncio.gather(*tasks)
