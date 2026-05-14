import pytest
from unittest.mock import AsyncMock
from motor.motor_asyncio import AsyncIOMotorDatabase
from backend.auth.permissions import (
    add_permissions_to_user,
    remove_permissions_from_user,
    disable_permissions_for_user,
    enable_permissions_for_user
)

@pytest.fixture
def mock_db():
    db = AsyncMock(spec=AsyncIOMotorDatabase)
    db.users = AsyncMock()
    return db

@pytest.mark.asyncio
async def test_add_permissions_to_user_success(mock_db):
    mock_db.users.update_one.return_value.modified_count = 1

    result = await add_permissions_to_user(mock_db, "testuser", ["permission1", "permission2"])

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": "testuser"},
        {"$addToSet": {"permissions": {"$each": ["permission1", "permission2"]}}}
    )

@pytest.mark.asyncio
async def test_add_permissions_to_user_failure(mock_db):
    mock_db.users.update_one.return_value.modified_count = 0

    result = await add_permissions_to_user(mock_db, "testuser", ["permission1"])

    assert result is False

@pytest.mark.asyncio
async def test_remove_permissions_from_user_success(mock_db):
    mock_db.users.update_one.return_value.modified_count = 1

    result = await remove_permissions_from_user(mock_db, "testuser", ["permission1", "permission2"])

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": "testuser"},
        {"$pull": {"permissions": {"$in": ["permission1", "permission2"]}}}
    )

@pytest.mark.asyncio
async def test_remove_permissions_from_user_failure(mock_db):
    mock_db.users.update_one.return_value.modified_count = 0

    result = await remove_permissions_from_user(mock_db, "testuser", ["permission1"])

    assert result is False

@pytest.mark.asyncio
async def test_disable_permissions_for_user_success(mock_db):
    mock_db.users.update_one.return_value.modified_count = 1

    result = await disable_permissions_for_user(mock_db, "testuser", ["permission1", "permission2"])

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": "testuser"},
        {"$addToSet": {"disabled_permissions": {"$each": ["permission1", "permission2"]}}}
    )

@pytest.mark.asyncio
async def test_disable_permissions_for_user_failure(mock_db):
    mock_db.users.update_one.return_value.modified_count = 0

    result = await disable_permissions_for_user(mock_db, "testuser", ["permission1"])

    assert result is False

@pytest.mark.asyncio
async def test_enable_permissions_for_user_success(mock_db):
    mock_db.users.update_one.return_value.modified_count = 1

    result = await enable_permissions_for_user(mock_db, "testuser", ["permission1", "permission2"])

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": "testuser"},
        {"$pull": {"disabled_permissions": {"$in": ["permission1", "permission2"]}}}
    )

@pytest.mark.asyncio
async def test_enable_permissions_for_user_failure(mock_db):
    mock_db.users.update_one.return_value.modified_count = 0

    result = await enable_permissions_for_user(mock_db, "testuser", ["permission1"])

    assert result is False
