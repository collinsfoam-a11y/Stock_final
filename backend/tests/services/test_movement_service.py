from datetime import datetime

import pytest

from backend.services.governance_guard import (
    GovernanceViolation,
    install_db_write_guards,
    write_authority,
)
from backend.services.movement_service import MovementService
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_movement_service_creates_append_only_movements():
    db = InMemoryDatabase()
    install_db_write_guards(db)
    service = MovementService(db)

    movement = await service.create_manual_movement(
        session_id="session-1",
        warehouse="WH-1",
        item_code="ITEM-1",
        movement_type="SALE",
        quantity=-2,
        occurred_at=datetime(2024, 1, 1, 10, 0, 0),
        reason_code="ERP_SYNC_DELAY",
        reason="Manual adjustment for known transfer",
        actor_username="supervisor",
        device_id="device-1",
    )
    assert movement["source"] == "MANUAL"
    assert movement["warehouse"] == "WH-1"

    with pytest.raises(GovernanceViolation, match="immutable"):
        with write_authority("MovementService"):
            await db.inventory_movements.update_one(
                {"id": movement["id"]},
                {"$set": {"quantity": 123}},
            )
