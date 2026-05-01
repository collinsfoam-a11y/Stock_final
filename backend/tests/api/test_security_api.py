from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.security_api import get_suspicious_activity
from backend.services.security_dashboard_service import SecurityDashboardService


@pytest.mark.asyncio
async def test_get_suspicious_activity_formats_ip_and_user_results():
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    ip_cursor = AsyncMock()
    ip_cursor.to_list.return_value = [
        {
            "_id": "10.0.0.1",
            "count": 7,
            "usernames": ["staff1", "staff2"],
            "last_attempt": now,
        }
    ]

    user_cursor = AsyncMock()
    user_cursor.to_list.return_value = [
        {
            "_id": "staff1",
            "count": 6,
            "ips": ["10.0.0.1"],
            "last_attempt": now,
        }
    ]

    db = MagicMock()
    db.login_attempts.aggregate.side_effect = [ip_cursor, user_cursor]

    response = await get_suspicious_activity(
        current_user={"role": "admin"},
        hours=24,
        security_service=SecurityDashboardService(db),
    )

    assert response["success"] is True
    assert response["data"]["suspicious_ips"][0]["ip_address"] == "10.0.0.1"
    assert response["data"]["suspicious_users"][0]["username"] == "staff1"
    assert response["data"]["suspicious_ips"][0]["last_attempt"] == now.isoformat()
