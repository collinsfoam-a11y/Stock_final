"""Regression tests for ``require_permissions`` in backend.auth.dependencies.

``require_permissions`` previously evaluated ``current_user["permissions"]``
directly. That raw array holds only *custom* grants, so the checker diverged
from ``backend.auth.permissions.get_user_permissions`` — the module that owns
the permission model — in two directions:

  a) role grants were ignored, so a supervisor (whose permissions come from
     ROLE_PERMISSIONS, not from the user document) was denied endpoints their
     role explicitly allows;
  b) ``disabled_permissions`` was ignored, so a revoked custom grant still
     opened the endpoint.

These tests pin both directions plus the surrounding behaviour.
"""

import pytest
from fastapi import HTTPException

from backend.auth.dependencies import require_permissions
from backend.auth.permissions import Permission


async def _check(user: dict, required: list) -> dict:
    """Invoke the dependency's inner checker directly with a user document."""
    return await require_permissions(required)(current_user=user)


# --- (a) role grants must be honoured -------------------------------------


@pytest.mark.asyncio
async def test_supervisor_granted_via_role_with_empty_permissions_array():
    """ROLE_PERMISSIONS['supervisor'] includes ERROR_LOG_READ.

    Users are created with ``permissions: []`` and nothing ever seeds that
    array, so this is the ordinary supervisor case — not an edge case.
    """
    user = {"username": "sup1", "role": "supervisor", "permissions": []}

    assert await _check(user, [Permission.ERROR_LOG_READ]) is user


@pytest.mark.asyncio
async def test_supervisor_granted_activity_log_read_via_role():
    user = {"username": "sup1", "role": "supervisor", "permissions": []}

    assert await _check(user, [Permission.ACTIVITY_LOG_READ]) is user


@pytest.mark.asyncio
async def test_staff_denied_permission_not_in_role():
    """staff has no ERROR_LOG_READ in ROLE_PERMISSIONS."""
    user = {"username": "staff1", "role": "staff", "permissions": []}

    with pytest.raises(HTTPException) as exc:
        await _check(user, [Permission.ERROR_LOG_READ])
    assert exc.value.status_code == 403
    assert Permission.ERROR_LOG_READ.value in exc.value.detail["missing_permissions"]


# --- (b) revocation must be honoured --------------------------------------


@pytest.mark.asyncio
async def test_disabled_permission_revokes_custom_grant():
    """A custom grant that has since been disabled must not open the endpoint."""
    user = {
        "username": "sup1",
        "role": "staff",
        "permissions": [Permission.ERROR_LOG_READ.value],
        "disabled_permissions": [Permission.ERROR_LOG_READ.value],
    }

    with pytest.raises(HTTPException) as exc:
        await _check(user, [Permission.ERROR_LOG_READ])
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_disabled_permission_revokes_role_grant():
    """Revocation must also override a permission inherited from the role."""
    user = {
        "username": "sup1",
        "role": "supervisor",
        "permissions": [],
        "disabled_permissions": [Permission.ERROR_LOG_READ.value],
    }

    with pytest.raises(HTTPException) as exc:
        await _check(user, [Permission.ERROR_LOG_READ])
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_custom_grant_still_works_when_not_disabled():
    user = {
        "username": "staff1",
        "role": "staff",
        "permissions": [Permission.ERROR_LOG_READ.value],
    }

    assert await _check(user, [Permission.ERROR_LOG_READ]) is user


# --- admin behaviour -------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_granted_everything_by_role():
    user = {"username": "admin1", "role": "admin", "permissions": []}

    assert await _check(user, [Permission.ERROR_LOG_READ]) is user


@pytest.mark.asyncio
async def test_admin_respects_disabled_permissions():
    """Behaviour change: the old admin short-circuit ignored revocation.

    PermissionChecker in permissions.py has always honoured
    disabled_permissions for admins; require_permissions now matches it.
    """
    user = {
        "username": "admin1",
        "role": "admin",
        "permissions": [],
        "disabled_permissions": [Permission.ERROR_LOG_READ.value],
    }

    with pytest.raises(HTTPException) as exc:
        await _check(user, [Permission.ERROR_LOG_READ])
    assert exc.value.status_code == 403


# --- input handling --------------------------------------------------------


@pytest.mark.asyncio
async def test_accepts_raw_permission_strings():
    """Call sites may pass plain strings rather than Permission members."""
    user = {"username": "sup1", "role": "supervisor", "permissions": []}

    assert await _check(user, ["error_log.read"]) is user


@pytest.mark.asyncio
async def test_requires_all_listed_permissions():
    user = {"username": "sup1", "role": "supervisor", "permissions": []}

    with pytest.raises(HTTPException) as exc:
        await _check(user, [Permission.ERROR_LOG_READ, Permission.USER_MANAGE])
    assert exc.value.detail["missing_permissions"] == [Permission.USER_MANAGE.value]


@pytest.mark.asyncio
async def test_error_detail_reports_normalised_strings():
    """required_permissions must serialise as plain strings, not enum reprs."""
    user = {"username": "staff1", "role": "staff", "permissions": []}

    with pytest.raises(HTTPException) as exc:
        await _check(user, [Permission.ERROR_LOG_READ])
    assert exc.value.detail["required_permissions"] == ["error_log.read"]
