"""
Route surface snapshot.

Mobile clients queue offline mutations keyed by path, so an unnoticed path
change corrupts the queue on flush. This test pins the API surface and fails
on any unintended drift.
"""

import json
import os
from pathlib import Path

import pytest
from fastapi.routing import APIRoute

from backend.app_factory import app

SNAPSHOT_PATH = Path(__file__).parent / "snapshots" / "route_baseline.json"

# The SPA catch-all is registered by register_static_serving() only when
# frontend/dist exists, so including it would make this test pass or fail
# depending on whether the frontend happens to be built. It is a static
# fallback, not part of the API surface.
EXCLUDED_PATHS = {"/{full_path:path}"}


def _current_routes() -> list[dict]:
    routes = [
        {
            "path": route.path,
            "name": route.name,
            "methods": sorted(route.methods),
        }
        for route in app.routes
        if isinstance(route, APIRoute) and route.path not in EXCLUDED_PATHS
    ]
    routes.sort(key=lambda r: (r["path"], r["name"]))
    return routes


def _write_snapshot(routes: list[dict]) -> None:
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(routes, indent=2) + "\n")


def test_route_snapshot():
    routes = _current_routes()

    if os.environ.get("UPDATE_SNAPSHOTS") == "1":
        _write_snapshot(routes)
        pytest.skip(f"Regenerated route snapshot at {SNAPSHOT_PATH}")

    # Never self-generate on a missing baseline. Doing so made the gate pass
    # silently wherever the file was absent, which is exactly when it matters.
    assert SNAPSHOT_PATH.exists(), (
        f"Route baseline missing at {SNAPSHOT_PATH}. "
        "It must be committed. Regenerate with UPDATE_SNAPSHOTS=1."
    )

    baseline = json.loads(SNAPSHOT_PATH.read_text())

    current_keys = {(r["path"], r["name"], tuple(r["methods"])) for r in routes}
    baseline_keys = {(r["path"], r["name"], tuple(r["methods"])) for r in baseline}

    added = sorted(current_keys - baseline_keys)
    removed = sorted(baseline_keys - current_keys)

    assert not added and not removed, (
        "Route surface changed. If intentional, rerun with UPDATE_SNAPSHOTS=1.\n"
        f"Added ({len(added)}): {added}\n"
        f"Removed ({len(removed)}): {removed}"
    )
