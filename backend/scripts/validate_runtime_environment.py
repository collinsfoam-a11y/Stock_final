"""Fail-fast runtime environment validation helper.

Checks:
- required environment variables
- CORS configuration safety
- MongoDB connectivity + replica-set capability for transactions
"""

from __future__ import annotations

import json
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

from backend.utils.env_validation import get_env_summary, validate_environment


def main() -> int:
    try:
        validate_environment()
    except ValueError as exc:
        print("RUNTIME_ENV_VALIDATION_FAILED")
        print(str(exc))
        return 1

    print("RUNTIME_ENV_VALIDATION_OK")
    print(json.dumps(get_env_summary(), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
