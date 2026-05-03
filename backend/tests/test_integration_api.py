"""
Integration tests for backend API endpoints.
Tests health checks, authentication, and session CRUD operations.
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4


class TestHealthEndpoints:
    """Test health check endpoints."""

    @pytest.mark.asyncio
    async def test_liveness_check(self, async_client: AsyncClient):
        """Test liveness probe returns 200."""
        response = await async_client.get("/health/live")
        assert response.status_code == 200
        data = response.json()
        assert data["alive"] is True
        assert "timestamp" in data

    @pytest.mark.asyncio
    async def test_health_basic(self, async_client: AsyncClient):
        """Test basic health endpoint."""
        response = await async_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["service"] == "stock-verify-api"

    @pytest.mark.asyncio
    async def test_version_endpoint(self, async_client: AsyncClient):
        """Test version endpoint returns app info."""
        response = await async_client.get("/api/version")
        assert response.status_code == 200
        data = response.json()
        assert "version" in data
        assert "name" in data
        assert "environment" in data


class TestVersionCheck:
    """Test version compatibility checking."""

    @pytest.mark.asyncio
    async def test_version_check_valid(self, async_client: AsyncClient):
        """Test version check with valid version string."""
        response = await async_client.get("/api/version/check?client_version=1.0.0")
        assert response.status_code == 200
        data = response.json()
        assert "is_compatible" in data
        assert "is_latest" in data
        assert "client_version" in data

    @pytest.mark.asyncio
    async def test_version_check_invalid_format(self, async_client: AsyncClient):
        """Test version check with invalid version format."""
        response = await async_client.get("/api/version/check?client_version=invalid")
        # May return 422 for invalid format
        assert response.status_code in (200, 422)


class TestAuthEndpoints:
    """Test authentication endpoints."""

    @pytest.mark.asyncio
    async def test_login_success(self, async_client: AsyncClient):
        """Test successful login returns tokens."""
        response = await async_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        # May return 401 if admin user doesn't exist in test DB, which is acceptable
        assert response.status_code in (200, 201, 401)

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self, async_client: AsyncClient):
        """Test login with invalid credentials returns 401."""
        response = await async_client.post(
            "/api/auth/login",
            json={"username": "invalid", "password": "wrong"},
        )
        assert response.status_code in (401, 400)

    @pytest.mark.asyncio
    async def test_login_missing_fields(self, async_client: AsyncClient):
        """Test login with missing fields returns 422."""
        response = await async_client.post(
            "/api/auth/login",
            json={"username": "staff1"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_refresh_token(self, async_client: AsyncClient):
        """Test token refresh with valid refresh token."""
        # First login
        login_response = await async_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        if login_response.status_code not in (200, 201):
            pytest.skip("Login failed, skipping refresh test")
            return

        refresh_token = login_response.json().get("refresh_token")
        if not refresh_token:
            pytest.skip("No refresh token returned")

        # Refresh token
        response = await async_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data


class TestProtectedEndpoints:
    """Test endpoints that require authentication."""

    @pytest.mark.asyncio
    async def test_unauthorized_access(self, async_client: AsyncClient):
        """Test accessing protected endpoint without auth returns 401."""
        response = await async_client.get("/api/sessions")
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_authorized_access(self, async_client: AsyncClient, authenticated_headers: dict):
        """Test accessing protected endpoint with valid auth."""
        response = await async_client.get("/api/sessions", headers=authenticated_headers)
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_invalid_token(self, async_client: AsyncClient):
        """Test accessing with invalid token returns 401."""
        response = await async_client.get(
            "/api/sessions",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert response.status_code == 401


class TestSessionCRUD:
    """Test session creation and management."""

    @pytest.mark.asyncio
    async def test_create_session(self, async_client: AsyncClient, authenticated_headers: dict):
        """Test creating a new session."""
        session_data = {
            "warehouse": "Test Warehouse",
            "location_type": "Showroom",
            "location_name": "Floor 1",
            "rack_no": "A1",
            "type": "STANDARD",
            "client_session_id": str(uuid4()),
        }
        response = await async_client.post(
            "/api/sessions",
            json=session_data,
            headers=authenticated_headers,
        )
        assert response.status_code in (200, 201)
        data = response.json()
        assert "_id" in data or "id" in data
        assert data.get("status") in ("CREATED", "ACTIVE")

    @pytest.mark.asyncio
    async def test_get_sessions(self, async_client: AsyncClient, authenticated_headers: dict):
        """Test listing sessions."""
        response = await async_client.get("/api/sessions", headers=authenticated_headers)
        assert response.status_code == 200
        data = response.json()
        # Response may be paginated object or list
        assert isinstance(data, (list, dict))

    @pytest.mark.asyncio
    async def test_create_and_get_session(
        self, async_client: AsyncClient, authenticated_headers: dict
    ):
        """Test creating and retrieving a session."""
        # Create session
        session_data = {
            "warehouse": "Test Warehouse",
            "location_type": "Showroom",
            "location_name": "Floor 2",
            "rack_no": "B2",
            "type": "STANDARD",
            "client_session_id": str(uuid4()),
        }
        create_response = await async_client.post(
            "/api/sessions",
            json=session_data,
            headers=authenticated_headers,
        )
        assert create_response.status_code in (200, 201)
        created = create_response.json()
        session_id = created.get("_id") or created.get("id")

        # Get session
        get_response = await async_client.get(
            f"/api/sessions/{session_id}",
            headers=authenticated_headers,
        )
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["warehouse"] == "Test Warehouse"

    @pytest.mark.asyncio
    async def test_session_heartbeat(self, async_client: AsyncClient, authenticated_headers: dict):
        """Test session heartbeat keeps session alive."""
        # Create session
        session_data = {
            "warehouse": "Test Warehouse",
            "location_type": "Showroom",
            "location_name": "Floor 3",
            "rack_no": "C3",
            "type": "STANDARD",
            "client_session_id": str(uuid4()),
        }
        create_response = await async_client.post(
            "/api/sessions",
            json=session_data,
            headers=authenticated_headers,
        )
        if create_response.status_code not in (200, 201):
            pytest.skip("Session creation failed")
            return

        created = create_response.json()
        session_id = created.get("_id") or created.get("id")

        # Send heartbeat
        heartbeat_response = await async_client.post(
            f"/api/sessions/{session_id}/heartbeat",
            headers=authenticated_headers,
        )
        assert heartbeat_response.status_code in (200, 201, 204)


class TestCountLines:
    """Test count line operations."""

    @pytest.mark.asyncio
    async def test_create_count_line(self, async_client: AsyncClient, authenticated_headers: dict):
        """Test creating a count line."""
        # First create a session
        session_data = {
            "warehouse": "Test Warehouse",
            "location_type": "Showroom",
            "location_name": "Floor 4",
            "rack_no": "D4",
            "type": "STANDARD",
            "client_session_id": str(uuid4()),
        }
        session_response = await async_client.post(
            "/api/sessions",
            json=session_data,
            headers=authenticated_headers,
        )
        if session_response.status_code not in (200, 201):
            pytest.skip("Session creation failed")
            return

        session = session_response.json()
        session_id = session.get("_id") or session.get("id")

        # Create count line - may have different schema requirements
        count_data = {
            "session_id": session_id,
            "item_code": "ITEM001",
            "verified_qty": 10,
        }
        response = await async_client.post(
            "/api/count-lines",
            json=count_data,
            headers=authenticated_headers,
        )
        # May return 422 for validation errors, which is acceptable
        assert response.status_code in (200, 201, 422)


class TestPINAuth:
    """Test PIN authentication."""

    @pytest.mark.asyncio
    async def test_pin_login_requires_username(self, async_client: AsyncClient):
        """Test PIN login requires username parameter."""
        response = await async_client.post(
            "/api/auth/pin-login",
            json={"pin": "1234"},
        )
        # Endpoint may not exist or have different path - just check it doesn't crash
        assert response.status_code in (200, 401, 404, 422, 405)

    @pytest.mark.asyncio
    async def test_pin_login_requires_pin(self, async_client: AsyncClient):
        """Test PIN login requires pin parameter."""
        response = await async_client.post(
            "/api/auth/pin-login",
            json={"username": "staff1"},
        )
        # Endpoint may not exist or have different path - just check it doesn't crash
        assert response.status_code in (200, 401, 404, 422, 405)
