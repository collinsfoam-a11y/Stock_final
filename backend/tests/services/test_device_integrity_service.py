import base64
import json

import pytest
from starlette.requests import Request

from backend.exceptions import AuthorizationError
from backend.services.device_integrity_service import (
    enforce_device_integrity,
    parse_device_integrity_header,
)


def _make_request(headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode("utf-8"), v.encode("utf-8")) for k, v in headers.items()],
        "query_string": b"",
        "client": ("testclient", 1234),
    }
    return Request(scope)


def _b64url_json(payload: dict) -> str:
    raw = json.dumps(payload).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def test_parse_device_integrity_header_accepts_json():
    payload = {"status": "TRUSTED", "signals": [], "checked_at": "2026-06-01T00:00:00Z"}
    parsed = parse_device_integrity_header(json.dumps(payload), header_max_bytes=2048)
    assert parsed == payload


def test_parse_device_integrity_header_accepts_base64url():
    payload = {
        "status": "UNTRUSTED",
        "signals": ["DEV_BUILD"],
        "checked_at": "2026-06-01T00:00:00Z",
    }
    parsed = parse_device_integrity_header(_b64url_json(payload), header_max_bytes=2048)
    assert parsed == payload


def test_parse_device_integrity_header_rejects_oversize():
    payload = {"status": "TRUSTED", "signals": ["x" * 5000], "checked_at": "2026-06-01T00:00:00Z"}
    with pytest.raises(AuthorizationError) as exc:
        parse_device_integrity_header(json.dumps(payload), header_max_bytes=256)
    assert exc.value.status_code == 403


def test_enforce_device_integrity_required_blocks_missing(monkeypatch: pytest.MonkeyPatch):
    from backend.services import device_integrity_service as svc

    monkeypatch.setattr(
        svc,
        "_get_policy",
        lambda: svc.DeviceIntegrityPolicy(
            required=True, block_untrusted=False, header_max_bytes=2048
        ),
    )

    with pytest.raises(AuthorizationError):
        enforce_device_integrity(_make_request({}))


def test_enforce_device_integrity_blocks_untrusted_when_enabled(monkeypatch: pytest.MonkeyPatch):
    from backend.services import device_integrity_service as svc

    monkeypatch.setattr(
        svc,
        "_get_policy",
        lambda: svc.DeviceIntegrityPolicy(
            required=False, block_untrusted=True, header_max_bytes=2048
        ),
    )

    header = json.dumps(
        {"status": "UNTRUSTED", "signals": ["DEV_BUILD"], "checked_at": "2026-06-01T00:00:00Z"}
    )
    with pytest.raises(AuthorizationError) as exc:
        enforce_device_integrity(_make_request({"X-Device-Integrity": header}))
    assert exc.value.status_code == 403


def test_enforce_device_integrity_allows_trusted(monkeypatch: pytest.MonkeyPatch):
    from backend.services import device_integrity_service as svc

    monkeypatch.setattr(
        svc,
        "_get_policy",
        lambda: svc.DeviceIntegrityPolicy(
            required=True, block_untrusted=True, header_max_bytes=2048
        ),
    )

    header = json.dumps({"status": "TRUSTED", "signals": [], "checked_at": "2026-06-01T00:00:00Z"})
    payload = enforce_device_integrity(_make_request({"X-Device-Integrity": header}))
    assert payload and payload["status"] == "TRUSTED"
