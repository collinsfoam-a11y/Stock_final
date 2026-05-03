from types import SimpleNamespace

import pytest

from backend.services import flag_resolver


class _BoolExplodingDb:
    def __bool__(self) -> bool:
        raise NotImplementedError("Database objects do not implement truth value testing")


@pytest.mark.asyncio
async def test_resolve_phase0_flags_does_not_bool_check_db(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_load_phase0_flags(_db):
        return {
            flag_resolver.BL_V2_GLOBAL_DISABLE: None,
            flag_resolver.BL_V2_COMPARE: None,
            flag_resolver.BL_V2_SHADOW: None,
            flag_resolver.BL_V2_ENFORCE_WRITES: None,
        }

    monkeypatch.setattr(flag_resolver, "_load_phase0_flags", _fake_load_phase0_flags)

    context = SimpleNamespace(
        request_id="req-1",
        session_id="sess-1",
        user_id="staff-1",
        username="staff-1",
        role="staff",
        warehouse="W1",
    )
    resolved = await flag_resolver.resolve_phase0_flags(
        request_context=context,
        is_mutation=True,
        db=_BoolExplodingDb(),
    )

    assert resolved.compare is False
    assert resolved.shadow is False
    assert resolved.enforce_writes is False
    assert resolved.scope == "global"


@pytest.mark.asyncio
async def test_is_global_disable_active_does_not_bool_check_db(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_load_flag(_db, _key):
        return None

    monkeypatch.setattr(flag_resolver, "_load_flag", _fake_load_flag)

    context = SimpleNamespace(
        request_id="req-2",
        session_id="sess-2",
        user_id="staff-2",
        username="staff-2",
        role="staff",
        warehouse="W2",
    )
    assert (
        await flag_resolver.is_global_disable_active(
            request_context=context,
            db=_BoolExplodingDb(),
        )
        is False
    )
