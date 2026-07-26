import pytest


@pytest.fixture
def test_user():
    return {"username": "staff1", "role": "staff"}


@pytest.mark.asyncio
async def test_get_sessions_endpoint(async_client, authenticated_headers, test_user):
    """Test GET /api/sessions returns list of sessions"""
    # Create a session first (if not exists)
    # But we can just check if it returns 200 and correct structure

    response = await async_client.get("/api/sessions/", headers=authenticated_headers)
    assert response.status_code == 200
    data = response.json()

    # Check structure: items list + flat pagination fields
    assert "items" in data
    assert isinstance(data["items"], list)

    # Pagination fields are at top level (not nested)
    assert "page" in data
    assert "page_size" in data
    assert "total" in data
    assert "total_pages" in data
    assert "has_next" in data
    assert "has_previous" in data


@pytest.mark.asyncio
async def test_create_session_endpoint(async_client, authenticated_headers, test_user):
    """Test POST /api/sessions creates a session"""
    payload = {"warehouse": "Test Warehouse", "type": "STANDARD"}

    response = await async_client.post(
        "/api/sessions/", json=payload, headers=authenticated_headers
    )
    assert response.status_code == 200
    data = response.json()

    assert data["warehouse"] == "Test Warehouse"
    assert data["staff_user"] == test_user["username"]
    assert "id" in data
    assert data["status"] == "OPEN"


@pytest.mark.asyncio
async def test_get_sessions_pagination(async_client, authenticated_headers):
    """Test pagination parameters"""
    response = await async_client.get(
        "/api/sessions/?page=1&page_size=5", headers=authenticated_headers
    )
    assert response.status_code == 200
    data = response.json()

    # Pagination fields are at top level
    assert data["page"] == 1
    assert data["page_size"] == 5


@pytest.mark.asyncio
async def test_get_single_session(async_client, authenticated_headers):
    """Test getting a single session by ID"""
    # First create a session
    payload = {"warehouse": "Test Warehouse 2", "type": "STANDARD"}
    create_response = await async_client.post(
        "/api/sessions/", json=payload, headers=authenticated_headers
    )
    assert create_response.status_code == 200
    session_id = create_response.json()["id"]

    # Then get it by ID
    response = await async_client.get(f"/api/sessions/{session_id}", headers=authenticated_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == session_id
    # Just verify we got a valid response with an id
    assert "id" in data


@pytest.mark.asyncio
async def test_session_not_found(async_client, authenticated_headers):
    """Test getting a non-existent session returns 404"""
    response = await async_client.get(
        "/api/sessions/nonexistent-session-id", headers=authenticated_headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_session_with_different_types(async_client, authenticated_headers):
    """Test creating sessions with different types"""
    for session_type in ["STANDARD", "SPOT_CHECK", "CYCLE_COUNT"]:
        payload = {"warehouse": f"Test Warehouse {session_type}", "type": session_type}
        response = await async_client.post(
            "/api/sessions/", json=payload, headers=authenticated_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == session_type
