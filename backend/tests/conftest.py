"""Comprehensive pytest configuration for backend testing suite."""

import os
import shutil
import sys
import tempfile
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient

# Test environment setup - MUST BE BEFORE BACKEND IMPORTS
os.environ.update(
    {
        "TESTING": "true",
        "APP_ENV": "test",
        "MONGO_URL": "mongodb://localhost:27017/stock_verification_test",
        "DB_NAME": "stock_verification_test",
        "JWT_SECRET": "test-jwt-secret-key-for-testing-only",
        "JWT_REFRESH_SECRET": "test-jwt-refresh-secret-key-for-testing-only",
        "JWT_ALGORITHM": "HS256",
        "PIN_SALT": "test-pin-salt-not-for-production",
        "REDIS_URL": "redis://localhost:6379/15",  # Use database 15 for testing
        # 'SQL_SERVER_HOST': 'localhost',  # Disabled to prevent connection pool hang
        # 'SQL_SERVER_DATABASE': 'stockdb_test',
        "RATE_LIMIT_PER_MINUTE": "1000",  # Higher limits for testing
        "LOG_LEVEL": "DEBUG",
        "AUTH_SINGLE_SESSION": "false",
    }
)

from backend.services.cache_service import CacheService
from backend.tests.utils.in_memory_db import InMemoryDatabase, setup_server_with_in_memory_db

# Ensure backend package root is importable when running tests from project root
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

for path in (str(BACKEND_DIR), str(PROJECT_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)


# Import test utilities and mocks

# Provide Path symbol for legacy tests that expect it in globals
globals().setdefault("Path", Path)


@pytest.fixture(autouse=True)
async def cleanup_websockets():
    """Force cleanup of WebSocket connections after each test."""
    from backend.core.websocket_manager import manager

    yield

    # Close all active connections
    for user_connections in manager.active_connections.values():
        for connection in user_connections:
            try:
                await connection.close()
            except Exception:
                pass

    manager.active_connections.clear()
    manager.session_connections.clear()


@pytest.fixture
def test_db(monkeypatch) -> InMemoryDatabase:
    """Provide an in-memory database for testing."""
    # This sets up the server with the in-memory DB and seeds initial data
    db = setup_server_with_in_memory_db(monkeypatch)
    return db


@pytest_asyncio.fixture
async def async_client(test_db, monkeypatch) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async client for API testing."""
    from backend.server import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        yield client


@pytest_asyncio.fixture
async def mongo_client() -> AsyncGenerator[AsyncIOMotorClient, None]:
    """Provide MongoDB test client."""
    mongo_url = os.getenv("MONGO_URL")
    if not mongo_url:
        raise ValueError("MONGO_URL environment variable is not set")
    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_url)
    yield client

    # Cleanup test database
    db_name = os.getenv("DB_NAME")
    if not db_name:
        raise ValueError("DB_NAME environment variable is not set")
    await client.drop_database(db_name)
    client.close()


@pytest_asyncio.fixture
async def test_cache() -> AsyncGenerator[CacheService, None]:
    """Provide cache service for testing."""
    cache = CacheService(redis_url=os.getenv("REDIS_URL"), default_ttl=60)
    yield cache

    # Clear test cache
    await cache.clear_pattern("*")


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Provide temporary directory for file operations."""
    temp_path = Path(tempfile.mkdtemp())
    yield temp_path
    shutil.rmtree(temp_path, ignore_errors=True)


@pytest.fixture
def mock_sql_connection():
    """Provide mocked SQL Server connection."""
    connection = MagicMock()
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchall.return_value = []
    cursor.fetchone.return_value = None
    return connection


@pytest_asyncio.fixture
async def authenticated_headers(test_db: InMemoryDatabase) -> dict:
    """Provide authentication headers for API testing."""
    from backend.auth.jwt_provider import encode

    # Find the test user seeded by setup_server_with_in_memory_db
    user = await test_db.users.find_one({"username": "staff1"})
    if not user:
        # Fallback if seeding didn't work or changed
        user = {"username": "testuser", "role": "admin"}

    jwt_secret = os.getenv("JWT_SECRET")
    jwt_algorithm = os.getenv("JWT_ALGORITHM")

    if not jwt_secret or not jwt_algorithm:
        raise ValueError("JWT_SECRET or JWT_ALGORITHM environment variable is not set")

    token = encode(
        {"sub": user["username"], "role": user["role"]},
        jwt_secret,
        algorithm=jwt_algorithm,
    )

    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def performance_baseline():
    """Baseline performance metrics for regression testing."""
    return {
        "api_response_time_ms": 200,
        "db_query_time_ms": 50,
        "cache_hit_ratio": 0.8,
        "memory_usage_mb": 100,
        "build_time_seconds": 45,
    }


@pytest.fixture(autouse=True)
def clean_overrides():
    """Clear FastAPI dependency overrides after every test."""
    from backend.server import app

    yield
    app.dependency_overrides.clear()
