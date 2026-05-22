import pytest

from backend.scripts.create_staff_users import create_users
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_create_users_dry_run_does_not_write_or_require_password():
    db = InMemoryDatabase()

    stats = await create_users(db, ["staff2"], None, dry_run=True)

    assert stats["mode"] == "dry-run"
    assert stats["would_create"] == 1
    assert stats["created"] == 0
    assert await db.users.count_documents({"username": "staff2"}) == 0


@pytest.mark.asyncio
async def test_create_users_execute_requires_password():
    db = InMemoryDatabase()

    with pytest.raises(ValueError, match="STAFF_PASSWORD"):
        await create_users(db, ["staff2"], None, dry_run=False)


@pytest.mark.asyncio
async def test_create_users_execute_hashes_password_and_skips_existing_users():
    db = InMemoryDatabase()
    await db.users.insert_one({"username": "staff2", "hashed_password": "existing"})

    stats = await create_users(
        db,
        ["staff2", "staff3"],
        "Str0ngPass!2026",
        dry_run=False,
    )

    assert stats["existing"] == 1
    assert stats["would_create"] == 1
    assert stats["created"] == 1

    created_user = await db.users.find_one({"username": "staff3"})
    assert created_user is not None
    assert created_user["hashed_password"] != "Str0ngPass!2026"
    assert created_user["role"] == "staff"
