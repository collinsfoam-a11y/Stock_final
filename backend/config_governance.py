"""
Governance Configuration
Centralized controls for SQL Verification policy enforcement.
"""

import os
from typing import Any


def _env_bool(key: str, default: bool) -> bool:
    """Safely parse boolean environment variables"""
    val = os.getenv(key)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


# Runtime Governance Toggles
# Set these via environment variables or control plane to adjust policy without code changes.

SQL_VERIFY_STRICT = _env_bool("SQL_VERIFY_STRICT", True)

# Maximum allowed variance before auto-rejection in strict mode
# Capped at 100,000 to prevent accidental disabling of safety
SQL_MAX_VARIANCE = max(0, min(int(os.getenv("SQL_MAX_VARIANCE", "10000")), 100000))

# Maximum acceptable SQL latency in ms (warning threshold)
# Capped at 60s to prevent complete timeout blindness
SQL_MAX_LATENCY_MS = max(100, min(int(os.getenv("SQL_MAX_LATENCY_MS", "5000")), 60000))

# Audit Fingerprint - Include in all compliance logs
GOVERNANCE_FINGERPRINT: dict[str, Any] = {
    "strict": SQL_VERIFY_STRICT,
    "max_variance": SQL_MAX_VARIANCE,
    "max_latency_ms": SQL_MAX_LATENCY_MS,
}
