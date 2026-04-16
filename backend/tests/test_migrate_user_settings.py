from datetime import datetime

import pytest

from backend.scripts.migrate_user_settings import migrate_user_settings


@pytest.mark.asyncio
async def test_migrate_user_settings_normalizes_existing_documents(test_db):
    await test_db.users.delete_many({})
    await test_db.user_settings.delete_many({})

    await test_db.users.insert_many(
        [
            {"_id": "user-1", "username": "staff-a"},
            {"_id": "user-2", "username": "staff-b"},
        ]
    )

    created_at = datetime(2025, 1, 1, 9, 30, 0)
    await test_db.user_settings.insert_one(
        {
            "user_id": "user-1",
            "theme": "ocean",
            "font_size": "large",
            "font_style": "decorative",
            "auto_sync_interval": 999,
            "column_visibility": {
                "mfgDate": False,
                "mrp": False,
            },
            "primaryColor": "#ff00aa",
            "created_at": created_at,
        }
    )

    stats = await migrate_user_settings(test_db)

    assert stats == {
        "total_users": 2,
        "users_with_settings": 1,
        "users_normalized": 1,
        "users_migrated": 1,
        "errors": 0,
    }

    normalized = await test_db.user_settings.find_one({"user_id": "user-1"})
    assert normalized is not None
    assert normalized["theme"] == "dark"
    assert normalized["font_size"] == 18
    assert normalized["font_style"] == "system"
    assert normalized["auto_sync_interval"] == 120
    assert normalized["column_visibility"] == {
        "mfg_date": False,
        "expiry_date": True,
        "serial_number": True,
        "mrp": False,
    }
    assert normalized["created_at"] == created_at
    assert normalized["updated_at"] is not None
    assert "primaryColor" not in normalized

    migrated = await test_db.user_settings.find_one({"user_id": "user-2"})
    assert migrated is not None
    assert migrated["theme"] == "light"
    assert migrated["font_size"] == 16
    assert migrated["font_style"] == "system"
    assert migrated["created_at"] is not None
    assert migrated["updated_at"] is not None
