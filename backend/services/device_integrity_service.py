import base64
import json
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Request

from backend.config import settings
from backend.exceptions import AuthorizationError


@dataclass(frozen=True)
class DeviceIntegrityPolicy:
    required: bool
    block_untrusted: bool
    header_max_bytes: int


def _get_policy() -> DeviceIntegrityPolicy:
    required = bool(getattr(settings, "DEVICE_INTEGRITY_REQUIRED", False))
    block_untrusted = bool(getattr(settings, "DEVICE_INTEGRITY_BLOCK_UNTRUSTED", False))
    header_max_bytes = int(getattr(settings, "DEVICE_INTEGRITY_HEADER_MAX_BYTES", 2048))
    return DeviceIntegrityPolicy(
        required=required,
        block_untrusted=block_untrusted,
        header_max_bytes=header_max_bytes,
    )


def _decode_base64url(value: str) -> str:
    normalized = value.strip()
    padding = "=" * (-len(normalized) % 4)
    decoded_bytes = base64.urlsafe_b64decode((normalized + padding).encode("utf-8"))
    return decoded_bytes.decode("utf-8")


def parse_device_integrity_header(
    header_value: Optional[str],
    *,
    header_max_bytes: int,
) -> Optional[dict[str, Any]]:
    if not header_value:
        return None

    raw = str(header_value).strip()
    if not raw:
        return None

    if len(raw.encode("utf-8")) > header_max_bytes:
        raise AuthorizationError(
            "Device integrity header is too large",
            details={"code": "DEVICE_INTEGRITY_HEADER_TOO_LARGE"},
        )

    try:
        payload = json.loads(raw) if raw.startswith("{") else json.loads(_decode_base64url(raw))
    except Exception as exc:
        raise AuthorizationError(
            "Invalid device integrity header",
            details={"code": "DEVICE_INTEGRITY_INVALID", "error": str(exc)},
        ) from exc

    if not isinstance(payload, dict):
        raise AuthorizationError(
            "Invalid device integrity payload",
            details={"code": "DEVICE_INTEGRITY_INVALID"},
        )

    return payload  # type: ignore[return-value]


def enforce_device_integrity(request: Request) -> Optional[dict[str, Any]]:
    policy = _get_policy()
    header_value = request.headers.get("x-device-integrity")
    payload = parse_device_integrity_header(header_value, header_max_bytes=policy.header_max_bytes)

    if policy.required and not payload:
        raise AuthorizationError(
            "Device integrity verification is required",
            details={"code": "DEVICE_INTEGRITY_REQUIRED"},
        )

    if not payload:
        return None

    status = payload.get("status")
    normalized_status = str(status).strip().upper() if status is not None else "UNKNOWN"

    if policy.required and normalized_status != "TRUSTED":
        raise AuthorizationError(
            "Device is not trusted",
            details={"code": "DEVICE_NOT_TRUSTED", "status": normalized_status},
        )

    if policy.block_untrusted and normalized_status == "UNTRUSTED":
        raise AuthorizationError(
            "Device is not trusted",
            details={"code": "DEVICE_NOT_TRUSTED", "status": normalized_status},
        )

    return payload
