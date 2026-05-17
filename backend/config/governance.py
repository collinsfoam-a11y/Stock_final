"""
Deprecated module wrapper.

The canonical governance configuration lives in backend/config_governance.py.
This file re-exports those values to avoid drift, but should not be used for new imports.
"""

from backend.config_governance import (  # noqa: F401
    GOVERNANCE_FINGERPRINT,
    SQL_MAX_LATENCY_MS,
    SQL_MAX_VARIANCE,
    SQL_VERIFY_STRICT,
)

__all__ = [
    "GOVERNANCE_FINGERPRINT",
    "SQL_MAX_LATENCY_MS",
    "SQL_MAX_VARIANCE",
    "SQL_VERIFY_STRICT",
]

import os


def _env_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


# ==============================================================================
# Feature Flags (Kill Switches)
# ==============================================================================
# Default to FALSE for maximum safety. Enable via env var only when needed.

# Allow Sync Service to write to SQL Sync Status (but NEVER verified_qty)
ENABLE_SQL_SYNC_WRITE = _env_bool("ENABLE_SQL_SYNC_WRITE", False)

# Allow any form of automatic verification (e.g. precise match auto-verify)
ENABLE_AUTO_VERIFICATION = _env_bool("ENABLE_AUTO_VERIFICATION", False)

# Allow system to auto-resolve conflicts (e.g. trust newer timestamp)
ENABLE_CONFLICT_AUTO_RESOLUTION = _env_bool("ENABLE_CONFLICT_AUTO_RESOLUTION", False)

GOVERNANCE_FINGERPRINT.update(
    {
        "flags": {
            "sync_write": ENABLE_SQL_SYNC_WRITE,
            "auto_verify": ENABLE_AUTO_VERIFICATION,
            "conflict_resolve": ENABLE_CONFLICT_AUTO_RESOLUTION,
        }
    }
)
