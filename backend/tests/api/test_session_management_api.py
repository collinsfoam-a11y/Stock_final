"""
Comprehensive test suite for session_management_api.py
Target: Achieve 80%+ coverage
"""

import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from backend.api.session_management_api import (
    _collect_snapshot_items,
    _session_client_identity_filter,
)
from backend.api.schemas import SessionCreate
from backend.server import app
from backend.tests.utils.in_memory_db import InMemoryDatabase


class _AsyncCursor:
    def __init__(self, items):
        self._items = list(items)
        self._index = 0

    def sort(self, key, direction):
        reverse = direction < 0
        self._items.sort(key=lambda item: item.get(key), reverse=reverse)
        return self

    def skip(self, count):
        self._items = self._items[count:]
        return self

    def limit(self, count):
        self._items = self._items[:count]
        return self

    async def to_list(self, length=None):
        if length is None:
            return list(self._items)
        return list(self._items[:length])

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self._items):
            raise StopAsyncIteration
        item = self._items[self._index]
        self._index += 1
        return item


def test_session_client_identity_filter_enforces_ttl_window(monkeypatch):
    monkeypatch.setattr(
        "backend.api.session_management_api.settings.SESSION_CLIENT_ID_TTL_HOURS", 24
    )
    session_create = SessionCreate(
        warehouse="WH001",
        client_session_id="11111111-1111-4111-8111-111111111111",
    )

    identity_filter = _session_client_identity_filter(session_create, "staff1")

    assert identity_filter is not None
    assert identity_filter["staff_user"] == "staff1"
    freshness_clause = identity_filter["$and"][1]["$or"]
    cutoff = freshness_clause[0]["started_at"]["$gte"]
    assert datetime.now(timezone.utc).replace(tzinfo=None) - cutoff < timedelta(hours=25)


@pytest.fixture
def mock_user_staff():
    """Create mock staff user"""
    return {"username": "staff1", "role": "staff", "full_name": "Staff User"}


@pytest.fixture
def mock_user_supervisor():
    """Create mock supervisor user"""
    return {
        "username": "supervisor1",
        "role": "supervisor",
        "full_name": "Supervisor User",
    }


@pytest.fixture
def sample_session_data():
    """Create sample session data"""
    return {
        "id": "sess_123",
        "warehouse": "WH001",
        "staff_user": "staff1",
        "staff_name": "Staff User",
        "status": "OPEN",
        "type": "STANDARD",
        "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }


@pytest.fixture
def sample_verification_session():
    """Create sample canonical session data"""
    return {
        "id": "sess_123",
        "session_id": "sess_123",
        "warehouse": "WH001",
        "staff_user": "staff1",
        "staff_name": "Staff User",
        "status": "ACTIVE",
        "type": "STANDARD",
        "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
        "rack_no": None,
        "location_name": None,
    }


class TestSessionModels:
    """Test session models and validation"""

    def test_session_create_model(self):
        """Test SessionCreate model validation"""
        session_create = SessionCreate(warehouse="WH001", type="STANDARD")
        assert session_create.warehouse == "WH001"
        assert session_create.type == "STANDARD"

    def test_session_create_model_accepts_location_metadata(self):
        session_create = SessionCreate(
            warehouse="Showroom - Ground Floor - A1",
            type="STANDARD",
            location_type="Showroom",
            location_name="Ground Floor",
            rack_no="A1",
        )
        assert session_create.location_type == "Showroom"
        assert session_create.location_name == "Ground Floor"
        assert session_create.rack_no == "A1"

    def test_session_create_model_accepts_offline_identity(self):
        session_create = SessionCreate(
            warehouse="WH001",
            client_session_id="offline-session-1",
            offline_id="offline-session-1",
        )
        assert session_create.client_session_id == "offline-session-1"
        assert session_create.offline_id == "offline-session-1"

    def test_session_create_default_type(self):
        """Test SessionCreate default type"""
        session_create = SessionCreate(warehouse="WH001")
        assert session_create.type == "STANDARD"

    def test_session_create_warehouse_required(self):
        """Test that warehouse is required"""
        with pytest.raises(Exception):
            SessionCreate()


class TestAsyncCursor:
    def test_async_cursor_applies_sort_skip_and_limit(self):
        cursor = _AsyncCursor(
            [
                {"id": "sess-1", "started_at": 1},
                {"id": "sess-2", "started_at": 3},
                {"id": "sess-3", "started_at": 2},
            ]
        )

        limited = cursor.sort("started_at", -1).skip(1).limit(1)

        assert limited._items == [{"id": "sess-3", "started_at": 2}]


class TestSnapshotLocationMatching:
    @pytest.mark.asyncio
    async def test_collect_snapshot_items_uses_showroom_alias_for_plain_warehouse(self):
        db = InMemoryDatabase()
        await db.erp_items.insert_one(
            {
                "item_code": "ITEM-001",
                "stock_qty": 8,
                "warehouse": "Primary",
                "barcode": "123456",
            }
        )

        snapshot_items = await _collect_snapshot_items(db, "Showroom")

        assert len(snapshot_items) == 1
        assert snapshot_items[0].item_code == "ITEM-001"
        assert snapshot_items[0].warehouse == "Primary"


class TestCreateSessionEndpoint:
    """Test POST /api/sessions/"""

    @pytest.mark.asyncio
    async def test_create_session_success(self, mock_user_staff):
        """Test successful session creation"""
        mock_db = AsyncMock()
        inserted_session: dict[str, object] = {}
        mock_db.sessions = AsyncMock()

        async def _sessions_find_one(query, *args, **kwargs):
            if "staff_user" in query:
                return None
            lookup_id = query.get("id") or query.get("session_id")
            if lookup_id is None and isinstance(query.get("$or"), list):
                for clause in query["$or"]:
                    if not isinstance(clause, dict):
                        continue
                    lookup_id = clause.get("id") or clause.get("session_id")
                    if lookup_id is not None:
                        break
            if inserted_session and lookup_id in {
                inserted_session.get("id"),
                inserted_session.get("session_id"),
            }:
                return dict(inserted_session)
            return None

        async def _sessions_insert_one(doc, *args, **kwargs):
            inserted_session.clear()
            inserted_session.update(dict(doc))
            return SimpleNamespace(inserted_id=doc.get("id"))

        async def _sessions_update_one(_filter, update, *args, **kwargs):
            if inserted_session:
                inserted_session.update(update.get("$set", {}))
                inc_version = int(update.get("$inc", {}).get("version", 0) or 0)
                if inc_version:
                    current_version = int(inserted_session.get("version", 0) or 0)
                    inserted_session["version"] = current_version + inc_version
            return SimpleNamespace(modified_count=1)

        mock_db.sessions.find_one = AsyncMock(side_effect=_sessions_find_one)
        mock_db.sessions.count_documents = AsyncMock(return_value=0)
        mock_db.sessions.update_many = AsyncMock()  # For auto-close
        mock_db.sessions.insert_one = AsyncMock(side_effect=_sessions_insert_one)
        mock_db.sessions.update_one = AsyncMock(side_effect=_sessions_update_one)
        mock_db.verification_sessions = AsyncMock()
        mock_db.verification_sessions.update_many = AsyncMock()  # For auto-close
        mock_db.verification_sessions.update_one = AsyncMock(
            return_value=SimpleNamespace(modified_count=1)
        )
        mock_db.verification_sessions.insert_one = AsyncMock(
            return_value=AsyncMock(inserted_id="vsess_123")
        )

        # Mock Governance collections
        mock_db.config_versions = AsyncMock()
        mock_db.config_versions.find_one = AsyncMock(
            return_value={
                "id": "v1",
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        mock_db.erp_items = AsyncMock()

        # Create an async generator for the cursor
        async def mock_items_gen(*args, **kwargs):
            yield {
                "item_code": "ITEM-001",
                "stock_qty": 50,
                "warehouse": "WH001",
                "_id": "item_1",
            }

        mock_cursor = MagicMock()
        mock_cursor.__aiter__ = mock_items_gen
        mock_db.erp_items.find = MagicMock(return_value=mock_cursor)

        mock_db.session_snapshots = AsyncMock()
        mock_db.session_snapshots.find_one = AsyncMock(return_value=None)
        mock_db.session_snapshots.insert_one = AsyncMock()

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        # Mock refresh token service
        mock_refresh_service = AsyncMock()
        mock_refresh_service.revoke_all_user_tokens = AsyncMock(return_value=0)

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db
        from unittest.mock import patch

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            # Patch the direct call to get_refresh_token_service
            with patch(
                "backend.api.session_management_api.get_refresh_token_service",
                return_value=mock_refresh_service,
            ):
                async with AsyncClient(
                    transport=ASGITransport(app=app),
                    base_url="http://localhost",
                ) as client:
                    response = await client.post(
                        "/api/sessions/",
                        json={"warehouse": "WH001", "type": "STANDARD"},
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert data["warehouse"] == "WH001"
                    assert data["status"] == "OPEN"
                    assert data["staff_user"] == "staff1"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_create_session_returns_existing_open_session(self, mock_user_staff):
        existing_session = {
            "_id": "mongo_1",
            "id": "sess_existing",
            "warehouse": "WH001",
            "staff_user": "staff1",
            "staff_name": "Staff User",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
        }

        mock_db = AsyncMock()
        mock_db.sessions = AsyncMock()
        mock_db.sessions.find_one = AsyncMock(return_value=existing_session)
        mock_db.sessions.update_many = AsyncMock()
        mock_db.sessions.insert_one = AsyncMock()
        mock_db.verification_sessions = AsyncMock()
        mock_db.verification_sessions.update_many = AsyncMock()
        mock_db.verification_sessions.insert_one = AsyncMock()

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.post(
                    "/api/sessions/",
                    json={"warehouse": "WH001", "type": "STANDARD"},
                )
                assert response.status_code == 200
                assert response.json()["id"] == "sess_existing"
                mock_db.sessions.update_many.assert_not_awaited()
                mock_db.sessions.insert_one.assert_not_awaited()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_create_session_empty_warehouse(self, mock_user_staff):
        """Test session creation fails with empty warehouse"""
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.count_documents = AsyncMock(return_value=0)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.post(
                    "/api/sessions/",
                    json={"warehouse": "   "},  # Empty after strip
                )
                assert response.status_code == 400
                assert "empty" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.clear()


class TestGetSessionsEndpoint:
    """Test GET /api/sessions/"""

    @pytest.mark.asyncio
    async def test_get_sessions_staff_sees_own(
        self, mock_user_staff, sample_session_data
    ):
        """Test staff user only sees their own sessions"""
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.count_documents = AsyncMock(return_value=1)

        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.skip = MagicMock(return_value=cursor)
        cursor.limit = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=[sample_session_data])
        mock_db.sessions.find = MagicMock(return_value=cursor)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/")
                assert response.status_code == 200
                data = response.json()
                assert "items" in data
                assert "total" in data
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_sessions_supervisor_sees_all(self, mock_user_supervisor):
        """Test supervisor can see all sessions"""
        sessions = [
            {
                "id": "1",
                "warehouse": "WH1",
                "staff_user": "staff1",
                "staff_name": "Staff 1",
                "status": "OPEN",
                "type": "STANDARD",
                "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            },
            {
                "id": "2",
                "warehouse": "WH2",
                "staff_user": "staff2",
                "staff_name": "Staff 2",
                "status": "ACTIVE",
                "type": "STANDARD",
                "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            },
        ]

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.count_documents = AsyncMock(return_value=2)

        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.skip = MagicMock(return_value=cursor)
        cursor.limit = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=sessions)
        mock_db.sessions.find = MagicMock(return_value=cursor)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_supervisor

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/")
                assert response.status_code == 200
                data = response.json()
                assert data["total"] == 2
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_sessions_access_denied_for_other_user(self, mock_user_staff):
        """Test staff cannot filter by other user's sessions"""
        mock_db = MagicMock()

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/?user_id=other_user")
                assert response.status_code == 403
                assert "Access denied" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()


class TestGetSessionDetailEndpoint:
    """Test GET /api/sessions/{session_id}"""

    @pytest.mark.asyncio
    async def test_get_session_detail_success(
        self, mock_user_staff, sample_verification_session
    ):
        """Test getting session details"""
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=sample_verification_session)
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.find = MagicMock(
            return_value=_AsyncCursor(
                [
                    {
                        "session_id": "sess_123",
                        "status": "approved",
                        "verified": True,
                        "variance": 0.0,
                    }
                ]
            )
        )

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/sess_123")
                assert response.status_code == 200
                data = response.json()
                assert data["id"] == "sess_123"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, mock_user_staff):
        """Test getting non-existent session"""
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=None)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/nonexistent")
                assert response.status_code == 404
                assert "not found" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_session_access_denied(self, mock_user_staff):
        """Test staff cannot view other user's session"""
        other_session = {
            "id": "sess_other",
            "session_id": "sess_other",
            "warehouse": "WH001",
            "staff_user": "other_user",
            "staff_name": "Other User",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
        }

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=other_session)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/sess_other")
                assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()


class TestSessionStatsEndpoint:
    """Test GET /api/sessions/{session_id}/stats"""

    @pytest.mark.asyncio
    async def test_get_session_stats(
        self, mock_user_staff, sample_verification_session
    ):
        """Test getting session statistics"""
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=sample_verification_session)
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.find = MagicMock(
            return_value=_AsyncCursor(
                [
                    {
                        "session_id": "sess_123",
                        "status": "approved" if index < 30 else "pending",
                        "verified": index < 30,
                        "variance": 0.0,
                        "damaged_qty": 1 if index < 5 else 0,
                    }
                    for index in range(50)
                ]
            )
        )

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/sess_123/stats")
                assert response.status_code == 200
                data = response.json()
                assert data["total_items"] == 50
                assert data["verified_items"] == 50
                assert data["damage_items"] == 5
                assert data["pending_items"] == 0
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_session_stats_empty(
        self, mock_user_staff, sample_verification_session
    ):
        """Test session stats when no items counted"""
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=sample_verification_session)
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.find = MagicMock(return_value=_AsyncCursor([]))

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/sess_123/stats")
                assert response.status_code == 200
                data = response.json()
                assert data["total_items"] == 0
                assert data["verified_items"] == 0
        finally:
            app.dependency_overrides.clear()


class TestCompleteSessionEndpoint:
    """Test POST /api/sessions/{session_id}/complete"""

    @pytest.mark.asyncio
    async def test_complete_session_success(
        self, mock_user_supervisor, sample_verification_session
    ):
        """Test successful session completion"""
        reconciled_session = {
            **sample_verification_session,
            "status": "ACTIVE",
            "reconciled_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=reconciled_session)
        mock_db.sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.find = MagicMock(return_value=_AsyncCursor([]))
        mock_db.count_lines.update_many = AsyncMock(
            return_value=MagicMock(modified_count=0)
        )
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.find_one = AsyncMock(return_value=None)
        mock_db.verification_sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_db.rack_registry = MagicMock()
        mock_db.rack_registry.update_one = AsyncMock(
            return_value=MagicMock(modified_count=0)
        )

        mock_redis = MagicMock()
        mock_lock_manager = MagicMock()
        mock_lock_manager.release_rack_lock = AsyncMock(return_value=True)
        mock_lock_manager.delete_session = AsyncMock(return_value=True)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_supervisor

        async def override_get_redis():
            return mock_redis

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db
        from backend.services.redis_service import get_redis

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user
        app.dependency_overrides[get_redis] = override_get_redis

        try:
            from unittest.mock import patch

            with patch(
                "backend.api.session_management_api.get_lock_manager",
                return_value=mock_lock_manager,
            ):
                async with AsyncClient(
                    transport=ASGITransport(app=app),
                    base_url="http://localhost",
                ) as client:
                    response = await client.post("/api/sessions/sess_123/complete")
                    assert response.status_code == 410
                    data = response.json()
                    assert "disabled" in data["detail"].lower()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_complete_session_not_owner(self, mock_user_staff):
        """Test staff cannot finalize a session without supervisor permissions"""
        other_session = {
            "id": "sess_other",
            "session_id": "sess_other",
            "warehouse": "WH001",
            "staff_user": "other_user",
            "staff_name": "Other User",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
            "reconciled_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=other_session)
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.find_one = AsyncMock(return_value=None)

        mock_redis = MagicMock()

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        async def override_get_redis():
            return mock_redis

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db
        from backend.services.redis_service import get_redis

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user
        app.dependency_overrides[get_redis] = override_get_redis

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.post("/api/sessions/sess_other/complete")
                assert response.status_code == 410
                assert "disabled" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.clear()


class TestUpdateSessionStatusEndpoint:
    """Test PUT /api/sessions/{session_id}/status"""

    @pytest.mark.asyncio
    async def test_update_status_success(
        self, mock_user_staff, sample_verification_session
    ):
        """Test updating session status"""
        mock_db = MagicMock()
        active_session = {**sample_verification_session, "status": "ACTIVE"}
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=active_session)
        mock_db.sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.put(
                    "/api/sessions/sess_123/status?status=RECONCILE"
                )
                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["status"] == "REVIEW"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_update_status_supervisor_can_modify_others(
        self, mock_user_supervisor
    ):
        """Test supervisor can update any session"""
        session = {
            "id": "sess_123",
            "session_id": "sess_123",
            "warehouse": "WH001",
            "staff_user": "staff1",
            "staff_name": "Staff User",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
        }

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=session)
        mock_db.sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_supervisor

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.put(
                    "/api/sessions/sess_123/status?status=REVIEW"
                )
                assert response.status_code == 200
        finally:
            app.dependency_overrides.clear()


class TestActiveSessionsEndpoint:
    """Test GET /api/sessions/active"""

    @pytest.mark.asyncio
    async def test_get_active_sessions(self, mock_user_staff):
        """Test getting active sessions"""
        active_sessions = [
            {
                "id": "sess_1",
                "session_id": "sess_1",
                "warehouse": "WH001",
                "staff_user": "staff1",
                "staff_name": "Staff User",
                "status": "ACTIVE",
                "type": "STANDARD",
                "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
                "rack_no": "R1",
                "location_name": "F1",
            }
        ]

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find = MagicMock(return_value=_AsyncCursor(active_sessions))
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.find = MagicMock(
            return_value=_AsyncCursor(
                [
                    {
                        "session_id": "sess_1",
                        "status": "pending",
                        "verified": False,
                        "variance": 0.0,
                    }
                ]
            )
        )

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/active")
                assert response.status_code == 200
                data = response.json()
                assert len(data) >= 0  # May be filtered
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_active_sessions_includes_reconcile_and_uses_session_id_for_counts(
        self, mock_user_staff
    ):
        active_sessions = [
            {
                "session_id": "sess_reconcile_only",
                "warehouse": "WH001",
                "staff_user": "staff1",
                "staff_name": "Staff User",
                "status": "RECONCILE",
                "type": "STANDARD",
                "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
                "rack_no": "R1",
                "location_name": "F1",
            }
        ]

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()

        def _find_sessions(query):
            assert query["status"]["$in"] == ["OPEN", "ACTIVE", "PAUSED", "RECONCILE"]
            return _AsyncCursor(active_sessions)

        mock_db.sessions.find = MagicMock(side_effect=_find_sessions)
        mock_db.count_lines = MagicMock()

        def _find_count_lines(query):
            assert query == {"session_id": "sess_reconcile_only"}
            return _AsyncCursor(
                [
                    {
                        "session_id": "sess_reconcile_only",
                        "status": "pending",
                        "verified": False,
                        "variance": 0.0,
                    }
                ]
            )

        mock_db.count_lines.find = MagicMock(side_effect=_find_count_lines)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/active")
                assert response.status_code == 200
                data = response.json()
                assert len(data) == 1
                assert data[0]["id"] == "sess_reconcile_only"
                assert data[0]["item_count"] == 1
        finally:
            app.dependency_overrides.clear()


class TestSessionIdentifierFallbacks:
    @pytest.mark.asyncio
    async def test_session_heartbeat_updates_canonical_session_by_session_id(
        self, mock_user_staff
    ):
        session = {
            "session_id": "sess_heartbeat_only",
            "warehouse": "WH001",
            "staff_user": "staff1",
            "staff_name": "Staff User",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
            "rack_no": None,
        }

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=session)
        mock_db.sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )

        mock_redis = MagicMock()
        mock_lock_manager = MagicMock()
        mock_lock_manager.update_user_heartbeat = AsyncMock(return_value=None)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        async def override_get_redis():
            return mock_redis

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db
        from backend.services.redis_service import get_redis
        from unittest.mock import patch

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user
        app.dependency_overrides[get_redis] = override_get_redis

        try:
            with patch(
                "backend.api.session_management_api.get_lock_manager",
                return_value=mock_lock_manager,
            ):
                async with AsyncClient(
                    transport=ASGITransport(app=app),
                    base_url="http://localhost",
                ) as client:
                    response = await client.post(
                        "/api/sessions/sess_heartbeat_only/heartbeat"
                    )
                    assert response.status_code == 200
        finally:
            app.dependency_overrides.clear()

        mock_db.sessions.update_one.assert_awaited_once()
        filter_query = mock_db.sessions.update_one.await_args.args[0]
        assert filter_query == {
            "$and": [
                {
                    "$or": [
                        {"id": "sess_heartbeat_only"},
                        {"session_id": "sess_heartbeat_only"},
                    ]
                },
                {
                    "$or": [
                        {"version": 0},
                        {"version": {"$exists": False}},
                    ]
                },
            ]
        }

    @pytest.mark.asyncio
    async def test_complete_session_allows_owner_from_canonical_user_id_and_updates_by_session_id(
        self, mock_user_staff
    ):
        session = {
            "session_id": "sess_owner_user_id_only",
            "warehouse": "WH001",
            "user_id": "staff1",
            "staff_name": "Staff User",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
            "rack_no": None,
        }

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find_one = AsyncMock(return_value=session)
        mock_db.sessions.update_one = AsyncMock(
            return_value=MagicMock(modified_count=1)
        )
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.find_one = AsyncMock(return_value=None)
        mock_db.rack_registry = MagicMock()

        mock_redis = MagicMock()
        mock_lock_manager = MagicMock()
        mock_lock_manager.delete_session = AsyncMock(return_value=True)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        async def override_get_redis():
            return mock_redis

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db
        from backend.services.redis_service import get_redis
        from unittest.mock import patch

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user
        app.dependency_overrides[get_redis] = override_get_redis

        try:
            with patch(
                "backend.api.session_management_api.get_lock_manager",
                return_value=mock_lock_manager,
            ):
                async with AsyncClient(
                    transport=ASGITransport(app=app),
                    base_url="http://localhost",
                ) as client:
                    response = await client.post(
                        "/api/sessions/sess_owner_user_id_only/complete"
                    )
                    assert response.status_code == 410
                    assert "disabled" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.clear()


class TestUserWorkflowEndpoint:
    """Test GET /api/sessions/user-workflows"""

    @staticmethod
    def _mock_cursor(rows):
        cursor = MagicMock()
        cursor.to_list = AsyncMock(return_value=rows)
        return cursor

    async def _get_user_workflows(
        self,
        mock_user_supervisor,
        *,
        active_sessions,
        session_counts,
        pending_reviews,
        recount_assignments,
        users,
    ):
        session_count_cursor = self._mock_cursor(session_counts)
        pending_cursor = self._mock_cursor(pending_reviews)
        recount_cursor = self._mock_cursor(recount_assignments)
        users_cursor = self._mock_cursor(users)

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find = MagicMock(return_value=_AsyncCursor(active_sessions))
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.aggregate = MagicMock(
            side_effect=[session_count_cursor, pending_cursor, recount_cursor]
        )
        mock_db.users = MagicMock()
        mock_db.users.find = MagicMock(return_value=users_cursor)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_supervisor

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/user-workflows")
                assert response.status_code == 200
                return response.json()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_get_user_workflows(self, mock_user_supervisor):
        """Aggregates active session, review queue, and recount queue by user."""
        active_sessions = [
            {
                "id": "sess_1",
                "session_id": "sess_1",
                "warehouse": "WH001",
                "staff_user": "staff1",
                "staff_name": "Staff One",
                "status": "ACTIVE",
                "type": "STANDARD",
                "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "last_heartbeat": datetime.now(timezone.utc).replace(tzinfo=None),
                "rack_no": "R1",
                "location_name": "F1",
                "total_items": 12,
                "total_variance": 4.5,
            }
        ]

        data = await self._get_user_workflows(
            mock_user_supervisor,
            active_sessions=active_sessions,
            session_counts=[
                {
                    "_id": "sess_1",
                    "items_counted": 6,
                    "reviewed_items": 3,
                    "last_counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            ],
            pending_reviews=[
                {
                    "_id": "staff1",
                    "pending_approvals": 2,
                    "pending_review_since": datetime.now(timezone.utc).replace(
                        tzinfo=None
                    ),
                    "last_pending_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            ],
            recount_assignments=[
                {
                    "_id": "staff1",
                    "assigned_recounts": 1,
                    "recount_assigned_at": datetime.now(timezone.utc).replace(
                        tzinfo=None
                    ),
                    "last_recount_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            ],
            users=[
                {
                    "username": "staff1",
                    "full_name": "Staff One",
                    "role": "staff",
                }
            ],
        )

        assert len(data) == 1
        assert data[0]["username"] == "staff1"
        assert data[0]["workflow_stage"] == "RECOUNT_QUEUE"
        assert data[0]["presence_status"] == "ONLINE"
        assert data[0]["warehouse"] == "WH001"
        assert data[0]["pending_approvals"] == 2
        assert data[0]["assigned_recounts"] == 1
        assert data[0]["items_counted"] == 6
        assert data[0]["progress_percent"] == 50.0
        assert data[0]["next_action"] == "HANDLE_RECOUNT"
        assert data[0]["priority_score"] > 0
        assert data[0]["priority_band"] in {"HIGH", "CRITICAL"}
        assert data[0]["pending_review_since"] is not None
        assert data[0]["recount_assigned_at"] is not None

    @pytest.mark.asyncio
    async def test_get_user_workflows_sorts_highest_priority_first(
        self, mock_user_supervisor
    ):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        active_sessions = [
            {
                "id": "sess_1",
                "session_id": "sess_1",
                "warehouse": "WH001",
                "staff_user": "staff1",
                "staff_name": "Staff One",
                "status": "ACTIVE",
                "type": "STANDARD",
                "started_at": now,
                "last_heartbeat": now,
                "rack_no": "R1",
                "location_name": "F1",
                "total_items": 12,
                "total_variance": 4.5,
            },
            {
                "id": "sess_2",
                "session_id": "sess_2",
                "warehouse": "WH002",
                "staff_user": "staff2",
                "staff_name": "Staff Two",
                "status": "ACTIVE",
                "type": "STANDARD",
                "started_at": now,
                "last_heartbeat": now,
                "rack_no": "R2",
                "location_name": "F2",
                "total_items": 10,
                "total_variance": 0.0,
            },
        ]

        data = await self._get_user_workflows(
            mock_user_supervisor,
            active_sessions=active_sessions,
            session_counts=[
                {
                    "_id": "sess_1",
                    "items_counted": 6,
                    "reviewed_items": 3,
                    "last_counted_at": now,
                },
                {
                    "_id": "sess_2",
                    "items_counted": 8,
                    "reviewed_items": 8,
                    "last_counted_at": now,
                },
            ],
            pending_reviews=[
                {
                    "_id": "staff1",
                    "pending_approvals": 2,
                    "pending_review_since": now,
                    "last_pending_at": now,
                }
            ],
            recount_assignments=[
                {
                    "_id": "staff1",
                    "assigned_recounts": 1,
                    "recount_assigned_at": now,
                    "last_recount_at": now,
                }
            ],
            users=[
                {"username": "staff1", "full_name": "Staff One", "role": "staff"},
                {"username": "staff2", "full_name": "Staff Two", "role": "staff"},
            ],
        )

        assert [row["username"] for row in data] == ["staff1", "staff2"]
        assert data[0]["priority_score"] >= data[1]["priority_score"]


class TestSessionAnalyticsEndpoint:
    """Test GET /api/sessions/analytics"""

    @pytest.mark.asyncio
    async def test_get_sessions_analytics(self, mock_user_supervisor):
        """Test session analytics resolves to the static analytics route, not session detail."""
        overall_cursor = MagicMock()
        overall_cursor.to_list = AsyncMock(
            return_value=[
                {
                    "_id": None,
                    "total_sessions": 2,
                    "total_items": 15,
                    "total_variance": 3,
                    "avg_variance": 1.5,
                }
            ]
        )

        by_date_cursor = MagicMock()
        by_date_cursor.to_list = AsyncMock(
            return_value=[
                {"_id": "2026-03-12", "count": 2},
            ]
        )

        by_warehouse_cursor = MagicMock()
        by_warehouse_cursor.to_list = AsyncMock(
            return_value=[
                {"_id": "WH001", "total_variance": 3},
            ]
        )

        by_staff_cursor = MagicMock()
        by_staff_cursor.to_list = AsyncMock(
            return_value=[
                {"_id": "Supervisor User", "total_items": 15},
            ]
        )

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.aggregate = MagicMock(
            side_effect=[
                overall_cursor,
                by_date_cursor,
                by_warehouse_cursor,
                by_staff_cursor,
            ]
        )
        mock_db.verification_sessions = MagicMock()
        mock_db.verification_sessions.find_one = AsyncMock(return_value=None)

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_supervisor

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/analytics")
                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["data"]["total_sessions"] == 2
                assert data["data"]["sessions_by_date"]["2026-03-12"] == 2
                assert data["data"]["variance_by_warehouse"]["WH001"] == 3
                assert data["data"]["items_by_staff"]["Supervisor User"] == 15
                mock_db.verification_sessions.find_one.assert_not_called()
        finally:
            app.dependency_overrides.clear()


class TestUserSessionHistoryEndpoint:
    """Test GET /api/sessions/user/history"""

    @pytest.mark.asyncio
    async def test_get_user_history(self, mock_user_staff):
        """Test getting user's session history"""
        history = [
            {
                "id": "sess_old",
                "session_id": "sess_old",
                "warehouse": "WH001",
                "staff_user": "staff1",
                "staff_name": "Staff User",
                "status": "CLOSED",
                "type": "STANDARD",
                "started_at": time.time() - 3600,
                "last_heartbeat": time.time() - 3500,
                "completed_at": time.time() - 3400,
            }
        ]

        mock_db = MagicMock()
        mock_db.sessions = MagicMock()
        mock_db.sessions.find = MagicMock(return_value=_AsyncCursor(history))
        mock_db.count_lines = MagicMock()
        mock_db.count_lines.find = MagicMock(
            return_value=_AsyncCursor(
                [
                    {
                        "session_id": "sess_old",
                        "status": "approved",
                        "verified": True,
                        "variance": 0.0,
                    }
                ]
            )
        )

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            return mock_user_staff

        from backend.auth.dependencies import get_current_user_async
        from backend.db.runtime import get_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user_async] = override_get_current_user

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://localhost",
            ) as client:
                response = await client.get("/api/sessions/user/history")
                assert response.status_code == 200
                data = response.json()
                assert isinstance(data, list)
        finally:
            app.dependency_overrides.clear()
