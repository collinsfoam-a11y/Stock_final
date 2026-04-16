import pytest
from httpx import AsyncClient

from backend.server import app
from backend.utils.auth_utils import create_access_token

# Test Data
TEST_USERNAME = "testuser_settings"
TEST_USER_ID = "507f1f77bcf86cd799439011"  # Mock ObjectId


@pytest.fixture(autouse=True)
def restore_auth_dependency(test_db):
    """
    Remove the mock get_current_user dependency override set by setup_server_with_in_memory_db.
    This allows the real get_current_user to run, which we need for testing auth endpoints.
    """
    overrides = app.dependency_overrides

    # Aggressively remove any get_current_user related overrides
    keys_to_remove = [
        k
        for k in overrides.keys()
        if "get_current_user" in getattr(k, "__name__", "")
        or "_get_current_user_async" in getattr(k, "__name__", "")
    ]
    for k in keys_to_remove:
        del overrides[k]

    yield


@pytest.fixture
async def auth_headers(test_db):
    """Create a valid auth token for a test user."""
    # Create a test user in the DB
    user_data = {
        "_id": TEST_USER_ID,
        "username": TEST_USERNAME,
        "role": "staff",
        "is_active": True,
        "full_name": "Test User Settings",
    }
    # Clean up any existing user/settings from previous tests
    await test_db.users.delete_many({"username": TEST_USERNAME})
    await test_db.user_settings.delete_many({"user_id": TEST_USER_ID})

    await test_db.users.insert_one(user_data)

    token = create_access_token(data={"sub": TEST_USERNAME})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_settings_defaults(async_client: AsyncClient, auth_headers):
    """Test getting settings when none exist (should return defaults)."""
    response = await async_client.get("/api/user/settings", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["theme"] == "light"
    assert data["data"]["auto_sync_enabled"] is True
    assert data["data"]["scanner_auto_submit"] is True
    assert data["data"]["show_item_images"] is True
    assert data["data"]["column_visibility"] == {
        "mfg_date": True,
        "expiry_date": True,
        "serial_number": True,
        "mrp": True,
    }
    assert data["data"]["font_size"] == 16
    assert data["data"]["font_style"] == "system"


@pytest.mark.asyncio
async def test_update_settings(async_client: AsyncClient, auth_headers, test_db):
    """Test updating user settings."""
    payload = {
        "theme": "dark",
        "auto_sync_enabled": False,
        "auto_sync_interval": 30,
        "scanner_timeout": 45,
        "font_size": 20,
        "font_style": "serif",
        "show_item_images": False,
        "session_timeout": 60,
        "biometric_auth": True,
        "operational_mode": "training",
        "column_visibility": {
            "mfg_date": False,
            "serial_number": False,
        },
    }

    response = await async_client.patch("/api/user/settings", json=payload, headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["theme"] == "dark"
    assert data["data"]["auto_sync_enabled"] is False
    assert data["data"]["auto_sync_interval"] == 30
    assert data["data"]["scanner_timeout"] == 45
    assert data["data"]["font_size"] == 20
    assert data["data"]["font_style"] == "serif"
    assert data["data"]["show_item_images"] is False
    assert data["data"]["session_timeout"] == 60
    assert data["data"]["biometric_auth"] is True
    assert data["data"]["operational_mode"] == "training"
    assert data["data"]["column_visibility"] == {
        "mfg_date": False,
        "expiry_date": True,
        "serial_number": False,
        "mrp": True,
    }

    # Verify in DB
    settings = await test_db.user_settings.find_one({"user_id": TEST_USER_ID})
    assert settings is not None
    assert settings["theme"] == "dark"
    assert settings["font_style"] == "serif"
    assert settings["column_visibility"]["serial_number"] is False


@pytest.mark.asyncio
async def test_get_settings_existing(async_client: AsyncClient, auth_headers, test_db):
    """Test getting settings that already exist."""
    # Pre-seed settings
    await test_db.user_settings.insert_one(
        {
            "user_id": TEST_USER_ID,
            "theme": "ocean",
            "font_size": "large",
            "auto_sync_interval": 999,
            "column_visibility": {"mfgDate": False, "mrp": False},
        }
    )

    response = await async_client.get("/api/user/settings", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["data"]["theme"] == "dark"
    assert data["data"]["auto_sync_interval"] == 120
    assert data["data"]["font_size"] == 18
    assert data["data"]["font_style"] == "system"
    assert data["data"]["column_visibility"] == {
        "mfg_date": False,
        "expiry_date": True,
        "serial_number": True,
        "mrp": False,
    }


@pytest.mark.asyncio
async def test_partial_nested_column_visibility_update(
    async_client: AsyncClient,
    auth_headers,
    test_db,
):
    """Test that partial nested column visibility updates merge with defaults."""
    await test_db.user_settings.insert_one(
        {
            "user_id": TEST_USER_ID,
            "column_visibility": {
                "mfg_date": True,
                "expiry_date": False,
                "serial_number": True,
                "mrp": False,
            },
        }
    )

    response = await async_client.patch(
        "/api/user/settings",
        json={"column_visibility": {"serial_number": False}},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["data"]["column_visibility"] == {
        "mfg_date": True,
        "expiry_date": False,
        "serial_number": False,
        "mrp": False,
    }


@pytest.mark.asyncio
async def test_unauthorized_access(async_client: AsyncClient):
    """Test access without token."""
    response = await async_client.get("/api/user/settings")
    assert response.status_code == 401
