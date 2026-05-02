import pytest
from datetime import datetime, timezone

from backend.auth.dependencies import get_current_user
from backend.server import app


async def mock_get_current_admin():
    return {
        "_id": "admin_id",
        "username": "admin",
        "role": "admin",
        "full_name": "Administrator",
        "is_active": True,
        "permissions": [],
    }


@pytest.mark.asyncio
class TestGovernance:
    async def test_config_immutability(self, async_client, test_db, authenticated_headers):
        """
        Verify that updating settings creates an immutable config version.
        """
        app.dependency_overrides[get_current_user] = mock_get_current_admin

        # 1. Update Settings
        # Note: Using partial update might fail pydantic validation if we don't provide all
        # SystemParameters or if we don't use the correct endpoint.
        # API expects SystemParameters which has defaults.
        # Let's construct a valid full payload based on defaults + change.
        full_payload = {
            "api_timeout": 45,  # changed
            "api_rate_limit": 100,
            "cache_enabled": True,
            "cache_ttl": 3600,
            "cache_max_size": 1000,
            "sync_interval": 3600,
            "sync_batch_size": 100,
            "auto_sync_enabled": True,
            "session_timeout": 3600,
            "max_concurrent_sessions": 50,
            "log_level": "INFO",
            "log_retention_days": 30,
            "enable_audit_log": True,
            "mongo_pool_size": 10,
            "sql_pool_size": 5,
            "query_timeout": 30,
            "password_min_length": 8,
            "password_require_uppercase": True,
            "password_require_lowercase": True,
            "password_require_numbers": True,
            "jwt_expiration": 86400,
            "enable_compression": True,
            "max_request_size": 10485760,
            "enable_cors": True,
        }

        response = await async_client.put(
            "/api/admin/settings/parameters", json=full_payload, headers=authenticated_headers
        )
        assert response.status_code == 200, f"Update failed: {response.text}"

        # 2. Verify Config Version Created
        # We need to access the underlying collection. test_db is InMemoryDatabase which behaves
        # like Motor IDB?
        # Assuming test_db is the database object.
        latest_version = await test_db.config_versions.find_one(sort=[("created_at", -1)])

        assert latest_version is not None
        assert latest_version["payload"]["api_timeout"] == 45
        assert "version_hash" in latest_version

    async def test_snapshot_hashing(self, async_client, test_db, authenticated_headers):
        """
        Verify that creating a session generates an inventory snapshot hash.
        """
        # 1. Seed some items for the warehouse
        warehouse_name = "GovTestWarehouse"
        await test_db.erp_items.insert_many(
            [
                {
                    "item_code": "I1",
                    "stock_qty": 10.0,
                    "warehouse": warehouse_name,
                    "barcode": "B1",
                },
                {"item_code": "I2", "stock_qty": 5.0, "warehouse": warehouse_name, "barcode": "B2"},
            ]
        )

        # 2. Create Session
        response = await async_client.post(
            "/api/sessions/",
            json={"warehouse": warehouse_name, "type": "STANDARD"},
            headers=authenticated_headers,
        )
        assert response.status_code == 200
        session_data = response.json()
        session_id = session_data["id"]

        # 3. Verify Session Fields
        session_doc = await test_db.sessions.find_one({"session_id": session_id})
        assert session_doc is not None
        assert "snapshot_hash" in session_doc
        assert session_doc["snapshot_hash"] is not None
        assert "config_version_id" in session_doc

        # 4. Verify Snapshot Collection
        snapshot_doc = await test_db.session_snapshots.find_one({"session_id": session_id})
        assert snapshot_doc is not None
        assert snapshot_doc["item_count"] == 2
        assert snapshot_doc["snapshot_hash"] == session_doc["snapshot_hash"]

    async def test_conflict_forking_engine(self, async_client, test_db, authenticated_headers):
        """
        Verify that modifying an APPROVED item creates a fork instead of overwriting.
        """
        # 1. Seed an APPROVED item
        item_code = "FORK_TEST_1"
        barcode = "BAR_FORK_1"
        await test_db.erp_items.insert_one(
            {
                "item_code": item_code,
                "barcode": barcode,
                "stock_qty": 100.0,
                "verified": True,
                "verified_qty": 100.0,
                "verified_by": "supervisor",
                "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        # 2. Attempt to verify with DIFFERENT quantity
        payload = {
            "verified": True,
            "verified_qty": 99.0,  # Difference!
            "session_id": "test_session_fork",
            "floor": "F1",
        }

        response = await async_client.patch(
            f"/api/v2/erp/items/{barcode}/verify", json=payload, headers=authenticated_headers
        )

        assert response.status_code == 200
        data = response.json()

        # 3. Verify Fork Response
        assert "fork_id" in data
        assert "Conflict detected" in data["message"]

        # 4. Verify DB State (Original Immutable)
        original_item = await test_db.erp_items.find_one({"barcode": barcode})
        assert original_item["verified_qty"] == 100.0

        # 5. Verify Fork Created
        fork_doc = await test_db.conflict_forks.find_one({"fork_id": data["fork_id"]})
        assert fork_doc is not None
        assert fork_doc["conflicting_payload"]["verified_qty"] == 99.0
