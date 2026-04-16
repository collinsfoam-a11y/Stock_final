import pytest

from backend.services import mdns_service


@pytest.mark.asyncio
async def test_register_is_noop_when_zeroconf_dependency_is_missing(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(mdns_service, "Zeroconf", None)
    monkeypatch.setattr(mdns_service, "ServiceInfo", None)

    service = mdns_service.MDNSService(port=8002)

    await service.register()
    await service.unregister()

    assert service.zeroconf is None
    assert service.info is None
