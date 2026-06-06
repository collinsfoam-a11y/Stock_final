import pytest
from unittest.mock import AsyncMock
from backend.auth.permissions import (
    disable_permissions_for_user,
    add_permissions_to_user,
    remove_permissions_from_user,
    enable_permissions_for_user
)

@pytest.mark.asyncio
async def test_disable_permissions_for_user():
    # Setup mock db
    mock_db = AsyncMock()
    mock_update_result = AsyncMock()
    mock_update_result.modified_count = 1
    mock_db.users.update_one.return_value = mock_update_result

    username = "testuser"
    permissions_to_disable = ["session.read", "item.read"]

    # Call function
    result = await disable_permissions_for_user(mock_db, username, permissions_to_disable)

    # Verify return value
    assert result is True

    # Verify update_one was called with correct arguments
    mock_db.users.update_one.assert_called_once_with(
        {"username": username},
        {"$addToSet": {"disabled_permissions": {"$each": permissions_to_disable}}}
    )

@pytest.mark.asyncio
async def test_disable_permissions_for_user_not_found():
    # Setup mock db to simulate user not found / no modified docs
    mock_db = AsyncMock()
    mock_update_result = AsyncMock()
    mock_update_result.modified_count = 0
    mock_db.users.update_one.return_value = mock_update_result

    username = "nonexistentuser"
    permissions_to_disable = ["session.read"]

    # Call function
    result = await disable_permissions_for_user(mock_db, username, permissions_to_disable)

    # Verify return value is False when no documents are modified
    assert result is False

@pytest.mark.asyncio
async def test_add_permissions_to_user():
    mock_db = AsyncMock()
    mock_update_result = AsyncMock()
    mock_update_result.modified_count = 1
    mock_db.users.update_one.return_value = mock_update_result

    username = "testuser"
    permissions_to_add = ["session.write"]

    result = await add_permissions_to_user(mock_db, username, permissions_to_add)

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": username},
        {"$addToSet": {"permissions": {"$each": permissions_to_add}}}
    )

@pytest.mark.asyncio
async def test_remove_permissions_from_user():
    mock_db = AsyncMock()
    mock_update_result = AsyncMock()
    mock_update_result.modified_count = 1
    mock_db.users.update_one.return_value = mock_update_result

    username = "testuser"
    permissions_to_remove = ["session.write"]

    result = await remove_permissions_from_user(mock_db, username, permissions_to_remove)

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": username},
        {"$pull": {"permissions": {"$in": permissions_to_remove}}}
    )

@pytest.mark.asyncio
async def test_enable_permissions_for_user():
    mock_db = AsyncMock()
    mock_update_result = AsyncMock()
    mock_update_result.modified_count = 1
    mock_db.users.update_one.return_value = mock_update_result

    username = "testuser"
    permissions_to_enable = ["session.read"]

    result = await enable_permissions_for_user(mock_db, username, permissions_to_enable)

    assert result is True
    mock_db.users.update_one.assert_called_once_with(
        {"username": username},
        {"$pull": {"disabled_permissions": {"$in": permissions_to_enable}}}
    )
