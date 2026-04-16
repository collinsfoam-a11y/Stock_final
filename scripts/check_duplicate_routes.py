#!/usr/bin/env python3
"""Fail when duplicate route path+method signatures are registered."""

from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _load_app():
    os.environ.setdefault("JWT_SECRET", "ci-duplicate-route-check-secret-32chars")
    os.environ.setdefault("JWT_REFRESH_SECRET", "ci-duplicate-route-check-refresh-32")
    os.environ.setdefault("ENVIRONMENT", "development")
    os.environ.setdefault("DEBUG", "false")

    from backend.server import app  # noqa: WPS433

    return app


def main() -> int:
    app = _load_app()

    signatures: list[tuple[str, tuple[str, ...]]] = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = sorted(
            m for m in (getattr(route, "methods", set()) or set()) if m not in {"HEAD", "OPTIONS"}
        )
        if not methods:
            methods = ["WS"]
        if path:
            signatures.append((path, tuple(methods)))

    counts = Counter(signatures)
    duplicates = sorted(
        (path, methods, count) for (path, methods), count in counts.items() if count > 1
    )

    if duplicates:
        print("Duplicate route registrations detected:")
        for path, methods, count in duplicates:
            print(f"- {path} {list(methods)} x{count}")
        return 1

    print(f"No duplicate route registrations detected ({len(counts)} unique signatures).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
