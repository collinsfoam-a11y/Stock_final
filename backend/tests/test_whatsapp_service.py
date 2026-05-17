import pytest

from backend.services.whatsapp_service import WhatsAppDeliveryError, WhatsAppService


class _FakeResponse:
    def __init__(self, status_code: int = 200, payload: str = "ok"):
        self.status_code = status_code
        self.text = payload


class _FakeAsyncClient:
    def __init__(self, response: _FakeResponse, recorder: dict):
        self._response = response
        self._recorder = recorder

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, auth=None, data=None):
        self._recorder["url"] = url
        self._recorder["auth"] = auth
        self._recorder["data"] = data
        return self._response


@pytest.mark.asyncio
async def test_whatsapp_service_disabled_by_default():
    service = WhatsAppService(config={})

    assert service.is_delivery_configured() is False
    with pytest.raises(WhatsAppDeliveryError):
        await service.send_otp("+919999999999", "123456")


@pytest.mark.asyncio
async def test_whatsapp_service_mock_provider_returns_success():
    service = WhatsAppService(config={"WHATSAPP_PROVIDER": "mock"})

    assert service.is_delivery_configured() is True
    assert await service.send_otp("+919999999999", "123456") is True


@pytest.mark.asyncio
async def test_whatsapp_service_twilio_posts_expected_payload(monkeypatch: pytest.MonkeyPatch):
    recorder = {}

    def fake_async_client(*args, **kwargs):
        return _FakeAsyncClient(_FakeResponse(), recorder)

    monkeypatch.setattr("backend.services.whatsapp_service.httpx.AsyncClient", fake_async_client)

    service = WhatsAppService(
        config={
            "WHATSAPP_PROVIDER": "twilio",
            "TWILIO_ACCOUNT_SID": "AC123",
            "TWILIO_AUTH_TOKEN": "secret",
            "TWILIO_WHATSAPP_FROM": "+14155238886",
        }
    )

    assert await service.send_password_reset_confirmation("+919999999999") is True
    assert recorder["url"].endswith("/Accounts/AC123/Messages.json")
    assert recorder["auth"] == ("AC123", "secret")
    assert recorder["data"]["From"] == "whatsapp:+14155238886"
    assert recorder["data"]["To"] == "whatsapp:+919999999999"
