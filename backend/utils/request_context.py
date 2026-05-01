"""Request context helpers for API observability."""

from __future__ import annotations

import uuid
import re
from typing import Any


def sanitize_request_id(value: Any) -> str:
    if not value:
        return str(uuid.uuid4())

    sanitized = re.sub(r"[^a-zA-Z0-9\-_.]", "", str(value))
    return sanitized[:64] or str(uuid.uuid4())


def get_request_id(headers: Any) -> str:
    return sanitize_request_id(headers.get("X-Request-ID"))
