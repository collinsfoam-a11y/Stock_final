"""Shared MongoDB client option helpers."""

from __future__ import annotations

import os
from typing import Any

from backend.config import settings


def _env_int(name: str, default: int, *, minimum: int = 0) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return max(int(getattr(settings, name, default) or default), minimum)
    try:
        return max(int(raw), minimum)
    except ValueError:
        return default


def build_mongo_client_options() -> dict[str, Any]:
    """Return Motor client options sized from runtime configuration.

    Defaults stay conservative for a long-running API, while allowing deployment
    manifests to cap total connections based on workers, replicas, and cluster
    limits.
    """
    env = str(getattr(settings, "ENVIRONMENT", "development")).lower()
    max_concurrent = int(getattr(settings, "MAX_CONCURRENT", 50) or 50)
    default_max_pool_size = min(max(max_concurrent + 10, 20), 100)
    default_min_pool_size = 0 if env in {"development", "test"} else min(5, default_max_pool_size)

    return {
        "maxPoolSize": _env_int("MONGO_MAX_POOL_SIZE", default_max_pool_size, minimum=1),
        "minPoolSize": _env_int("MONGO_MIN_POOL_SIZE", default_min_pool_size, minimum=0),
        "maxIdleTimeMS": _env_int("MONGO_MAX_IDLE_TIME_MS", 300000, minimum=1000),
        "serverSelectionTimeoutMS": _env_int(
            "MONGO_SERVER_SELECTION_TIMEOUT_MS",
            5000,
            minimum=1000,
        ),
        "connectTimeoutMS": _env_int("MONGO_CONNECT_TIMEOUT_MS", 10000, minimum=1000),
        "socketTimeoutMS": _env_int("MONGO_SOCKET_TIMEOUT_MS", 30000, minimum=1000),
        "retryWrites": str(getattr(settings, "MONGO_RETRY_WRITES", True)).strip().lower()
        not in {"0", "false", "no", "off"},
        "retryReads": str(getattr(settings, "MONGO_RETRY_READS", True)).strip().lower()
        not in {"0", "false", "no", "off"},
    }


def mongo_transactions_required() -> bool:
    env = str(getattr(settings, "ENVIRONMENT", "development")).lower()
    raw = os.getenv("MONGO_REQUIRE_TRANSACTIONS")
    if raw is None:
        configured = getattr(settings, "MONGO_REQUIRE_TRANSACTIONS", None)
        if configured is not None:
            return bool(configured)
        return env in {"production", "staging"}
    return raw.strip().lower() in {"1", "true", "yes", "on"}
