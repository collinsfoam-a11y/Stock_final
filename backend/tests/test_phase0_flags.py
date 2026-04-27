from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.services.feature_flags import (
    BL_V2_COMPARE,
    BL_V2_ENFORCE_WRITES,
    BL_V2_GLOBAL_DISABLE,
    BL_V2_SHADOW,
    FeatureState,
)
from backend.services.flag_resolver import (
    FlagResolutionError,
    is_global_disable_active,
    resolve_phase0_flags,
)
from backend.services.logic_guard import RequestContext, resolve_and_enforce_logic


def _request_context(**overrides) -> RequestContext:
    data = {
        "request_id": "req-1",
        "session_id": "sess-1",
        "user_id": "staff1",
        "username": "staff1",
        "role": "staff",
        "warehouse": "WH-1",
        "endpoint_name": "test_phase0_flags",
        "operation_name": "mutation",
    }
    data.update(overrides)
    return RequestContext(**data)


async def _insert_flag(
    test_db,
    key: str,
    *,
    state: FeatureState = FeatureState.DISABLED,
    scope_overrides: dict[str, dict[str, bool]] | None = None,
) -> None:
    await test_db["feature_flags"].insert_one(
        {
            "key": key,
            "name": key,
            "state": state.value,
            "enabled": state == FeatureState.ENABLED,
            "scope_overrides": scope_overrides or {},
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )


@pytest.mark.asyncio
async def test_global_disable_forces_legacy_runtime_without_losing_scope(test_db):
    await _insert_flag(
        test_db,
        BL_V2_COMPARE,
        state=FeatureState.DISABLED,
        scope_overrides={"warehouse": {"WH-1": True}},
    )
    await _insert_flag(test_db, BL_V2_GLOBAL_DISABLE, state=FeatureState.ENABLED)

    context = await resolve_and_enforce_logic(
        session=None,
        request_context=_request_context(),
        is_mutation=True,
        db=test_db,
    )

    assert context.logic_version == "v1"
    assert context.pin_logic_version == "v1"
    assert context.scope_source == "warehouse"
    assert context.pin_scope_source == "warehouse"
    assert context.is_kill_switch_active is True


@pytest.mark.asyncio
async def test_resolver_uses_stable_scope_and_ignores_request_for_mutations(test_db):
    await _insert_flag(
        test_db,
        BL_V2_COMPARE,
        state=FeatureState.DISABLED,
        scope_overrides={
            "request": {"req-1": False},
            "warehouse": {"WH-1": True},
        },
    )

    resolved = await resolve_phase0_flags(
        request_context=_request_context(),
        is_mutation=True,
        db=test_db,
    )

    assert resolved.compare is True
    assert resolved.shadow is False
    assert resolved.enforce_writes is False
    assert resolved.scope == "warehouse"


@pytest.mark.asyncio
async def test_resolver_supports_user_scope(test_db):
    await _insert_flag(
        test_db,
        BL_V2_COMPARE,
        state=FeatureState.DISABLED,
        scope_overrides={"user": {"staff1": True}},
    )

    resolved = await resolve_phase0_flags(
        request_context=_request_context(),
        is_mutation=True,
        db=test_db,
    )

    assert resolved.compare is True
    assert resolved.scope == "user"


@pytest.mark.asyncio
async def test_invalid_flag_combinations_are_rejected(test_db):
    await _insert_flag(test_db, BL_V2_COMPARE, state=FeatureState.DISABLED)
    await _insert_flag(test_db, BL_V2_SHADOW, state=FeatureState.ENABLED)

    with pytest.raises(FlagResolutionError, match="shadow requires compare"):
        await resolve_phase0_flags(
            request_context=_request_context(),
            is_mutation=True,
            db=test_db,
        )


@pytest.mark.asyncio
async def test_global_disable_must_be_global_boolean(test_db):
    await _insert_flag(test_db, BL_V2_GLOBAL_DISABLE, state=FeatureState.ROLES)

    with pytest.raises(
        FlagResolutionError,
        match="BL_V2_GLOBAL_DISABLE must be globally enabled or disabled",
    ):
        await is_global_disable_active(request_context=_request_context(), db=test_db)


@pytest.mark.asyncio
async def test_reserved_flags_can_resolve_v2_pin_without_enabling_canonical_logic(test_db):
    await _insert_flag(test_db, BL_V2_COMPARE, state=FeatureState.ENABLED)
    await _insert_flag(test_db, BL_V2_SHADOW, state=FeatureState.ENABLED)
    await _insert_flag(test_db, BL_V2_ENFORCE_WRITES, state=FeatureState.ENABLED)

    context = await resolve_and_enforce_logic(
        session=None,
        request_context=_request_context(),
        is_mutation=True,
        db=test_db,
    )

    assert context.logic_version == "v2"
    assert context.pin_logic_version == "v2"
    assert context.is_kill_switch_active is False
